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
    // Check if file exists before reading
    if (!fs.existsSync(filePath)) {
      console.error(`[ERROR] Environment file not found: ${filePath}`);
      process.exit(2);
    }
    
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`[ERROR] Environment file is empty: ${filePath}`);
      process.exit(2);
    }
    
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
      process.exit(3);
    }

    return out;
  } catch (error) {
    console.error(`[ERROR] Failed to load env file: ${error.message}`);
    process.exit(4);
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
    process.exit(5);
  }
}

/**
 * Convert HTTP/HTTPS URLs to WebSocket protocol
 * @param {string} url - URL to convert
 * @returns {string} WebSocket URL
 */
export function httpToWs(url) {
  return url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
}

/**
 * Get a validated environment configuration
 * @param {Object} options - Configuration options
 * @param {string} options.envFile - Path to env file (optional)
 * @param {string[]} options.requiredKeys - Required environment keys
 * @param {Object} options.defaults - Default values for optional keys
 * @returns {Object} Validated environment configuration
 */
export function getValidatedEnv(options = {}) {
  const {
    envFile = process.env.HA_ENV_FILE,
    requiredKeys = ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN'],
    defaults = {}
  } = options;
  
  // Load environment
  const env = loadEnvFile(envFile);
  
  // Apply defaults for missing optional keys
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in env)) {
      env[key] = value;
    }
  }
  
  // Validate required keys
  requireKeys(env, requiredKeys);
  
  return env;
}

/**
 * Create a standardized environment loader for scripts
 * @param {Object} options - Configuration options
 * @returns {Function} Environment loader function
 */
export function createEnvLoader(options = {}) {
  return () => getValidatedEnv(options);
}
