#!/usr/bin/env node

/**
 * Backup critical Home Assistant configuration files and data before mutating actions.
 * 
 * This script exports configuration via Home Assistant API to a timestamped backup directory.
 * Useful to run before making changes that could potentially break the system.
 *
 * Usage:
 *   node scripts/ha-backup-config.mjs [--dry-run] [--output-dir <path>] [--help]
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function printHelp() {
  console.log(`Usage: node ha-backup-config.mjs [options]

Options:
  --dry-run             Show what would be backed up without creating files
  --output-dir <path>   Directory to store backups (default: ./backups/YYYY-MM-DD_HH-MM-SS)
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
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    outputDir: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--output-dir' || arg === '-o') {
      if (i + 1 < args.length) {
        options.outputDir = args[i + 1];
        i++;
      } else {
        console.error('[ERROR] --output-dir requires a path');
        process.exit(1);
      }
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
      'Authorization': `Bearer ${token}`,
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
  const backupDir = options.dryRun ? '(dry-run) would create backup directory' : 
    ensureDirectory(path.join(outputDir, `ha-backup-${timestamp}`));

  console.log(`[INFO] Starting backup to: ${backupDir}`);
  
  const baseUrl = env.HA_BASE_URL;
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;
  
  const endpoints = [
    {
      name: 'config',
      url: `${baseUrl}/api/config`,
      filename: 'config.json'
    },
    {
      name: 'entity_registry',
      url: `${baseUrl}/api/config/entity_registry/list`,
      filename: 'entity_registry.json'
    },
    {
      name: 'device_registry',
      url: `${baseUrl}/api/config/device_registry/list`,
      filename: 'device_registry.json'
    },
    {
      name: 'area_registry',
      url: `${baseUrl}/api/config/area_registry/list`,
      filename: 'area_registry.json'
    },
    {
      name: 'automations',
      url: `${baseUrl}/api/config/automation/config`,
      filename: 'automations.json'
    },
    {
      name: 'scripts',
      url: `${baseUrl}/api/config/script/config`,
      filename: 'scripts.json'
    },
    {
      name: 'scenes',
      url: `${baseUrl}/api/config/scene/config`,
      filename: 'scenes.json'
    },
    {
      name: 'blueprints',
      url: `${baseUrl}/api/blueprint/list`,
      filename: 'blueprints.json'
    }
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`[INFO] Backing up ${endpoint.name}...`);
      
      if (options.dryRun) {
        console.log(`  [DRY-RUN] Would fetch: ${endpoint.url}`);
        results.push({ endpoint: endpoint.name, success: true, status: 'dry-run' });
        continue;
      }

      const response = await fetchWithAuth(endpoint.url, token);
      const data = await response.json();
      
      const outputPath = path.join(backupDir, endpoint.filename);
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      
      console.log(`  [OK] Saved to: ${endpoint.filename}`);
      results.push({ endpoint: endpoint.name, success: true, size: JSON.stringify(data).length });
    } catch (error) {
      console.error(`  [ERROR] Failed to backup ${endpoint.name}: ${error.message}`);
      results.push({ endpoint: endpoint.name, success: false, error: error.message });
    }
  }

  // Create a summary file
  if (!options.dryRun) {
    const summaryPath = path.join(backupDir, 'backup-summary.json');
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
    console.log(`[SUCCESS] Backup summary saved to: ${summaryPath}`);
  }

  // Print summary
  console.log('\n=== BACKUP SUMMARY ===');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`Total endpoints: ${endpoints.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed endpoints:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.endpoint}: ${r.error}`);
    });
    if (!options.dryRun) {
      console.log(`\n[WARNING] Some backups failed. Check backup-summary.json for details.`);
    }
  }

  if (!options.dryRun) {
    console.log(`\nBackup completed successfully to: ${backupDir}`);
    console.log(`Summary: ${backupDir}/backup-summary.json`);
  } else {
    console.log('\n[DRY RUN] No files were created.');
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
    await runBackup(env, options);
  } catch (error) {
    console.error(`[FATAL] Backup failed: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`[FATAL] ${error.message}`);
    process.exit(1);
  });
}