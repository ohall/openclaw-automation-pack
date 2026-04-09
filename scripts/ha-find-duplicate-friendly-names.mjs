#!/usr/bin/env node

/**
 * Find duplicate friendly names in Home Assistant entities.
 *
 * This script connects to Home Assistant via WebSocket API, fetches all entities,
 * and identifies duplicate friendly names across different entities. Duplicate
 * friendly names can cause confusion in voice assistants and UI.
 *
 * Usage:
 *   node scripts/ha-find-duplicate-friendly-names.mjs [--help] [--verbose] [--json] [--dry-run]
 *
 * Options:
 *   --help      Show this help message
 *   --verbose   Show progress messages to stderr
 *   --json      Output results in JSON format (default: true, flag for consistency)
 *   --dry-run   Don't actually rename anything, just report duplicates (default: true)
 *
 * Output format:
 *   {
 *     "timestamp": "2025-04-01T18:00:00.000Z",
 *     "total_entities": 456,
 *     "entities_with_friendly_names": 412,
 *     "duplicate_groups_found": 8,
 *     "duplicate_groups": [
 *       {
 *         "friendly_name": "Living Room Light",
 *         "count": 3,
 *         "entities": [
 *           {
 *             "entity_id": "light.living_room_main",
 *             "friendly_name": "Living Room Light",
 *             "entity_category": null,
 *             "domain": "light",
 *             "area_id": "living_room",
 *             "device_id": "a1b2c3d4e5f6"
 *           },
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Exit codes:
 *   0: Success (duplicates found or not)
 *   1: General error
 *   2: Authentication/connection error
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { haConnect } from './ha-ws.mjs';

function printHelp() {
  console.log(`Usage: node ha-find-duplicate-friendly-names.mjs [options]

Options:
  --help      Show this help message
  --verbose   Show progress messages to stderr
  --json      Output results in JSON format for machine parsing (default: true, flag for consistency)
  --dry-run   Don't actually rename anything, just report duplicates (default: true)

Environment variables:
  HA_ENV_FILE           Path to environment file (default: homeassistant-api.env)

Examples:
  # Basic scan for duplicate friendly names
  node ha-find-duplicate-friendly-names.mjs
  
  # With verbose output
  node ha-find-duplicate-friendly-names.mjs --verbose
  
  # Pipe output to jq for filtering
  node ha-find-duplicate-friendly-names.mjs | jq '.duplicate_groups[] | select(.count > 2)'
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
  const dryRun = !args.includes('--no-dry-run'); // Default to dry-run for safety

  if (verbose) {
    console.error(`[INFO] Starting duplicate friendly name scan`);
    console.error(`[INFO] Dry run mode: ${dryRun ? 'ON' : 'OFF'}`);
  }

  // Load environment
  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');

  try {
    // Connect to Home Assistant
    if (verbose) console.error(`[INFO] Connecting to ${baseUrl}...`);
    const ha = await haConnect({ baseUrl, token: env.HA_LONG_LIVED_ACCESS_TOKEN });
    
    // Fetch entity registry and states in parallel
    if (verbose) console.error(`[INFO] Fetching entity registry and states...`);
    const [entityRegistry, states] = await Promise.all([
      ha.call('config/entity_registry/list'),
      ha.call('get_states')
    ]);
    
    // Create a map of entity_id to entity registry entry
    const registryMap = new Map();
    for (const entry of entityRegistry) {
      registryMap.set(entry.entity_id, entry);
    }
    
    // Create a map of entity_id to state
    const stateMap = new Map();
    for (const state of states) {
      stateMap.set(state.entity_id, state);
    }
    
    if (verbose) {
      console.error(`[INFO] Found ${entityRegistry.length} entities in registry`);
      console.error(`[INFO] Found ${states.length} entities with states`);
    }
    
    // Combine registry and state info
    const entities = [];
    for (const [entityId, registryEntry] of registryMap) {
      const state = stateMap.get(entityId);
      if (state) {
        entities.push({
          entity_id: entityId,
          ...registryEntry,
          state: state.state,
          attributes: state.attributes,
          last_changed: state.last_changed,
          last_updated: state.last_updated
        });
      }
    }
    
    // Group entities by friendly name
    const entitiesByName = {};
    let entitiesWithFriendlyName = 0;
    
    for (const entity of entities) {
      const friendlyName = entity.attributes?.friendly_name;
      if (friendlyName && typeof friendlyName === 'string' && friendlyName.trim()) {
        entitiesWithFriendlyName++;
        const normalizedName = friendlyName.trim();
        
        if (!entitiesByName[normalizedName]) {
          entitiesByName[normalizedName] = [];
        }
        
        entitiesByName[normalizedName].push({
          entity_id: entity.entity_id,
          friendly_name: friendlyName,
          entity_category: entity.entity_category,
          domain: entity.entity_id.split('.')[0],
          area_id: entity.area_id,
          device_id: entity.device_id,
          platform: entity.platform
        });
      }
    }
    
    // Find duplicates (names with more than one entity)
    const duplicateGroups = [];
    for (const [friendlyName, entitiesList] of Object.entries(entitiesByName)) {
      if (entitiesList.length > 1) {
        duplicateGroups.push({
          friendly_name: friendlyName,
          count: entitiesList.length,
          entities: entitiesList.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
        });
      }
    }
    
    // Sort by count descending, then by name
    duplicateGroups.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.friendly_name.localeCompare(b.friendly_name);
    });
    
    // Prepare result
    const result = {
      timestamp: new Date().toISOString(),
      total_entities: entities.length,
      entities_with_friendly_names: entitiesWithFriendlyName,
      duplicate_groups_found: duplicateGroups.length,
      duplicate_groups: duplicateGroups,
      summary: duplicateGroups.length === 0 
        ? "No duplicate friendly names found"
        : `Found ${duplicateGroups.length} duplicate friendly name(s)`
    };
    
    // Output result
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n=== DUPLICATE FRIENDLY NAME REPORT ===\n`);
      console.log(`Timestamp: ${result.timestamp}`);
      console.log(`Total entities: ${result.total_entities}`);
      console.log(`Entities with friendly names: ${result.entities_with_friendly_names}`);
      console.log(`Duplicate groups found: ${result.duplicate_groups_found}`);
      console.log(`\n${result.summary}\n`);
      
      if (duplicateGroups.length > 0) {
        console.log(`\n=== DETAILS ===\n`);
        for (const group of duplicateGroups) {
          console.log(`"${group.friendly_name}" (${group.count} entities):`);
          for (const entity of group.entities) {
            console.log(`  • ${entity.entity_id} (${entity.domain})`);
            if (entity.area_id) console.log(`    Area: ${entity.area_id}`);
            if (entity.device_id) console.log(`    Device: ${entity.device_id}`);
          }
          console.log();
        }
      }
    }
    
    // Exit with appropriate code
    process.exit(0);
    
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    if (verbose && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`[FATAL] Unhandled error: ${error.message}`);
    process.exit(1);
  });
}