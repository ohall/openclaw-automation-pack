#!/usr/bin/env node

/**
 * Restart Home Assistant core and wait for the API to respond.
 *
 * This script:
 * - Triggers a Core restart via the API
 * - Polls the /api/ endpoint until it responds (indicating HA is back up)
 * - Configurable timeout and poll interval
 * - Supports dry-run mode for safety
 *
 * Usage:
 *   node scripts/ha-restart-and-wait.mjs [--dry-run] [--timeout 300] [--interval 5]
 */

import { loadEnvFile, requireKeys } from './_env.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHelp() {
  console.log(`Usage: node ha-restart-and-wait.mjs [options]

Options:
  --dry-run           Show what would be done without actually restarting
  --timeout <seconds> Maximum time to wait for HA to come back (default: 300)
  --interval <seconds> Polling interval in seconds (default: 5)
  --help              Show this help message

Examples:
  node ha-restart-and-wait.mjs
  node ha-restart-and-wait.mjs --timeout 600 --interval 10
  node ha-restart-and-wait.mjs --dry-run
`);
}

async function restartHomeAssistant(baseUrl, token, dryRun = false) {
  if (dryRun) {
    console.log('[DRY-RUN] Would send restart command to Home Assistant');
    console.log(`[DRY-RUN] Endpoint: ${baseUrl}/api/services/homeassistant/restart`);
    return;
  }

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

  if (args.includes('--help')) {
    printHelp();
    return;
  }

  // Parse command line arguments
  let dryRun = false;
  let timeoutSec = 300;
  let intervalSec = 5;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
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

  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  try {
    if (dryRun) {
      console.log('[DRY-RUN] ====== Home Assistant Restart (Dry Run) ======\n');
      console.log(`[DRY-RUN] Would send restart command to: ${baseUrl}/api/services/homeassistant/restart`);
      console.log(`[DRY-RUN] Would wait 10s for restart to initiate...`);
      console.log(`[DRY-RUN] Would then wait up to ${timeoutSec}s for HA to come back online`);
      console.log(`[DRY-RUN] Would poll every ${intervalSec}s`);
      console.log(`\n[DRY-RUN] No actual restart would be performed.`);
      console.log('\n[DRY-RUN] ====== Dry Run Complete ======');
      return;
    }

    // Trigger restart
    await restartHomeAssistant(baseUrl, token, dryRun);

    // Wait for restart to begin (give HA a moment to actually start shutting down)
    console.log('[INFO] Waiting 10s for restart to initiate...');
    await sleep(10000);

    // Wait for HA to come back
    await waitForHomeAssistant(baseUrl, token, timeoutSec, intervalSec);

    console.log('\n[SUCCESS] Home Assistant restart completed successfully!');
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
