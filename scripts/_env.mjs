import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function loadEnvFile(filePath) {
  const p = filePath
    ? filePath
    : path.join(os.homedir(), '.openclaw', 'credentials', 'homeassistant-api.env');

  if (!fs.existsSync(p)) {
    throw new Error(`Missing env file: ${p}`);
  }

  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

export function requireKeys(env, keys) {
  for (const k of keys) {
    if (!env[k]) throw new Error(`Missing required env var: ${k}`);
  }
}

export function httpToWs(url) {
  return url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
}
