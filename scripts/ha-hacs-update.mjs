#!/usr/bin/env node

/**
 * Trigger Home Assistant `update.install` for any update entities that are "on".
 *
 * This is a pragmatic way to update HACS custom integrations without clicking UI.
 * It relies on the update entities exposed by those integrations.
 */

import { loadEnvFile, requireKeys } from './_env.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  const allow = (process.env.ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const res = await fetch(`${baseUrl}/api/states`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /api/states failed: ${res.status}`);
  const states = await res.json();

  const updates = states
    .filter((s) => typeof s.entity_id === 'string' && s.entity_id.startsWith('update.'))
    .filter((s) => s.state === 'on')
    .filter((s) => {
      const installed = s.attributes?.installed_version;
      const latest = s.attributes?.latest_version;
      return installed && latest && installed !== latest;
    })
    .map((s) => ({
      entity_id: s.entity_id,
      title: s.attributes?.title || s.attributes?.friendly_name || s.entity_id,
      installed: s.attributes?.installed_version,
      latest: s.attributes?.latest_version,
    }))
    .filter((u) => (allow.length ? allow.includes(u.entity_id) : true));

  if (!updates.length) {
    console.log('No update.* entities need installation.');
    return;
  }

  console.log('Will install:');
  for (const u of updates) {
    console.log(`- ${u.entity_id} (${u.installed} -> ${u.latest}) [${u.title}]`);
  }

  for (const u of updates) {
    const r = await fetch(`${baseUrl}/api/services/update/install`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: u.entity_id }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Failed to install ${u.entity_id}: ${r.status} ${text}`);
    }
    console.log(`Triggered install: ${u.entity_id}`);
  }

  // Give HA a moment to download/extract.
  await sleep(20_000);

  console.log('Done (installs triggered). You may need to restart Core for changes to load.');
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
