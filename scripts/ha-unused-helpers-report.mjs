#!/usr/bin/env node

/**
 * Report unused helpers/entities in Home Assistant.
 *
 * This script identifies helper entities (input_*, counter, timer, etc.)
 * that are not referenced in any automations, scripts, or templates.
 *
 * Usage:
 *   node scripts/ha-unused-helpers-report.mjs [--help] [--verbose] [--json] [--dry-run]
 *
 * Options:
 *   --help, -h        Show this help message
 *   --verbose         Show progress messages to stderr
 *   --json            Output results in JSON format for machine parsing
 *   --dry-run         Same as normal run (no changes ever made)
 *   --yes             Required to proceed with destructive changes (not applicable for this script)
 *
 * Environment:
 *   HA_ENV_FILE       Path to environment file (default: looks for .env or homeassistant-api.env)
 *
 * Note: This script only reports unused helpers; it does NOT delete or disable them.
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { haConnect } from './ha-ws.mjs';
import logger from './_logger.mjs';

// Helper entity prefixes to check
const HELPER_PREFIXES = [
  'input_boolean',
  'input_number', 
  'input_text',
  'input_select',
  'input_datetime',
  'input_button',
  'counter',
  'timer',
  'zone',
  'person',
  'device_tracker',
  'scene',
  'script',
  'automation'
];

// Check if an entity is a helper
function isHelperEntity(entityId) {
  return HELPER_PREFIXES.some(prefix => entityId.startsWith(`${prefix}.`));
}

// Extract entity IDs from a string (supports templates like {{ states('input_boolean.foo') }})
function extractEntityIds(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Match entity IDs in various patterns
  const patterns = [
    // Direct entity references: entity_id: input_boolean.foo
    /entity_id:\s*["']?([a-z_]+\.([a-z0-9_]+(?:\.[a-z0-9_]+)*))["']?/gi,
    // Template states: {{ states('input_boolean.foo') }}
    /states\(["']([a-z_]+\.([a-z0-9_]+(?:\.[a-z0-9_]+)*))["']\)/gi,
    // Direct in templates: {{ is_state('input_boolean.foo', 'on') }}
    /is_state\(["']([a-z_]+\.([a-z0-9_]+(?:\.[a-z0-9_]+)*))["']/gi,
    // State attributes: {{ state_attr('input_boolean.foo', 'attr') }}
    /state_attr\(["']([a-z_]+\.([a-z0-9_]+(?:\.[a-z0-9_]+)*))["']/gi,
    // In service calls: service: input_boolean.turn_on, target: entity_id: input_boolean.foo
    /["']([a-z_]+\.([a-z0-9_]+(?:\.[a-z0-9_]+)*))["']/gi
  ];
  
  const entityIds = new Set();
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Reset lastIndex for global regex to avoid infinite loops
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
      
      const entityId = match[1];
      if (entityId && !entityId.includes('{{') && !entityId.includes('}}')) {
        entityIds.add(entityId);
      }
    }
  }
  
  return Array.from(entityIds);
}

async function main() {
  const args = process.argv.slice(2);
  const help = args.includes('--help') || args.includes('-h');
  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');
  const dryRun = args.includes('--dry-run');
  
  if (help) {
    console.log(`Usage: ${process.argv[1]} [options]
    
Report unused helpers/entities in Home Assistant.

This script identifies helper entities (input_*, counter, timer, etc.)
that are not referenced in any automations, scripts, or templates.

Options:
  --help, -h        Show this help message
  --verbose         Show progress messages to stderr
  --json            Output results in JSON format for machine parsing
  --dry-run         Same as normal run (no changes ever made)

Environment:
  HA_ENV_FILE       Path to environment file (default: looks for .env or homeassistant-api.env)

Note: This script only reports unused helpers; it does NOT delete or disable them.
`);
    process.exit(0);
  }

  // Configure logger
  logger.configure({
    timestamp: true,
    outputMode: jsonOutput ? 'json' : 'text',
    minLevel: verbose ? 'debug' : 'info'
  });

  if (dryRun) {
    logger.info('Running in dry-run mode (no changes will be made)');
  }

  // Load environment
  const envFile = process.env.HA_ENV_FILE;
  const env = loadEnvFile(envFile);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const { HA_BASE_URL, HA_LONG_LIVED_ACCESS_TOKEN } = env;

  logger.info('Connecting to Home Assistant...');
  const ha = await haConnect({
    baseUrl: HA_BASE_URL,
    token: HA_LONG_LIVED_ACCESS_TOKEN
  });

  try {
    // Get all entities
    logger.info('Fetching all entities...');
    const entities = await ha.call('config/entity_registry/list');
    
    // Filter for helper entities
    const helperEntities = entities.filter(entity => isHelperEntity(entity.entity_id));
    logger.info(`Found ${helperEntities.length} helper entities out of ${entities.length} total entities`);
    
    if (verbose) {
      logger.debug(`Helper entity prefixes checked: ${HELPER_PREFIXES.join(', ')}`);
    }

    // Get all automations via REST API
    logger.info('Fetching automations...');
    const automationsRes = await fetch(`${HA_BASE_URL}/api/config/automation/config`, {
      headers: { Authorization: `Bearer ${HA_LONG_LIVED_ACCESS_TOKEN}` }
    });
    if (!automationsRes.ok) {
      throw new Error(`Failed to fetch automations: ${automationsRes.status} ${automationsRes.statusText}`);
    }
    const automations = await automationsRes.json();
    
    // Get all scripts via REST API
    logger.info('Fetching scripts...');
    const scriptsRes = await fetch(`${HA_BASE_URL}/api/config/script/config`, {
      headers: { Authorization: `Bearer ${HA_LONG_LIVED_ACCESS_TOKEN}` }
    });
    if (!scriptsRes.ok) {
      throw new Error(`Failed to fetch scripts: ${scriptsRes.status} ${scriptsRes.statusText}`);
    }
    const scripts = await scriptsRes.json();
    
    // Get all templates (we need to get template entities and their attributes)
    logger.info('Fetching template entities...');
    const templateEntities = entities.filter(entity => entity.entity_id.startsWith('template.'));
    
    // Get all scenes via REST API
    logger.info('Fetching scenes...');
    const scenesRes = await fetch(`${HA_BASE_URL}/api/config/scene/config`, {
      headers: { Authorization: `Bearer ${HA_LONG_LIVED_ACCESS_TOKEN}` }
    });
    if (!scenesRes.ok) {
      throw new Error(`Failed to fetch scenes: ${scenesRes.status} ${scriptsRes.statusText}`);
    }
    const scenes = await scenesRes.json();
    
    // Collect all referenced entity IDs
    const referencedEntityIds = new Set();
    
    // Process automations (raw YAML/JSON config)
    const automationConfigStr = JSON.stringify(automations);
    const automationEntities = extractEntityIds(automationConfigStr);
    automationEntities.forEach(id => referencedEntityIds.add(id));
    
    // Process scripts (raw YAML/JSON config)
    const scriptConfigStr = JSON.stringify(scripts);
    const scriptEntities = extractEntityIds(scriptConfigStr);
    scriptEntities.forEach(id => referencedEntityIds.add(id));
    
    // Process template entities (check their state attributes)
    for (const templateEntity of templateEntities) {
      const entityState = await ha.call('states/get', { entity_id: templateEntity.entity_id });
      if (entityState && entityState.attributes) {
        const attrsStr = JSON.stringify(entityState.attributes);
        const extracted = extractEntityIds(attrsStr);
        extracted.forEach(id => referencedEntityIds.add(id));
      }
    }
    
    // Process scenes (raw YAML/JSON config)
    const sceneConfigStr = JSON.stringify(scenes);
    const sceneEntities = extractEntityIds(sceneConfigStr);
    sceneEntities.forEach(id => referencedEntityIds.add(id));
    
    logger.info(`Found ${referencedEntityIds.size} unique entity references in automations, scripts, templates, and scenes`);
    
    if (verbose) {
      logger.debug(`Referenced entities (first 20): ${Array.from(referencedEntityIds).slice(0, 20).join(', ')}`);
    }
    
    // Identify unused helpers
    const unusedHelpers = [];
    const usedHelpers = [];
    
    for (const helper of helperEntities) {
      if (referencedEntityIds.has(helper.entity_id)) {
        usedHelpers.push(helper);
      } else {
        unusedHelpers.push(helper);
      }
    }
    
    // Prepare report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_helpers: helperEntities.length,
        used_helpers: usedHelpers.length,
        unused_helpers: unusedHelpers.length,
        percentage_unused: helperEntities.length > 0 ? 
          Math.round((unusedHelpers.length / helperEntities.length) * 100) : 0
      },
      unused_helpers: unusedHelpers.map(helper => ({
        entity_id: helper.entity_id,
        name: helper.name || helper.original_name || null,
        platform: helper.platform,
        disabled_by: helper.disabled_by,
        hidden_by: helper.hidden_by
      })),
      used_helpers: usedHelpers.map(helper => ({
        entity_id: helper.entity_id,
        name: helper.name || helper.original_name || null
      }))
    };
    
    // Output results
    if (jsonOutput) {
      logger.json(report);
    } else {
      console.log('\n=== UNUSED HELPERS REPORT ===\n');
      console.log(`Summary:`);
      console.log(`  Total helper entities: ${report.summary.total_helpers}`);
      console.log(`  Used helpers: ${report.summary.used_helpers}`);
      console.log(`  Unused helpers: ${report.summary.unused_helpers}`);
      console.log(`  Percentage unused: ${report.summary.percentage_unused}%\n`);
      
      if (unusedHelpers.length > 0) {
        console.log(`Unused helpers (${unusedHelpers.length}):`);
        for (const helper of unusedHelpers.slice(0, 50)) { // Show first 50
          const name = helper.name || helper.original_name || 'unnamed';
          console.log(`  • ${helper.entity_id} - "${name}" (${helper.platform})`);
        }
        
        if (unusedHelpers.length > 50) {
          console.log(`  ... and ${unusedHelpers.length - 50} more`);
        }
        
        console.log('\nNote: These helpers are not referenced in any automations, scripts, templates, or scenes.');
        console.log('Consider reviewing and removing them if they are truly unused.');
      } else {
        console.log('✅ No unused helpers found!');
      }
    }
    
    logger.success('Report completed successfully');
    
  } finally {
    ha.close();
  }
}

// Run main with error handling
main().catch(error => {
  logger.error(`Script failed: ${error.message}`);
  if (process.argv.includes('--verbose')) {
    console.error(error.stack);
  }
  process.exit(1);
});