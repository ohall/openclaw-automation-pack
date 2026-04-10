#!/usr/bin/env node

/**
 * Home Assistant configuration validation wrapper.
 *
 * This script triggers a configuration check via the Home Assistant API
 * and reports the results. Useful to run before restarting HA after making changes.
 *
 * Usage:
 *   node scripts/ha-validate-config.mjs [--verbose] [--json] [--help]
 */

import { loadEnvFile, requireKeys } from './_env.mjs';

function printHelp() {
  console.log(`Usage: node ha-validate-config.mjs [options]

Options:
  --verbose, -v    Show detailed validation results including warnings
  --json           Output results in JSON format for machine parsing
  --help, -h       Show this help message

Environment variables:
  HA_ENV_FILE      Path to environment file (default: homeassistant-api.env)

Examples:
  # Basic config validation
  node ha-validate-config.mjs
  
  # Verbose output with warnings
  node ha-validate-config.mjs --verbose
  
  # JSON output for scripting
  node ha-validate-config.mjs --json
  
  # Combine verbose and JSON
  node ha-validate-config.mjs --verbose --json
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      console.error(`[ERROR] Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

async function fetchWithAuth(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

async function validateConfig(env, options) {
  const baseUrl = env.HA_BASE_URL;
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  console.log('[INFO] Validating Home Assistant configuration...');
  console.log(`[INFO] HA Base URL: ${baseUrl}`);

  try {
    // Trigger configuration validation
    const response = await fetchWithAuth(`${baseUrl}/api/config/core/check_config`, token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (options.json) {
      // Output raw JSON result
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    // Pretty print the results
    console.log('\n=== CONFIGURATION VALIDATION RESULTS ===');

    if (result.result === 'valid') {
      console.log('✅ Configuration is VALID');

      if (result.errors && result.errors.length > 0) {
        console.log(`\n[WARNING] Validation passed but ${result.errors.length} error(s) found:`);
        result.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }

      if (options.verbose && result.warnings && result.warnings.length > 0) {
        console.log(`\n[INFO] ${result.warnings.length} warning(s):`);
        result.warnings.forEach((warning, index) => {
          console.log(`  ${index + 1}. ${warning}`);
        });
      }
    } else if (result.result === 'invalid') {
      console.log('❌ Configuration is INVALID');

      if (result.errors && result.errors.length > 0) {
        console.log(`\n[ERROR] ${result.errors.length} error(s) found:`);
        result.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }

      if (options.verbose && result.warnings && result.warnings.length > 0) {
        console.log(`\n[INFO] ${result.warnings.length} warning(s):`);
        result.warnings.forEach((warning, index) => {
          console.log(`  ${index + 1}. ${warning}`);
        });
      }
    } else {
      console.log(`[WARNING] Unexpected validation result: ${result.result}`);
      console.log('Full response:', JSON.stringify(result, null, 2));
    }

    // Print additional info if available
    if (options.verbose) {
      if (result.translation_key) {
        console.log(`\n[INFO] Translation key: ${result.translation_key}`);
      }
      if (result.translation_placeholders) {
        console.log('[INFO] Translation placeholders:', result.translation_placeholders);
      }
    }

    return result;
  } catch (error) {
    console.error(`[ERROR] Failed to validate configuration: ${error.message}`);

    // Check if it's a connection error
    if (
      error.message.includes('fetch failed') ||
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED')
    ) {
      console.error(`[ERROR] Cannot connect to Home Assistant at ${baseUrl}`);
      console.error('[ERROR] Make sure HA is running and accessible, and the token is valid.');
    }

    throw error;
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    return;
  }

  // Load environment
  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  try {
    const result = await validateConfig(env, options);

    // Exit with appropriate code
    if (result.result === 'valid') {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error(`[FATAL] Validation failed: ${error.message}`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`[FATAL] ${error.message}`);
    process.exit(1);
  });
}
