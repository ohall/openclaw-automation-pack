#!/usr/bin/env node

/**
 * Backup critical Home Assistant configuration files and data before mutating actions.
 *
 * This script exports configuration via Home Assistant API to a timestamped backup directory.
 * Useful to run before making changes that could potentially break the system.
 *
 * Usage:
 *   node scripts/ha-backup-config.mjs [--dry-run] [--output-dir <path>] [--json] [--help]
 */

import { getValidatedEnv } from './_env.mjs';
import logger from './_logger.mjs';
import fs from 'node:fs';
import path from 'node:path';

// Configure logger for this script
logger.configure({
  timestamp: true,
  timestampFormat: 'human',
  statusPrefix: true,
});

function printHelp() {
  logger.help(`Usage: node ha-backup-config.mjs [options]

Options:
  --dry-run             Show what would be backed up without creating files
  --output-dir <path>   Directory to store backups (default: ./backups/YYYY-MM-DD_HH-MM-SS)
  --json                Output results in JSON format for machine parsing
  --help                Show this help message

Environment variables:
  HA_ENV_FILE           Path to environment file (default: homeassistant-api.env)

Examples:
  # Create a backup
  node ha-backup-config.mjs
  
  # Dry run to see what would be backed up
  node ha-backup-config.mjs --dry-run
  
  # Specify custom output directory
  node ha-backup-config.mjs --output-dir ~/ha-backups/
  
  # Output in JSON format
  node ha-backup-config.mjs --json
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    outputDir: null,
    help: false,
    jsonOutput: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.jsonOutput = true;
    } else if (arg === '--output-dir' || arg === '-o') {
      if (i + 1 < args.length) {
        options.outputDir = args[i + 1];
        i++;
      } else {
        logger.error('--output-dir requires a path');
        process.exit(1);
      }
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      logger.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return options;
}

function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
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

async function runBackup(env, options) {
  const timestamp = generateTimestamp();
  const outputDir = options.outputDir || process.cwd();
  const backupDir = options.dryRun
    ? null
    : ensureDirectory(path.join(outputDir, `ha-backup-${timestamp}`));

  if (!options.jsonOutput) {
    logger.info(`Starting backup to: ${backupDir || '(dry-run) would create backup directory'}`);
  }

  const baseUrl = env.HA_BASE_URL;
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  const endpoints = [
    {
      name: 'config',
      url: `${baseUrl}/api/config`,
      filename: 'config.json',
    },
    {
      name: 'entity_registry',
      url: `${baseUrl}/api/config/entity_registry/list`,
      filename: 'entity_registry.json',
    },
    {
      name: 'device_registry',
      url: `${baseUrl}/api/config/device_registry/list`,
      filename: 'device_registry.json',
    },
    {
      name: 'area_registry',
      url: `${baseUrl}/api/config/area_registry/list`,
      filename: 'area_registry.json',
    },
    {
      name: 'automations',
      url: `${baseUrl}/api/config/automation/config`,
      filename: 'automations.json',
    },
    {
      name: 'scripts',
      url: `${baseUrl}/api/config/script/config`,
      filename: 'scripts.json',
    },
    {
      name: 'scenes',
      url: `${baseUrl}/api/config/scene/config`,
      filename: 'scenes.json',
    },
    {
      name: 'blueprints',
      url: `${baseUrl}/api/blueprint/list`,
      filename: 'blueprints.json',
    },
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      if (!options.jsonOutput) {
        logger.info(`Backing up ${endpoint.name}...`);
      }

      if (options.dryRun) {
        if (!options.jsonOutput) {
          logger.info(`Would fetch: ${endpoint.url}`, { label: 'DRY-RUN' });
        }
        results.push({
          endpoint: endpoint.name,
          success: true,
          status: 'dry-run',
          url: endpoint.url,
          filename: endpoint.filename,
        });
        continue;
      }

      const response = await fetchWithAuth(endpoint.url, token);
      const data = await response.json();

      const outputPath = path.join(backupDir, endpoint.filename);
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

      if (!options.jsonOutput) {
        logger.ok(`Saved to: ${endpoint.filename}`);
      }
      results.push({
        endpoint: endpoint.name,
        success: true,
        size: JSON.stringify(data).length,
        url: endpoint.url,
        filename: endpoint.filename,
        path: outputPath,
      });
    } catch (error) {
      if (!options.jsonOutput) {
        logger.error(`Failed to backup ${endpoint.name}: ${error.message}`);
      }
      results.push({
        endpoint: endpoint.name,
        success: false,
        error: error.message,
        url: endpoint.url,
        filename: endpoint.filename,
      });
    }
  }

  // Create a summary file if not in dry-run mode
  let summaryPath = null;
  if (!options.dryRun) {
    summaryPath = path.join(backupDir, 'backup-summary.json');
    const summary = {
      timestamp: new Date().toISOString(),
      haBaseUrl: env.HA_BASE_URL,
      backupDir: backupDir,
      results: results,
      totalEndpoints: endpoints.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    if (!options.jsonOutput) {
      logger.success(`Backup summary saved to: ${summaryPath}`);
    }
  }

  // Calculate summary stats
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  // Output in JSON format if requested
  if (options.jsonOutput) {
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      action: 'backup-config',
      dryRun: options.dryRun,
      success: failed === 0,
      backupDir: backupDir,
      summaryPath: summaryPath,
      parameters: {
        outputDir: outputDir,
        haBaseUrl: baseUrl,
      },
      statistics: {
        totalEndpoints: endpoints.length,
        successful: successful,
        failed: failed,
      },
      results: results,
    };
    logger.json(jsonOutput);

    // Exit with error code if any backups failed
    if (failed > 0) {
      process.exit(1);
    }
    return;
  }

  // Print summary for human-readable output
  logger.info('=== BACKUP SUMMARY ===', { statusPrefix: false });
  logger.info(`Total endpoints: ${endpoints.length}`, { statusPrefix: false });
  logger.info(`Successful: ${successful}`, { statusPrefix: false });
  logger.info(`Failed: ${failed}`, { statusPrefix: false });

  if (failed > 0) {
    logger.info('\nFailed endpoints:', { statusPrefix: false });
    results
      .filter(r => !r.success)
      .forEach(r => {
        logger.info(`  - ${r.endpoint}: ${r.error}`, { statusPrefix: false });
      });
    if (!options.dryRun) {
      logger.warn('Some backups failed. Check backup-summary.json for details.');
    }
  }

  if (!options.dryRun) {
    logger.success(`Backup completed successfully to: ${backupDir}`);
    logger.info(`Summary: ${backupDir}/backup-summary.json`, { statusPrefix: false });
  } else {
    logger.info('No files were created.', { label: 'DRY-RUN' });
  }
}

async function main() {
  const options = parseArgs();

  // Configure logger based on options
  logger.configure({
    timestamp: true,
    timestampFormat: 'human',
    statusPrefix: true,
    outputMode: options.jsonOutput ? 'json' : 'text',
  });

  if (options.help) {
    printHelp();
    return;
  }

  // Load and validate environment
  const env = getValidatedEnv({
    envFile: process.env.HA_ENV_FILE,
    requiredKeys: ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']
  });

  try {
    await runBackup(env, options);
  } catch (error) {
    logger.error(`Backup failed: ${error.message}`, { label: 'FATAL' });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error(`${error.message}`, { label: 'FATAL' });
    process.exit(1);
  });
}
