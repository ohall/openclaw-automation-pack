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

    console.log(`Found ${orphans.length} orphan hubitat entities. Disabling...`);

    let changed = 0;
    for (const o of orphans) {
      if (o.disabled_by === 'user') continue;
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
