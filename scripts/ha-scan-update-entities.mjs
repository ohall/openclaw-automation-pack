#!/usr/bin/env node

/**
 * Scan for update entities and report pending updates in JSON format.
 *
 * This script connects to Home Assistant via WebSocket API, fetches all
 * entities with domain 'update', and reports which ones have updates
 * available (state === 'on').
 *
 * Usage:
 *   node scripts/ha-scan-update-entities.mjs [--help] [--verbose]
 *
 * Output format:
 *   {
 *     "timestamp": "2025-04-01T18:00:00.000Z",
 *     "total_update_entities": 15,
 *     "pending_updates": 3,
 *     "entities": [
 *       {
 *         "entity_id": "update.hacs",
 *         "friendly_name": "HACS",
 *         "state": "on",
 *         "installed_version": "1.30.0",
 *         "latest_version": "1.31.0",
 *         "title": "Home Assistant Community Store",
 *         "release_url": "https://github.com/hacs/integration/releases/tag/1.31.0",
 *         "in_progress": false,
 *         "entity_category": null
 *       },
 *       ...
 *     ]
 *   }
 *
 * Exit codes:
 *   0: Success
 *   1: General error
 *   2: Authentication/connection error
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { haConnect } from './ha-ws.mjs';

function printHelp() {
  console.log(`Usage: node ha-scan-update-entities.mjs [options]

Options:
  --help      Show this help message
  --verbose   Show progress messages to stderr
  --json      Output results in JSON format for machine parsing (default: true, flag for consistency)

Environment variables:
  HA_ENV_FILE           Path to environment file (default: homeassistant-api.env)

Examples:
  # Basic scan (JSON output by default)
  node ha-scan-update-entities.mjs
  
  # With verbose output
  node ha-scan-update-entities.mjs --verbose
  
  # Pipe output to jq for filtering
  node ha-scan-update-entities.mjs | jq '.entities[] | select(.state == "on")'
`);
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json') || true; // Always true for backward compatibility

  // Load environment
  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  if (verbose) console.error('Connecting to Home Assistant...');

  // Connect to Home Assistant
  const ha = await haConnect({ baseUrl, token }).catch((err) => {
    console.error(`Failed to connect to Home Assistant: ${err.message}`);
    process.exit(2);
  });

  try {
    if (verbose) console.error('Fetching entities...');

    // Get all entities
    const entities = await ha.call('config/entity_registry/list');
    
    // Filter for update entities
    const updateEntities = entities.filter(e => e.entity_id.startsWith('update.'));
    
    if (verbose) console.error(`Found ${updateEntities.length} update entities, fetching states...`);

    // Get states for all update entities
    const states = await ha.call('get_states');
    const stateMap = new Map(states.map(s => [s.entity_id, s]));

    // Build the report
    const report = {
      timestamp: new Date().toISOString(),
      total_update_entities: updateEntities.length,
      pending_updates: 0,
      entities: []
    };

    for (const entity of updateEntities) {
      const state = stateMap.get(entity.entity_id);
      if (!state) continue;

      const entityInfo = {
        entity_id: entity.entity_id,
        friendly_name: entity.name || state.attributes?.friendly_name || null,
        state: state.state,
        installed_version: state.attributes?.installed_version || null,
        latest_version: state.attributes?.latest_version || null,
        title: state.attributes?.title || null,
        release_url: state.attributes?.release_url || null,
        in_progress: state.attributes?.in_progress || false,
        entity_category: entity.entity_category || null,
        platform: entity.platform || null
      };

      if (state.state === 'on') {
        report.pending_updates++;
      }

      report.entities.push(entityInfo);
    }

    // Sort entities by entity_id
    report.entities.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

    // Output JSON
    console.log(JSON.stringify(report, null, 2));

    if (verbose) {
      console.error(`\nSummary:`);
      console.error(`  Total update entities: ${report.total_update_entities}`);
      console.error(`  Pending updates: ${report.pending_updates}`);
      if (report.pending_updates > 0) {
        console.error(`  Entities with updates:`);
        report.entities
          .filter(e => e.state === 'on')
          .forEach(e => console.error(`    - ${e.entity_id} (${e.friendly_name || 'no name'})`));
      }
    }

  } catch (error) {
    console.error(`Error during scan: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    ha.close();
  }
}

main().catch((error) => {
  console.error(`Unexpected error: ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});