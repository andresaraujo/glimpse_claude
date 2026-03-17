#!/usr/bin/env node
import { createServer } from 'node:net';
import { unlinkSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';
import {
  DAEMON_LOCK_FILE,
  PID_FILE,
  SOCKET_PATH,
  acquirePidLock,
  projectNameFromPath,
  removeFileIfExists,
  writePidFile,
} from './lib/runtime.mjs';
import { importGlimpse } from './lib/glimpse-resolver.mjs';

const daemonLock = acquirePidLock(DAEMON_LOCK_FILE);
if (!daemonLock.acquired) {
  process.exit(0);
}

const { open } = await importGlimpse();

const STATUS_COLOR = {
  starting: '#22C55E',
  working: '#F59E0B',
  reading: '#3B82F6',
  editing: '#FACC15',
  running: '#F97316',
  searching: '#8B5CF6',
  done: '#22C55E',
  error: '#EF4444',
};

const STATUS_LABEL = {
  starting: 'Starting',
  working: 'Working',
  reading: 'Reading',
  editing: 'Editing',
  running: 'Running',
  searching: 'Searching',
  done: 'Done',
  error: 'Error',
};

function truncate(value, max = 60) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: transparent !important;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 600;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100vh;
}
#pill {
  width: fit-content;
  min-width: 240px;
  background: rgba(0,0,0,0.45);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  padding: 4px 0;
  transition: opacity 0.25s ease-out;
}
.row { display: flex; flex-direction: column; }
.row-main, .row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
}
.row-main { padding-top: 3px; }
.row-meta {
  padding-bottom: 5px;
  padding-left: 24px;
  color: rgba(255,255,255,0.8);
  font-size: 10px;
  font-weight: 500;
  font-family: ui-monospace, 'SF Mono', monospace;
}
.row.subagent .row-main, .row.subagent .row-meta {
  padding-left: 28px;
}
.row + .row { border-top: 1px solid rgba(255,255,255,0.08); margin-top: 3px; }
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.project { color: rgba(255,255,255,0.96); font-weight: 600; }
.subagent-label { color: rgba(255,255,255,0.85); font-weight: 500; }
.sep { color: rgba(255,255,255,0.45); }
.status { color: rgba(255,255,255,0.92); }
.detail {
  color: rgba(255,255,255,0.72);
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 10px;
  white-space: nowrap;
}
.meta-sep { color: rgba(255,255,255,0.4); }
</style>
</head>
<body>
<div id="pill"></div>
<script>
const rows = new Map();
let tick = null;

function fmtElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return totalSeconds + 's';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
}

function updateRow(payload) {
  rows.set(payload.id, payload);
  render();
  ensureTick();
}

function removeRow(id) {
  rows.delete(id);
  render();
}

function clearAll() {
  rows.clear();
  render();
}

function ensureTick() {
  if (tick) return;
  tick = setInterval(render, 1000);
}

function render() {
  const pill = document.getElementById('pill');
  if (rows.size === 0) {
    pill.style.opacity = '0';
    pill.innerHTML = '';
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
    return;
  }

  pill.style.opacity = '1';
  const ordered = Array.from(rows.values()).sort((a, b) => {
    if ((a.parentId || '') !== (b.parentId || '')) {
      return (a.parentId || a.id).localeCompare(b.parentId || b.id);
    }
    if (!!a.parentId !== !!b.parentId) return a.parentId ? 1 : -1;
    return (a.index || 0) - (b.index || 0);
  });

  pill.innerHTML = ordered.map((row) => {
    const meta = [];
    if (row.contextPercent != null) meta.push(row.contextPercent + '%');
    if (row.startedAt) meta.push(fmtElapsed(Date.now() - row.startedAt));
    if (!row.parentId && row.model) meta.push(row.model);
    const projectLabel = row.parentId
      ? '<span class="subagent-label">↳ ' + row.project + '</span>'
      : '<span class="project">' + row.project + '</span>';
    const detail = row.detail ? '<span class="detail">' + row.detail + '</span>' : '';
    const metaHtml = meta.map((part) => '<span>' + part + '</span>').join('<span class="meta-sep">·</span>');
    return '<div class="row ' + (row.parentId ? 'subagent' : 'session') + '">' +
      '<div class="row-main">' +
        '<span class="dot" style="background:' + row.color + '"></span>' +
        projectLabel +
        '<span class="sep">·</span>' +
        '<span class="status">' + row.label + '</span>' +
        (detail ? '<span class="sep">·</span>' + detail : '') +
      '</div>' +
      '<div class="row-meta">' + metaHtml + '</div>' +
    '</div>';
  }).join('');
}
</script>
</body>
</html>`;
}

const rows = new Map();
const removalTimers = new Map();
let idleTimer = null;
let winReady = false;
const pending = [];

function rowKey(message) {
  if (message.type?.startsWith('subagent')) return `${message.sessionId}:sub:${message.subagentId}`;
  return `${message.sessionId}`;
}

function toUiPayload(key, row, index = 0) {
  return {
    id: key,
    parentId: row.parentId || null,
    project: escapeHtml(row.project),
    label: STATUS_LABEL[row.status] || 'Working',
    detail: escapeHtml(truncate(row.detail || '', 64)),
    color: STATUS_COLOR[row.status] || STATUS_COLOR.working,
    contextPercent: row.contextPercent ?? null,
    startedAt: row.startedAt,
    model: row.model || null,
    index,
  };
}

function sendJs(js) {
  if (winReady) win.send(js);
  else pending.push(js);
}

function pushRender(key) {
  const row = rows.get(key);
  if (!row) return;
  const keys = Array.from(rows.keys());
  const index = keys.indexOf(key);
  const payload = toUiPayload(key, row, index);
  sendJs(`updateRow(${JSON.stringify(payload)})`);
}

function pushRemove(key) {
  sendJs(`removeRow(${JSON.stringify(key)})`);
}

function clearRemovalTimer(key) {
  const timer = removalTimers.get(key);
  if (timer) clearTimeout(timer);
  removalTimers.delete(key);
}

function scheduleRemoval(key, retainMs = 3500) {
  clearRemovalTimer(key);
  const timer = setTimeout(() => {
    rows.delete(key);
    pushRemove(key);
    removalTimers.delete(key);
    scheduleIdleExit();
  }, retainMs);
  removalTimers.set(key, timer);
}

function scheduleIdleExit() {
  if (idleTimer) clearTimeout(idleTimer);
  if (rows.size > 0) return;
  idleTimer = setTimeout(() => shutdown(), 8000);
}

function upsertRow(message) {
  const key = rowKey(message);
  clearRemovalTimer(key);

  const existing = rows.get(key);
  const parentId = message.type === 'subagent_update' ? message.sessionId : null;
  const startedAt = existing?.startedAt || Date.now();
  const project = message.type === 'subagent_update'
    ? message.label || message.project || 'Subagent'
    : message.project || projectNameFromPath(message.cwd);

  rows.set(key, {
    ...existing,
    key,
    parentId,
    sessionId: message.sessionId,
    project,
    status: message.status || existing?.status || 'working',
    detail: message.detail ?? existing?.detail ?? '',
    contextPercent: message.contextPercent ?? existing?.contextPercent ?? null,
    startedAt,
    model: message.model ?? existing?.model ?? null,
    updatedAt: Date.now(),
  });

  pushRender(key);
  if (message.retainMs) scheduleRemoval(key, message.retainMs);
  if (parentId && !rows.has(parentId)) {
    rows.set(parentId, {
      key: parentId,
      sessionId: message.sessionId,
      project: message.project || 'claude',
      status: 'working',
      detail: '',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      contextPercent: null,
      model: null,
    });
    pushRender(parentId);
  }
}

function removeSession(message) {
  const key = rowKey(message);
  rows.delete(key);
  pushRemove(key);
  for (const [subKey, row] of rows) {
    if (row.parentId === key) {
      rows.delete(subKey);
      pushRemove(subKey);
    }
  }
  scheduleIdleExit();
}

function updateMeta(message) {
  const key = `${message.sessionId}`;
  const existing = rows.get(key);
  const startedAt = existing?.startedAt || Date.now() - (message.elapsedMs ?? 0);
  rows.set(key, {
    key,
    sessionId: message.sessionId,
    project: message.project || existing?.project || projectNameFromPath(message.cwd),
    status: existing?.status || 'working',
    detail: existing?.detail || '',
    startedAt,
    updatedAt: Date.now(),
    contextPercent: message.contextPercent ?? existing?.contextPercent ?? null,
    model: message.model ?? existing?.model ?? null,
  });
  pushRender(key);
}

function handleMessage(message) {
  switch (message.type) {
    case 'session_update':
    case 'subagent_update':
      upsertRow(message);
      break;
    case 'session_remove':
      removeSession(message);
      break;
    case 'meta_update':
      updateMeta(message);
      break;
    case 'control':
      if (message.action === 'clear') {
        rows.clear();
        sendJs('clearAll()');
      }
      if (message.action === 'shutdown') shutdown();
      break;
    default:
      break;
  }
  if (message.type !== 'control') scheduleIdleExit();
}

removeFileIfExists(SOCKET_PATH);
try { unlinkSync(SOCKET_PATH); } catch {}
writePidFile();

const server = createServer((socket) => {
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          handleMessage(JSON.parse(line));
        } catch {}
      }
      newline = buffer.indexOf('\n');
    }
  });
});

server.listen(SOCKET_PATH);

const win = open(buildHtml(), {
  width: 680,
  height: 220,
  frameless: true,
  floating: true,
  transparent: true,
  clickThrough: true,
  followCursor: true,
  followMode: 'spring',
  cursorAnchor: 'top-right',
});

win.on('ready', () => {
  winReady = true;
  for (const js of pending.splice(0)) win.send(js);
});

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const timer of removalTimers.values()) clearTimeout(timer);
  if (idleTimer) clearTimeout(idleTimer);
  try { server.close(); } catch {}
  removeFileIfExists(SOCKET_PATH);
  removeFileIfExists(PID_FILE);
  removeFileIfExists(DAEMON_LOCK_FILE);
  try { win.close(); } catch {}
}

function shutdown() {
  cleanup();
  process.exit(0);
}

win.on('closed', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', cleanup);
