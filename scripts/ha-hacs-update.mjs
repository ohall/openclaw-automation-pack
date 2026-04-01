#!/usr/bin/env node

/**
 * Trigger Home Assistant `update.install` for any update entities that are "on".
 *
 * This is a pragmatic way to update HACS custom integrations without clicking UI.
 * It relies on the update entities exposed by those integrations.
 *
 * Usage:
 *   node scripts/ha-hacs-update.mjs [--dry-run] [--auto-restart] [--wait-for-healthy] [--timeout 300] [--interval 5] [--help]
 */

import { loadEnvFile, requireKeys } from './_env.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHelp() {
  console.log(`Usage: node ha-hacs-update.mjs [options]

Options:
  --dry-run             Show what would be updated without actually installing
  --auto-restart        Restart Home Assistant Core after successful updates
  --wait-for-healthy    Wait for HA to come back online after restart (requires --auto-restart)
  --timeout <seconds>   Maximum time to wait for HA to come back (default: 300)
  --interval <seconds>  Polling interval in seconds when waiting (default: 5)
  --help                Show this help message

Environment variables:
  ALLOWLIST             Comma-separated list of entity_ids to allow (optional)
  HA_ENV_FILE           Path to environment file (default: homeassistant-api.env)

Examples:
  # Show what would be updated
  node ha-hacs-update.mjs --dry-run
  
  # Update and automatically restart
  node ha-hacs-update.mjs --auto-restart
  
  # Update, restart, and wait for HA to come back
  node ha-hacs-update.mjs --auto-restart --wait-for-healthy
  
  # Update, restart, wait with custom timeout
  node ha-hacs-update.mjs --auto-restart --wait-for-healthy --timeout 600 --interval 10
`);
}

async function restartHomeAssistant(baseUrl, token) {
  const res = await fetch(`${baseUrl}/api/services/homeassistant/restart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to restart Home Assistant: ${res.status} ${text}`);
  }

  console.log('[INFO] Restart command sent successfully');
}

async function waitForHomeAssistant(baseUrl, token, timeoutSec, intervalSec) {
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;
  const intervalMs = intervalSec * 1000;
  let attempts = 0;

  console.log(`[INFO] Waiting for Home Assistant to come back online...`);
  console.log(`[INFO] Timeout: ${timeoutSec}s, Polling every: ${intervalSec}s`);

  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    
    try {
      // Try to connect to the API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(`${baseUrl}/api/`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (res.ok) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[SUCCESS] Home Assistant is back online after ${elapsed}s (${attempts} attempts)`);
        return true;
      }
    } catch (error) {
      // Expected during restart - API is not available yet
      if (error.name === 'AbortError') {
        console.log(`[INFO] Attempt ${attempts}: Connection timed out, still waiting...`);
      } else {
        console.log(`[INFO] Attempt ${attempts}: Not ready yet, retrying in ${intervalSec}s...`);
      }
    }

    await sleep(intervalMs);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  throw new Error(`Timeout after ${elapsed}s. Home Assistant did not come back online.`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let dryRun = false;
  let autoRestart = false;
  let waitForHealthy = false;
  let timeoutSec = 300;
  let intervalSec = 5;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        printHelp();
        return;
      case '--dry-run':
        dryRun = true;
        break;
      case '--auto-restart':
        autoRestart = true;
        break;
      case '--wait-for-healthy':
        waitForHealthy = true;
        break;
      case '--timeout':
        timeoutSec = parseInt(args[++i], 10);
        if (isNaN(timeoutSec) || timeoutSec < 1) {
          console.error('[ERROR] Invalid timeout value');
          process.exit(1);
        }
        break;
      case '--interval':
        intervalSec = parseInt(args[++i], 10);
        if (isNaN(intervalSec) || intervalSec < 1) {
          console.error('[ERROR] Invalid interval value');
          process.exit(1);
        }
        break;
      default:
        if (args[i].startsWith('--')) {
          console.error(`[ERROR] Unknown option: ${args[i]}`);
          process.exit(1);
        }
    }
  }

  // Validate argument combinations
  if (waitForHealthy && !autoRestart) {
    console.error('[ERROR] --wait-for-healthy requires --auto-restart');
    process.exit(1);
  }

  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  const allow = (process.env.ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Log mode
  console.log(`[INFO] HACS Update Script`);
  console.log(`[INFO] Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (dryRun) console.log(`[INFO] This is a dry run - no updates will be installed`);

  // Fetch current states
  const res = await fetch(`${baseUrl}/api/states`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /api/states failed: ${res.status}`);
  const states = await res.json();

  // Find updates that need installation
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
      domain: s.attributes?.domain || 'unknown',
    }))
    .filter((u) => (allow.length ? allow.includes(u.entity_id) : true));

  if (!updates.length) {
    console.log('[INFO] No update.* entities need installation.');
    return;
  }

  // Report what we found
  console.log(`\n[INFO] Found ${updates.length} update(s) ready for installation:`);
  for (const u of updates) {
    console.log(`  - ${u.entity_id} (${u.installed} -> ${u.latest}) [${u.title}]`);
  }

  // Dry run check
  if (dryRun) {
    console.log(`\n[DRY RUN] Would install ${updates.length} update(s)`);
    if (autoRestart) {
      console.log(`[DRY RUN] Would restart Home Assistant after updates`);
      if (waitForHealthy) {
        console.log(`[DRY RUN] Would wait for HA to come back online (timeout: ${timeoutSec}s)`);
      }
    }
    return;
  }

  // Install updates
  console.log(`\n[INFO] Installing updates...`);
  const installed = [];
  const failed = [];

  for (const u of updates) {
    try {
      console.log(`  [INSTALL] ${u.entity_id} (${u.installed} -> ${u.latest})...`);
      
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
        throw new Error(`API error: ${r.status} ${text}`);
      }
      
      console.log(`  [SUCCESS] ${u.entity_id} installation triggered`);
      installed.push(u);
    } catch (error) {
      console.error(`  [ERROR] Failed to install ${u.entity_id}: ${error.message}`);
      failed.push({ ...u, error: error.message });
    }
  }

  // Report installation results
  console.log(`\n[INFO] Installation summary:`);
  console.log(`  - Successful: ${installed.length}`);
  console.log(`  - Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log(`\n[ERROR] Failed updates:`);
    for (const f of failed) {
      console.log(`  - ${f.entity_id}: ${f.error}`);
    }
  }

  // Give HA a moment to download/extract if anything was installed
  if (installed.length > 0) {
    console.log(`\n[INFO] Waiting 20s for downloads/extraction to complete...`);
    await sleep(20_000);
  }

  // Auto-restart if requested
  if (autoRestart && installed.length > 0) {
    console.log(`\n[INFO] Auto-restart requested...`);
    
    try {
      await restartHomeAssistant(baseUrl, token);
      
      if (waitForHealthy) {
        // Wait for restart to begin
        console.log('[INFO] Waiting 10s for restart to initiate...');
        await sleep(10000);
        
        // Wait for HA to come back
        await waitForHomeAssistant(baseUrl, token, timeoutSec, intervalSec);
        
        console.log('\n[SUCCESS] Home Assistant restart completed successfully!');
      } else {
        console.log('[INFO] Restart triggered. Use --wait-for-healthy to wait for completion.');
      }
    } catch (error) {
      console.error(`[ERROR] Restart failed: ${error.message}`);
      console.error(`[INFO] Updates were installed successfully, but restart failed.`);
    }
  } else if (installed.length > 0) {
    console.log('\n[INFO] Done. You may need to restart Core for changes to load.');
  }

  // Exit with error if any updates failed
  if (failed.length > 0) {
    console.error(`\n[ERROR] ${failed.length} update(s) failed. Check logs above.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
