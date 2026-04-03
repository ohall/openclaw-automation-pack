#!/usr/bin/env node

/**
 * Disable Hubitat orphan entities in HA entity registry.
 *
 * Orphan = entity_registry platform=hubitat, unique_id contains ::<deviceId>::,
 * but that deviceId is no longer exported by Maker API.
 *
 * This avoids the UI warning:
 * "This entity is no longer being provided by the hubitat integration..."
 *
 * NOTE: This disables entities (disabled_by=user). It does NOT delete.
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { haConnect } from './ha-ws.mjs';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log(`Usage: ${process.argv[1]} [options]
    
Disable Hubitat orphan entities in HA entity registry.

Options:
  --dry-run           List entities that would be disabled without making changes
  --allowlist <file>  JSON file containing entity IDs to keep enabled (array of strings)
  --denylist <file>   JSON file containing entity IDs to always disable (array of strings)
  --help, -h          Show this help message

Environment:
  HA_ENV_FILE         Path to environment file (default: looks for .env or homeassistant-api.env)
`);
    process.exit(0);
  }

  // Parse allowlist/denylist arguments
  let allowlist = [];
  let denylist = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allowlist' && i + 1 < args.length) {
      try {
        const allowlistFile = args[i + 1];
        const content = await import('fs/promises').then(fs => fs.readFile(allowlistFile, 'utf8'));
        allowlist = JSON.parse(content);
        if (!Array.isArray(allowlist)) {
          throw new Error('Allowlist must be a JSON array of entity IDs');
        }
      } catch (e) {
        console.error(`Failed to load allowlist: ${e.message}`);
        process.exit(1);
      }
    } else if (args[i] === '--denylist' && i + 1 < args.length) {
      try {
        const denylistFile = args[i + 1];
        const content = await import('fs/promises').then(fs => fs.readFile(denylistFile, 'utf8'));
        denylist = JSON.parse(content);
        if (!Array.isArray(denylist)) {
          throw new Error('Denylist must be a JSON array of entity IDs');
        }
      } catch (e) {
        console.error(`Failed to load denylist: ${e.message}`);
        process.exit(1);
      }
    }
  }

  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, [
    'HA_BASE_URL',
    'HA_LONG_LIVED_ACCESS_TOKEN',
    'HUBITAT_MAKER_API_BASE_URL',
    'HUBITAT_MAKER_API_ACCESS_TOKEN',
  ]);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  const hubBase = env.HUBITAT_MAKER_API_BASE_URL.replace(/\/$/, '');
  const hubToken = env.HUBITAT_MAKER_API_ACCESS_TOKEN;

  const makerRes = await fetch(`${hubBase}/devices/all?access_token=${encodeURIComponent(hubToken)}`);
  if (!makerRes.ok) throw new Error(`Maker API devices/all failed: ${makerRes.status}`);
  const devices = await makerRes.json();
  const exported = new Set(devices.map((d) => String(d.id)));

  const ha = await haConnect({ baseUrl, token });
  try {
    const entries = await ha.call('config/entity_registry/list');
    const hubEntries = entries.filter((e) => e.platform === 'hubitat');

    const orphans = [];
    for (const e of hubEntries) {
      const uid = String(e.unique_id || '');
      const m = uid.match(/::(\d+)::/);
      if (!m) continue;
      const devId = m[1];
      if (!exported.has(devId)) {
        orphans.push({ entity_id: e.entity_id, unique_id: uid, disabled_by: e.disabled_by });
      }
    }

    if (!orphans.length) {
      console.log('No hubitat orphan entities found.');
      return;
    }

    // Apply allowlist/denylist filtering
    const filteredOrphans = orphans.filter(o => {
      // Skip if already disabled
      if (o.disabled_by === 'user') return false;
      
      // Always disable entities in denylist
      if (denylist.includes(o.entity_id)) return true;
      
      // Skip entities in allowlist
      if (allowlist.includes(o.entity_id)) return false;
      
      return true;
    });

    if (!filteredOrphans.length) {
      const allowed = orphans.filter(o => allowlist.includes(o.entity_id)).length;
      const denied = orphans.filter(o => denylist.includes(o.entity_id)).length;
      console.log(`No orphan entities to disable after filtering (${allowed} allowed, ${denied} in denylist).`);
      return;
    }

    console.log(`Found ${orphans.length} orphan hubitat entities.`);
    if (allowlist.length) console.log(`  - ${allowlist.length} entities in allowlist will be skipped`);
    if (denylist.length) console.log(`  - ${denylist.length} entities in denylist will be disabled`);
    console.log(`  - ${filteredOrphans.length} entities to process`);
    
    if (dryRun) {
      console.log('\nDRY RUN - No changes will be made. Entities that would be disabled:');
      for (const o of filteredOrphans) {
        console.log(`  - ${o.entity_id}`);
      }
      console.log(`\nDry run complete. Would disable ${filteredOrphans.length} entities.`);
      return;
    }

    console.log(`Disabling ${filteredOrphans.length} entities...`);

    let changed = 0;
    for (const o of filteredOrphans) {
      await ha.call('config/entity_registry/update', { entity_id: o.entity_id, disabled_by: 'user' });
      changed++;
      console.log(`disabled: ${o.entity_id}`);
    }

    console.log(`Done. Disabled ${changed} entities.`);
  } finally {
    ha.close();
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
