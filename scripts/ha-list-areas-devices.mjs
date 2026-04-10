#!/usr/bin/env node

/**
 * List all areas and devices in Home Assistant for quick inventory/reporting.
 *
 * This script connects to Home Assistant via WebSocket API and fetches:
 * - All areas with their details
 * - All devices with their details
 * - Optional: Device entities associated with each device
 * - Optional: Area-device relationships
 *
 * Usage:
 *   node scripts/ha-list-areas-devices.mjs [--help] [--verbose] [--json] [--include-entities] [--summary]
 *
 * Output formats:
 *   --json (default): Full JSON report with all details
 *   --summary: Human-readable summary to stderr, JSON to stdout
 *   --verbose: Progress messages to stderr
 *
 * JSON output structure:
 *   {
 *     "timestamp": "2025-04-01T18:00:00.000Z",
 *     "areas": {
 *       "total": 15,
 *       "by_id": {
 *         "living_room": {
 *           "name": "Living Room",
 *           "alias": null,
 *           "picture": null,
 *           "device_count": 5,
 *           "entity_count": 12
 *         },
 *         ...
 *       }
 *     },
 *     "devices": {
 *       "total": 42,
 *       "by_id": {
 *         "a1b2c3d4e5f6": {
 *           "name": "Living Room TV",
 *           "area_id": "living_room",
 *           "manufacturer": "Samsung",
 *           "model": "QN90A",
 *           "sw_version": "T-KT2DEUC-1402.5",
 *           "hw_version": null,
 *           "via_device_id": null,
 *           "config_entries": ["abc123"],
 *           "connections": [["mac", "00:11:22:33:44:55"]],
 *           "identifiers": [["samsung", "1234567890"]],
 *           "disabled_by": null,
 *           "entry_type": null,
 *           "entity_count": 3
 *         },
 *         ...
 *       }
 *     },
 *     "summary": {
 *       "areas_without_devices": 2,
 *       "devices_without_area": 5,
 *       "total_entities": 156
 *     }
 *   }
 *
 * Exit codes:
 *   0: Success
 *   1: General error
 *   2: Authentication/connection error
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { haConnect } from './ha-ws.mjs';
import logger from './_logger.mjs';

function printHelp() {
  console.log(`Usage: node ha-list-areas-devices.mjs [options]

Options:
  --help              Show this help message
  --verbose           Show progress messages to stderr
  --json              Output results in JSON format for machine parsing (default: true)
  --summary           Show human-readable summary to stderr (JSON still goes to stdout)
  --include-entities  Include entity details in the output (can be large)
  --compact           Compact JSON output (no formatting)
  
Environment variables:
  HA_ENV_FILE           Path to environment file (default: homeassistant-api.env)

Examples:
  # Basic inventory (JSON output)
  node ha-list-areas-devices.mjs
  
  # With summary and verbose output
  node ha-list-areas-devices.mjs --verbose --summary
  
  # Include entity details
  node ha-list-areas-devices.mjs --include-entities
  
  # Pipe to jq for filtering
  node ha-list-areas-devices.mjs | jq '.areas.by_id | length'
  node ha-list-areas-devices.mjs | jq '.devices.by_id[] | select(.area_id == null)'
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
  const showSummary = args.includes('--summary');
  const includeEntities = args.includes('--include-entities');
  const compactOutput = args.includes('--compact');

  // Configure logger
  logger.configure({
    outputMode: jsonOutput ? 'json' : 'text',
    minLevel: verbose ? 'info' : 'warn',
  });

  // Load environment
  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  if (verbose) logger.info('Connecting to Home Assistant...');

  // Connect to Home Assistant
  const ha = await haConnect({ baseUrl, token }).catch(err => {
    logger.error(`Failed to connect to Home Assistant: ${err.message}`);
    process.exit(2);
  });

  try {
    if (verbose) logger.info('Fetching areas and devices...');

    // Get areas, devices, and entities in parallel for efficiency
    const [areas, devices, entities] = await Promise.all([
      ha.call('config/area_registry/list'),
      ha.call('config/device_registry/list'),
      includeEntities ? ha.call('config/entity_registry/list') : Promise.resolve([]),
    ]);

    if (verbose) {
      logger.info(`Found ${areas.length} areas`);
      logger.info(`Found ${devices.length} devices`);
      if (includeEntities) {
        logger.info(`Found ${entities.length} entities`);
      }
    }

    // Get states for entity counts if needed
    let states = [];
    if (includeEntities) {
      if (verbose) logger.info('Fetching entity states for additional details...');
      states = await ha.call('get_states');
    }

    // Build area map
    const areaMap = new Map();
    const areaDeviceCounts = new Map();
    const areaEntityCounts = new Map();

    for (const area of areas) {
      areaMap.set(area.area_id, {
        name: area.name,
        alias: area.aliases || null,
        picture: area.picture || null,
        device_count: 0,
        entity_count: 0,
      });
      areaDeviceCounts.set(area.area_id, 0);
      areaEntityCounts.set(area.area_id, 0);
    }

    // Build device map and count devices per area
    const deviceMap = new Map();
    const deviceEntityMap = new Map();

    // First pass: count devices per area and build device info
    for (const device of devices) {
      const deviceInfo = {
        name: device.name,
        area_id: device.area_id || null,
        manufacturer: device.manufacturer || null,
        model: device.model || null,
        model_id: device.model_id || null,
        sw_version: device.sw_version || null,
        hw_version: device.hw_version || null,
        via_device_id: device.via_device_id || null,
        config_entries: device.config_entries || [],
        connections: device.connections || [],
        identifiers: device.identifiers || [],
        disabled_by: device.disabled_by || null,
        entry_type: device.entry_type || null,
        entity_count: 0,
      };

      deviceMap.set(device.id, deviceInfo);
      deviceEntityMap.set(device.id, []);

      // Count device in its area
      if (device.area_id && areaDeviceCounts.has(device.area_id)) {
        areaDeviceCounts.set(device.area_id, areaDeviceCounts.get(device.area_id) + 1);
      }
    }

    // Count entities per device and per area
    if (includeEntities) {
      for (const entity of entities) {
        if (entity.device_id && deviceEntityMap.has(entity.device_id)) {
          deviceEntityMap.get(entity.device_id).push(entity);

          // Count entity for the device
          const deviceInfo = deviceMap.get(entity.device_id);
          if (deviceInfo) {
            deviceInfo.entity_count++;
          }

          // Count entity for the area (via device)
          if (deviceInfo && deviceInfo.area_id && areaEntityCounts.has(deviceInfo.area_id)) {
            areaEntityCounts.set(deviceInfo.area_id, areaEntityCounts.get(deviceInfo.area_id) + 1);
          }
        }
      }
    }

    // Update area counts in the area map
    for (const [areaId, areaInfo] of areaMap.entries()) {
      areaInfo.device_count = areaDeviceCounts.get(areaId) || 0;
      areaInfo.entity_count = areaEntityCounts.get(areaId) || 0;
    }

    // Build summary statistics
    let devicesWithoutArea = 0;
    let entitiesWithoutDevice = 0;

    for (const deviceInfo of deviceMap.values()) {
      if (!deviceInfo.area_id) {
        devicesWithoutArea++;
      }
    }

    if (includeEntities) {
      for (const entity of entities) {
        if (!entity.device_id) {
          entitiesWithoutDevice++;
        }
      }
    }

    // Build the final report
    const report = {
      timestamp: new Date().toISOString(),
      areas: {
        total: areas.length,
        by_id: Object.fromEntries(areaMap),
      },
      devices: {
        total: devices.length,
        by_id: Object.fromEntries(deviceMap),
      },
      summary: {
        areas_without_devices: Array.from(areaMap.values()).filter(a => a.device_count === 0)
          .length,
        devices_without_area: devicesWithoutArea,
        total_entities: includeEntities ? entities.length : null,
        entities_without_device: includeEntities ? entitiesWithoutDevice : null,
      },
    };

    // Include entities if requested
    if (includeEntities) {
      // Build entity map by device
      const entitiesByDevice = {};
      for (const [deviceId, deviceEntities] of deviceEntityMap.entries()) {
        if (deviceEntities.length > 0) {
          entitiesByDevice[deviceId] = deviceEntities.map(entity => ({
            entity_id: entity.entity_id,
            name: entity.name || null,
            original_name: entity.original_name || null,
            platform: entity.platform || null,
            disabled_by: entity.disabled_by || null,
            entity_category: entity.entity_category || null,
            icon: entity.icon || null,
            has_state: states.some(s => s.entity_id === entity.entity_id),
          }));
        }
      }

      report.entities = {
        total: entities.length,
        by_device: entitiesByDevice,
      };
    }

    // Output JSON
    if (compactOutput) {
      console.log(JSON.stringify(report));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    // Show summary if requested
    if (showSummary) {
      console.error('\n=== Home Assistant Inventory Summary ===');
      console.error(`Areas: ${report.areas.total}`);
      console.error(`Devices: ${report.devices.total}`);
      console.error(`Areas without devices: ${report.summary.areas_without_devices}`);
      console.error(`Devices without area assignment: ${report.summary.devices_without_area}`);

      if (includeEntities) {
        console.error(`Entities: ${report.summary.total_entities}`);
        console.error(`Entities without device: ${report.summary.entities_without_device}`);
      }

      console.error('\nTop areas by device count:');
      const areasByDeviceCount = Array.from(areaMap.entries())
        .sort((a, b) => b[1].device_count - a[1].device_count)
        .slice(0, 5);

      for (const [areaId, areaInfo] of areasByDeviceCount) {
        console.error(
          `  ${areaInfo.name} (${areaId}): ${areaInfo.device_count} devices, ${areaInfo.entity_count} entities`
        );
      }

      console.error('\nUnassigned devices (no area):');
      const unassignedDevices = Array.from(deviceMap.entries())
        .filter(([_, device]) => !device.area_id)
        .slice(0, 10);

      for (const [deviceId, deviceInfo] of unassignedDevices) {
        console.error(
          `  ${deviceInfo.name || 'Unnamed device'} (${deviceId.substring(0, 8)}...): ${deviceInfo.manufacturer || 'Unknown'} ${deviceInfo.model || ''}`
        );
      }

      if (unassignedDevices.length > 10) {
        console.error(`  ... and ${unassignedDevices.length - 10} more`);
      }
    }

    if (verbose) {
      logger.success('Inventory completed successfully');
    }
  } catch (error) {
    logger.error(`Error during inventory: ${error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    ha.close();
  }
}

main().catch(error => {
  logger.error(`Unexpected error: ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
