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
import { createRetryableFetch } from './_retry.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonOutputResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
  console.log(`Usage: node ha-hacs-update.mjs [options]

Options:
  --dry-run             Show what would be updated without actually installing
  --auto-restart        Restart Home Assistant Core after successful updates
  --wait-for-healthy    Wait for HA to come back online after restart (requires --auto-restart)
  --timeout <seconds>   Maximum time to wait for HA to come back (default: 300)
  --interval <seconds>  Polling interval in seconds when waiting (default: 5)
  --json                Output results in JSON format for machine parsing
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
  
  # Output JSON format
  node ha-hacs-update.mjs --dry-run --json
`);
}

async function restartHomeAssistant(baseUrl, token, jsonOutput = false) {
  // Create retryable fetch with configuration for restart operations
  const retryFetch = createRetryableFetch({
    maxAttempts: 3,
    baseDelayMs: 2000,
    operationName: 'Restart Home Assistant',
  });

  const res = await retryFetch(`${baseUrl}/api/services/homeassistant/restart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!jsonOutput) {
    console.log('[INFO] Restart command sent successfully');
  }
}

async function waitForHomeAssistant(baseUrl, token, timeoutSec, intervalSec, jsonOutput = false) {
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;
  const intervalMs = intervalSec * 1000;
  let attempts = 0;

  if (!jsonOutput) {
    console.log(`[INFO] Waiting for Home Assistant to come back online...`);
    console.log(`[INFO] Timeout: ${timeoutSec}s, Polling every: ${intervalSec}s`);
  }

  // Create retryable fetch for health checks (different config - quick retries)
  const healthRetryFetch = createRetryableFetch({
    maxAttempts: 2,
    baseDelayMs: 500,
    operationName: 'HA health check',
  });

  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    
    try {
      // Try to connect to the API with retry
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await healthRetryFetch(`${baseUrl}/api/`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (res.ok) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (!jsonOutput) {
          console.log(`[SUCCESS] Home Assistant is back online after ${elapsed}s (${attempts} attempts)`);
        }
        return true;
      }
    } catch (error) {
      // Expected during restart - API is not available yet
      if (!jsonOutput) {
        if (error.name === 'AbortError') {
          console.log(`[INFO] Attempt ${attempts}: Connection timed out, still waiting...`);
        } else {
          console.log(`[INFO] Attempt ${attempts}: Not ready yet, retrying in ${intervalSec}s...`);
        }
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
  let jsonOutput = false;

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
      case '--json':
        jsonOutput = true;
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

  // Create retryable fetch for HA API calls
  const retryFetch = createRetryableFetch({
    maxAttempts: 3,
    baseDelayMs: 1000,
    operationName: 'HA API call',
  });

  // Log mode
  if (!jsonOutput) {
    console.log(`[INFO] HACS Update Script`);
    console.log(`[INFO] Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    if (dryRun) console.log(`[INFO] This is a dry run - no updates will be installed`);
  }

  // Fetch current states with retry
  const res = await retryFetch(`${baseUrl}/api/states`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
    if (jsonOutput) {
      jsonOutputResult({
        timestamp: new Date().toISOString(),
        action: 'hacs-update',
        result: 'no-updates-found',
        parameters: {
          dryRun,
          autoRestart,
          waitForHealthy,
          timeoutSec,
          intervalSec,
          allowlistCount: allow.length
        },
        summary: {
          totalUpdateEntities: states.filter(s => s.entity_id.startsWith('update.')).length,
          pendingUpdates: 0,
          updatesFound: 0
        }
      });
    } else {
      console.log('[INFO] No update.* entities need installation.');
    }
    return;
  }

  // Report what we found
  if (!jsonOutput) {
    console.log(`\n[INFO] Found ${updates.length} update(s) ready for installation:`);
    for (const u of updates) {
      console.log(`  - ${u.entity_id} (${u.installed} -> ${u.latest}) [${u.title}]`);
    }
  }

  // Dry run check
  if (dryRun) {
    if (jsonOutput) {
      jsonOutputResult({
        timestamp: new Date().toISOString(),
        action: 'hacs-update',
        result: 'dry-run',
        parameters: {
          dryRun: true,
          autoRestart,
          waitForHealthy,
          timeoutSec,
          intervalSec,
          allowlistCount: allow.length
        },
        summary: {
          totalUpdateEntities: states.filter(s => s.entity_id.startsWith('update.')).length,
          pendingUpdates: updates.length,
          updatesToInstall: updates.length
        },
        updates: updates.map(u => ({
          entity_id: u.entity_id,
          title: u.title,
          installed: u.installed,
          latest: u.latest,
          domain: u.domain
        })),
        restartInfo: autoRestart ? {
          wouldRestart: true,
          wouldWaitForHealthy: waitForHealthy,
          waitTimeout: waitForHealthy ? timeoutSec : undefined,
          waitInterval: waitForHealthy ? intervalSec : undefined
        } : { wouldRestart: false }
      });
    } else {
      console.log(`\n[DRY RUN] Would install ${updates.length} update(s)`);
      if (autoRestart) {
        console.log(`[DRY RUN] Would restart Home Assistant after updates`);
        if (waitForHealthy) {
          console.log(`[DRY RUN] Would wait for HA to come back online (timeout: ${timeoutSec}s)`);
        }
      }
    }
    return;
  }

  // Install updates
  if (!jsonOutput) {
    console.log(`\n[INFO] Installing updates...`);
  }
  const installed = [];
  const failed = [];

  for (const u of updates) {
    try {
      if (!jsonOutput) {
        console.log(`  [INSTALL] ${u.entity_id} (${u.installed} -> ${u.latest})...`);
      }
      
      const r = await retryFetch(`${baseUrl}/api/services/update/install`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity_id: u.entity_id }),
      });
      
      if (!jsonOutput) {
        console.log(`  [SUCCESS] ${u.entity_id} installation triggered`);
      }
      installed.push(u);
    } catch (error) {
      if (!jsonOutput) {
        console.error(`  [ERROR] Failed to install ${u.entity_id}: ${error.message}`);
      }
      failed.push({ ...u, error: error.message });
    }
  }

  // Report installation results
  if (!jsonOutput) {
    console.log(`\n[INFO] Installation summary:`);
    console.log(`  - Successful: ${installed.length}`);
    console.log(`  - Failed: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log(`\n[ERROR] Failed updates:`);
      for (const f of failed) {
        console.log(`  - ${f.entity_id}: ${f.error}`);
      }
    }
  }

  // Give HA a moment to download/extract if anything was installed
  if (installed.length > 0) {
    if (!jsonOutput) {
      console.log(`\n[INFO] Waiting 20s for downloads/extraction to complete...`);
    }
    await sleep(20_000);
  }

  // Auto-restart if requested
  let restartResult = null;
  if (autoRestart && installed.length > 0) {
    if (!jsonOutput) {
      console.log(`\n[INFO] Auto-restart requested...`);
    }
    
    try {
      await restartHomeAssistant(baseUrl, token, jsonOutput);
      restartResult = { restartTriggered: true, restartError: null };
      
      if (waitForHealthy) {
        // Wait for restart to begin
        if (!jsonOutput) {
          console.log('[INFO] Waiting 10s for restart to initiate...');
        }
        await sleep(10000);
        
        // Wait for HA to come back
        await waitForHomeAssistant(baseUrl, token, timeoutSec, intervalSec, jsonOutput);
        restartResult.waitForHealthy = true;
        restartResult.healthy = true;
        
        if (!jsonOutput) {
          console.log('\n[SUCCESS] Home Assistant restart completed successfully!');
        }
      } else {
        restartResult.waitForHealthy = false;
        if (!jsonOutput) {
          console.log('[INFO] Restart triggered. Use --wait-for-healthy to wait for completion.');
        }
      }
    } catch (error) {
      restartResult = { restartTriggered: true, restartError: error.message, waitForHealthy };
      if (!jsonOutput) {
        console.error(`[ERROR] Restart failed: ${error.message}`);
        console.error(`[INFO] Updates were installed successfully, but restart failed.`);
      }
    }
  } else if (installed.length > 0 && !jsonOutput) {
    console.log('\n[INFO] Done. You may need to restart Core for changes to load.');
  }

  // Output JSON result if requested
  if (jsonOutput) {
    const result = {
      timestamp: new Date().toISOString(),
      action: 'hacs-update',
      result: failed.length > 0 ? 'partial-failure' : (installed.length > 0 ? 'success' : 'no-changes'),
      parameters: {
        dryRun: false,
        autoRestart,
        waitForHealthy,
        timeoutSec,
        intervalSec,
        allowlistCount: allow.length
      },
      summary: {
        totalUpdateEntities: states.filter(s => s.entity_id.startsWith('update.')).length,
        pendingUpdates: updates.length,
        updatesInstalled: installed.length,
        updatesFailed: failed.length
      },
      updates: updates.map(u => ({
        entity_id: u.entity_id,
        title: u.title,
        installed: u.installed,
        latest: u.latest,
        domain: u.domain,
        status: failed.find(f => f.entity_id === u.entity_id) ? 'failed' : 'installed'
      })),
      installed: installed.map(u => u.entity_id),
      failed: failed.map(f => ({
        entity_id: f.entity_id,
        error: f.error
      })),
      restart: restartResult
    };
    
    jsonOutputResult(result);
  }

  // Exit with error if any updates failed
  if (failed.length > 0) {
    if (!jsonOutput) {
      console.error(`\n[ERROR] ${failed.length} update(s) failed. Check logs above.`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
