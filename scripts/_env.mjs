import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Load environment variables from a file with improved error handling.
 * Supports both homeassistant-api.env and .env formats.
 * @param {string} [filePath] - Path to the env file (optional)
 * @returns {Object} Parsed environment variables
 */
export function loadEnvFile(filePath) {
  // If explicit path given, use it
  if (filePath) {
    return loadEnvFromFile(filePath);
  }

  // Default search paths (in order)
  const defaultPaths = [
    path.join(os.homedir(), '.openclaw', 'credentials', 'homeassistant-api.env'),
    path.join(process.cwd(), '.env'),
  ];

  for (const p of defaultPaths) {
    if (fs.existsSync(p)) {
      return loadEnvFromFile(p);
    }
  }

  console.error('[ERROR] No environment file found. Tried:');
  defaultPaths.forEach(p => console.error(`  ${p}`));
  process.exit(1);
}

/**
 * Internal helper to load from a specific file
 * @param {string} filePath - Path to the env file
 * @returns {Object} Parsed environment variables
 */
function loadEnvFromFile(filePath) {
  try {
    const out = {};
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) {
        console.warn(`[WARN] Skipping invalid line: ${trimmed}`);
        continue;
      }
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      out[k] = v;
    }

    if (Object.keys(out).length === 0) {
      console.error(`[ERROR] No environment variables found in ${filePath}`);
      process.exit(2);
    }

    return out;
  } catch (error) {
    console.error(`[ERROR] Failed to load env file: ${error.message}`);
    process.exit(3);
  }
}

/**
 * Validate required environment variables
 * @param {Object} env - Environment variables object
 * @param {string[]} keys - Required keys
 */
export function requireKeys(env, keys) {
  const missingKeys = keys.filter(k => !env[k]);
  if (missingKeys.length > 0) {
    console.error(`[ERROR] Missing required env vars: ${missingKeys.join(', ')}`);
    process.exit(4);
  }
}

/**
 * Convert HTTP/HTTPS URLs to WebSocket protocol
 * @param {string} url - URL to convert
 * @returns {string} WebSocket URL
 */
export function httpToWs(url) {
  return url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
} // TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
// TODO: Add file existence check
