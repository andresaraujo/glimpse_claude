#!/usr/bin/env node
import process from 'node:process';
import {
  GLIMPSE_MISSING_MESSAGE,
  ensureDaemon,
  isEnabled,
  normalizeHookEvent,
  normalizeStatuslinePayload,
  readJsonStdin,
  sendMessage,
} from './lib/runtime.mjs';

async function main() {
  const mode = process.argv[2];
  const payload = await readJsonStdin();

  if (!isEnabled()) {
    if (mode === 'statusline') {
      process.stdout.write('');
    }
    return;
  }

  const message = mode === 'hook'
    ? normalizeHookEvent(payload)
    : mode === 'statusline'
      ? normalizeStatuslinePayload(payload)
      : null;

  if (!message) {
    if (mode === 'statusline') process.stdout.write('');
    return;
  }

  const daemonReady = await ensureDaemon();
  if (!daemonReady) {
    if (mode === 'statusline') process.stdout.write('');
    throw new Error('Could not start Glimpse companion daemon');
  }

  await sendMessage(message);

  if (mode === 'statusline') {
    process.stdout.write('');
  }
}

main().catch((error) => {
  if (process.argv[2] === 'statusline') {
    process.stdout.write('');
    process.exit(0);
  }
  const message = error.message || String(error);
  console.error(message);
  if (message.includes('glimpseui') && message !== GLIMPSE_MISSING_MESSAGE) {
    console.error(GLIMPSE_MISSING_MESSAGE);
  }
  process.exit(1);
});
