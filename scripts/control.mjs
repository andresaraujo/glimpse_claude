#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import {
  CONFIG_FILE,
  ENABLED_FILE,
  PLUGIN_ROOT,
  RUNTIME_DIR,
  SETTINGS_BACKUP_FILE,
  SOCKET_PATH,
  STATUSLINE_SCRIPT,
  canConnectSocket,
  ensureDaemon,
  ensureRuntimeDir,
  isEnabled,
  readConfig,
  readJsonFile,
  removeFileIfExists,
  sendMessage,
  setEnabled,
  shellQuote,
  writeConfig,
  writeJsonFile,
} from './lib/runtime.mjs';

const USER_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

function ensureParentDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function readUserSettings() {
  try {
    return JSON.parse(readFileSync(USER_SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeUserSettings(value) {
  ensureParentDir(USER_SETTINGS_PATH);
  writeFileSync(USER_SETTINGS_PATH, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function desiredStatuslineCommand() {
  return `/bin/bash ${shellQuote(STATUSLINE_SCRIPT)}`;
}

function statuslineInstalled(settings = readUserSettings()) {
  return settings?.statusLine?.command === desiredStatuslineCommand();
}

function installStatusline() {
  ensureRuntimeDir();
  const settings = readUserSettings();
  if (settings.statusLine && !statuslineInstalled(settings) && !existsSync(SETTINGS_BACKUP_FILE)) {
    writeJsonFile(SETTINGS_BACKUP_FILE, settings.statusLine);
  }

  settings.statusLine = {
    type: 'command',
    command: desiredStatuslineCommand(),
    padding: 0,
  };

  writeUserSettings(settings);
  writeConfig({ statuslineInstalledAt: Date.now(), statuslineCommand: desiredStatuslineCommand() });
  return USER_SETTINGS_PATH;
}

function uninstallStatusline() {
  const settings = readUserSettings();
  const backup = readJsonFile(SETTINGS_BACKUP_FILE, null);
  const ours = statuslineInstalled(settings);

  if (backup) {
    settings.statusLine = backup;
    writeUserSettings(settings);
    removeFileIfExists(SETTINGS_BACKUP_FILE);
    return { path: USER_SETTINGS_PATH, restoredBackup: true, removedManagedStatusline: false };
  }

  if (ours) {
    delete settings.statusLine;
    writeUserSettings(settings);
    return { path: USER_SETTINGS_PATH, restoredBackup: false, removedManagedStatusline: true };
  }

  return { path: USER_SETTINGS_PATH, restoredBackup: false, removedManagedStatusline: false };
}

async function turnOn() {
  setEnabled(true);
  writeConfig({ pluginRoot: PLUGIN_ROOT });
  await ensureDaemon();
  console.log(`Glimpse companion enabled. Socket: ${SOCKET_PATH}`);
}

async function turnOff() {
  setEnabled(false);
  try {
    await sendMessage({ type: 'control', action: 'clear' });
    await sendMessage({ type: 'control', action: 'shutdown' });
  } catch {}
  console.log('Glimpse companion disabled.');
}

async function printStatus() {
  const settings = readUserSettings();
  const daemonRunning = await canConnectSocket();
  const enabled = isEnabled();
  const status = {
    enabled,
    daemonRunning,
    socketPath: SOCKET_PATH,
    runtimeDir: RUNTIME_DIR,
    pluginRoot: PLUGIN_ROOT,
    statuslineInstalled: statuslineInstalled(settings),
    statuslineCommand: settings?.statusLine?.command || null,
    backupExists: existsSync(SETTINGS_BACKUP_FILE),
    config: readConfig(),
    enabledStatePath: ENABLED_FILE,
    configPath: CONFIG_FILE,
  };
  console.log(JSON.stringify(status, null, 2));
}

async function main() {
  const action = process.argv[2] || 'status';

  switch (action) {
    case 'on':
      await turnOn();
      break;
    case 'off':
      await turnOff();
      break;
    case 'install':
    case 'install-statusline': {
      const path = installStatusline();
      console.log(`Installed Glimpse companion status line in ${path}`);
      break;
    }
    case 'uninstall': {
      await turnOff();
      const result = uninstallStatusline();
      removeFileIfExists(ENABLED_FILE);
      removeFileIfExists(CONFIG_FILE);
      console.log(`Uninstalled Glimpse companion status line from ${result.path}`);
      if (result.restoredBackup) console.log('Restored previous Claude Code status line configuration.');
      else if (result.removedManagedStatusline) console.log('Removed the Glimpse-managed Claude Code status line configuration.');
      else console.log('No Glimpse-managed status line configuration was installed.');
      break;
    }
    case 'status':
      await printStatus();
      break;
    case 'clear-state':
      removeFileIfExists(SETTINGS_BACKUP_FILE);
      removeFileIfExists(ENABLED_FILE);
      removeFileIfExists(CONFIG_FILE);
      console.log('Cleared Glimpse companion state files.');
      break;
    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
