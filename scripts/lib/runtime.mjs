import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { GLIMPSE_INSTALL_COMMAND, GLIMPSE_MISSING_MESSAGE, isGlimpseInstalled } from './glimpse-resolver.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = resolve(__dirname, '..', '..');
export const RUNTIME_DIR = process.env.CLAUDE_GLIMPSE_HOME || join(homedir(), '.claude', 'glimpse-companion');
export const SOCKET_PATH = process.env.CLAUDE_GLIMPSE_SOCKET || `/tmp/glimpse-companion-${process.getuid?.() ?? 'user'}.sock`;
export const PID_FILE = join(RUNTIME_DIR, 'daemon.pid');
export const DAEMON_LOCK_FILE = join(RUNTIME_DIR, 'daemon.lock');
export const ENABLED_FILE = join(RUNTIME_DIR, 'enabled.json');
export const SETTINGS_BACKUP_FILE = join(RUNTIME_DIR, 'statusline.backup.json');
export const CONFIG_FILE = join(RUNTIME_DIR, 'config.json');
export const DAEMON_PATH = resolve(PLUGIN_ROOT, 'scripts', 'companion-daemon.mjs');
export const STATUSLINE_SCRIPT = resolve(PLUGIN_ROOT, 'scripts', 'statusline.sh');
export { GLIMPSE_INSTALL_COMMAND, GLIMPSE_MISSING_MESSAGE, isGlimpseInstalled };

export function ensureRuntimeDir() {
  mkdirSync(RUNTIME_DIR, { recursive: true });
}

export function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(path, value) {
  ensureRuntimeDir();
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readPidFile(path) {
  try {
    const text = readFileSync(path, 'utf8').trim();
    const pid = Number.parseInt(text, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquirePidLock(path, pid = process.pid) {
  ensureRuntimeDir();

  const tryCreate = () => {
    writeFileSync(path, `${pid}\n`, { encoding: 'utf8', flag: 'wx' });
    return { acquired: true, pid };
  };

  try {
    return tryCreate();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  const existingPid = readPidFile(path);
  if (isProcessAlive(existingPid)) {
    return { acquired: false, pid: existingPid, stale: false };
  }

  removeFileIfExists(path);

  try {
    return { ...tryCreate(), stale: true };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return { acquired: false, pid: readPidFile(path), stale: false };
    }
    throw error;
  }
}

export function isEnabled() {
  const data = readJsonFile(ENABLED_FILE, { enabled: false });
  return data?.enabled === true;
}

export function setEnabled(enabled) {
  writeJsonFile(ENABLED_FILE, {
    enabled,
    updatedAt: Date.now(),
    pluginRoot: PLUGIN_ROOT,
  });
}

export function readConfig() {
  return readJsonFile(CONFIG_FILE, {});
}

export function writeConfig(config) {
  writeJsonFile(CONFIG_FILE, {
    ...readConfig(),
    ...config,
    updatedAt: Date.now(),
  });
}

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJsonStdin() {
  const text = (await readStdin()).trim();
  if (!text) return null;
  return JSON.parse(text);
}

export function projectNameFromPath(cwd) {
  if (!cwd) return 'claude';
  return basename(cwd) || cwd;
}

export function detailFromTool(toolName, toolInput = {}) {
  switch (toolName) {
    case 'Read':
      return basename(toolInput.file_path || toolInput.path || '');
    case 'Write':
    case 'Edit':
      return basename(toolInput.file_path || toolInput.path || '');
    case 'Bash':
      return toolInput.command || toolInput.description || '';
    case 'Grep':
      return toolInput.pattern || toolInput.query || toolInput.path || '';
    case 'Glob':
    case 'LS':
    case 'Find':
      return toolInput.pattern || toolInput.path || '';
    case 'WebSearch':
      return toolInput.query || '';
    case 'WebFetch':
      return toolInput.url || '';
    default:
      if (typeof toolName === 'string' && toolName.startsWith('mcp__')) {
        return toolName;
      }
      return toolInput.description || '';
  }
}

export function statusFromTool(toolName) {
  if (!toolName) return 'working';
  if (toolName === 'Read') return 'reading';
  if (toolName === 'Write' || toolName === 'Edit') return 'editing';
  if (toolName === 'Bash') return 'running';
  if (['Grep', 'Glob', 'LS', 'Find', 'WebSearch', 'WebFetch'].includes(toolName)) return 'searching';
  if (toolName === 'Agent') return 'working';
  if (typeof toolName === 'string' && toolName.startsWith('mcp__')) return 'running';
  return 'working';
}

export function normalizeHookEvent(payload) {
  if (!payload) return null;

  const hookEventName = payload.hook_event_name || payload.hookEventName;
  const sessionId = payload.session_id || payload.sessionId;
  const cwd = payload.cwd || payload.workspace?.current_dir;
  const project = projectNameFromPath(cwd);
  const base = {
    source: 'hook',
    hookEventName,
    sessionId,
    cwd,
    project,
    transcriptPath: payload.transcript_path || payload.transcriptPath,
    timestamp: Date.now(),
  };

  switch (hookEventName) {
    case 'SessionStart':
      return { ...base, type: 'session_update', status: 'starting', detail: '' };
    case 'UserPromptSubmit':
      return { ...base, type: 'session_update', status: 'working', detail: '' };
    case 'PreToolUse': {
      const toolName = payload.tool_name || payload.toolName;
      const toolInput = payload.tool_input || payload.toolInput || {};
      return {
        ...base,
        type: 'session_update',
        status: statusFromTool(toolName),
        detail: detailFromTool(toolName, toolInput),
        toolName,
      };
    }
    case 'PostToolUseFailure': {
      const toolName = payload.tool_name || payload.toolName;
      const detail = payload.error || detailFromTool(toolName, payload.tool_input || payload.toolInput || {});
      return {
        ...base,
        type: 'session_update',
        status: 'error',
        detail,
        toolName,
      };
    }
    case 'Notification': {
      const notificationType = payload.notification_type || payload.notificationType;
      if (notificationType !== 'permission_prompt') return null;
      return {
        ...base,
        type: 'session_update',
        status: 'working',
        detail: payload.title || payload.message || 'Awaiting permission',
        notificationType,
      };
    }
    case 'Stop':
      return {
        ...base,
        type: 'session_update',
        status: 'done',
        detail: '',
        lastAssistantMessage: payload.last_assistant_message || payload.lastAssistantMessage || '',
        retainMs: 4000,
      };
    case 'SessionEnd':
      return { ...base, type: 'session_remove' };
    case 'SubagentStart': {
      const agentId = payload.agent_id || payload.agentId;
      const agentType = payload.agent_type || payload.agentType || 'Subagent';
      return {
        ...base,
        type: 'subagent_update',
        subagentId: agentId,
        status: 'working',
        detail: agentType,
        label: agentType,
      };
    }
    case 'SubagentStop': {
      const agentId = payload.agent_id || payload.agentId;
      const agentType = payload.agent_type || payload.agentType || 'Subagent';
      return {
        ...base,
        type: 'subagent_update',
        subagentId: agentId,
        status: 'done',
        detail: agentType,
        label: agentType,
        retainMs: 3000,
      };
    }
    default:
      return null;
  }
}

export function normalizeStatuslinePayload(payload) {
  if (!payload) return null;
  const sessionId = payload.session_id || payload.sessionId;
  const cwd = payload.cwd || payload.workspace?.current_dir;
  return {
    type: 'meta_update',
    source: 'statusline',
    sessionId,
    cwd,
    project: projectNameFromPath(payload.workspace?.project_dir || cwd),
    contextPercent: payload.context_window?.used_percentage ?? null,
    elapsedMs: payload.cost?.total_duration_ms ?? null,
    model: payload.model?.display_name || payload.model?.id || null,
    totalCostUsd: payload.cost?.total_cost_usd ?? null,
    transcriptPath: payload.transcript_path || payload.transcriptPath,
    timestamp: Date.now(),
  };
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export async function canConnectSocket() {
  return new Promise((resolve) => {
    const socket = createConnection(SOCKET_PATH);
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

export async function waitForSocket(attempts = 20, delayMs = 150) {
  for (let i = 0; i < attempts; i += 1) {
    if (await canConnectSocket()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

export async function ensureDaemon() {
  ensureRuntimeDir();
  if (await canConnectSocket()) return true;
  if (!isGlimpseInstalled()) {
    throw new Error(GLIMPSE_MISSING_MESSAGE);
  }

  const child = spawn(process.execPath, [DAEMON_PATH], {
    cwd: PLUGIN_ROOT,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  const ready = await waitForSocket();
  if (!ready) {
    throw new Error(`Could not start Glimpse companion daemon. Verify ${GLIMPSE_INSTALL_COMMAND} is installed and try again.`);
  }
  return true;
}

export async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCKET_PATH, () => {
      socket.end(`${JSON.stringify(message)}\n`);
      resolve(true);
    });
    socket.once('error', reject);
  });
}

export function removeFileIfExists(path) {
  try {
    rmSync(path, { force: true });
  } catch {}
}

export function writePidFile() {
  ensureRuntimeDir();
  writeFileSync(PID_FILE, `${process.pid}\n`, 'utf8');
}
