#!/usr/bin/env node

/**
 * Restart Home Assistant core and wait for the API to respond.
 *
 * This script:
 * - Triggers a Core restart via the API
 * - Polls the /api/ endpoint until it responds (indicating HA is back up)
 * - Configurable timeout and poll interval
 * - Supports dry-run mode for safety
 * - Supports JSON output mode for machine parsing
 *
 * Usage:
 *   node scripts/ha-restart-and-wait.mjs [--dry-run] [--timeout 300] [--interval 5] [--json]
 */

import { loadEnvFile, requireKeys } from './_env.mjs';
import { createRetryableFetch } from './_retry.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHelp() {
  console.log(`Usage: node ha-restart-and-wait.mjs [options]

Options:
  --dry-run           Show what would be done without actually restarting
  --timeout <seconds> Maximum time to wait for HA to come back (default: 300)
  --interval <seconds> Polling interval in seconds (default: 5)
  --json              Output results in JSON format for machine parsing
  --help              Show this help message

Examples:
  node ha-restart-and-wait.mjs
  node ha-restart-and-wait.mjs --timeout 600 --interval 10
  node ha-restart-and-wait.mjs --dry-run
  node ha-restart-and-wait.mjs --json
`);
}

async function restartHomeAssistant(baseUrl, token, dryRun = false, jsonOutput = false) {
  if (dryRun) {
    if (!jsonOutput) {
      console.log('[DRY-RUN] Would send restart command to Home Assistant');
      console.log(`[DRY-RUN] Endpoint: ${baseUrl}/api/services/homeassistant/restart`);
    }
    return { action: 'restart', performed: false, endpoint: `${baseUrl}/api/services/homeassistant/restart` };
  }

  // Create retryable fetch for restart operations
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
  
  return { action: 'restart', performed: true, endpoint: `${baseUrl}/api/services/homeassistant/restart`, success: true };
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

  // Create retryable fetch for health checks (quick retries)
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
        return { 
          success: true, 
          elapsedSeconds: parseFloat(elapsed), 
          attempts: attempts,
          timestamp: new Date().toISOString()
        };
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
  if (!jsonOutput) {
    throw new Error(`Timeout after ${elapsed}s. Home Assistant did not come back online.`);
  } else {
    return { 
      success: false, 
      elapsedSeconds: parseFloat(elapsed), 
      attempts: attempts,
      timeout: timeoutSec,
      timestamp: new Date().toISOString(),
      error: `Timeout after ${elapsed}s. Home Assistant did not come back online.`
    };
  }
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
  let jsonOutput = false;

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

  const env = loadEnvFile(process.env.HA_ENV_FILE);
  requireKeys(env, ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']);

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  try {
    if (dryRun) {
      if (jsonOutput) {
        const result = {
          timestamp: new Date().toISOString(),
          action: 'dry-run',
          performed: false,
          parameters: {
            timeoutSeconds: timeoutSec,
            intervalSeconds: intervalSec,
            baseUrl: baseUrl
          },
          steps: [
            {
              action: 'restart',
              endpoint: `${baseUrl}/api/services/homeassistant/restart`,
              wouldPerform: true
            },
            {
              action: 'waitForInitiation',
              durationSeconds: 10,
              wouldPerform: true
            },
            {
              action: 'waitForOnline',
              timeoutSeconds: timeoutSec,
              intervalSeconds: intervalSec,
              wouldPerform: true
            }
          ]
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('[DRY-RUN] ====== Home Assistant Restart (Dry Run) ======\n');
        console.log(`[DRY-RUN] Would send restart command to: ${baseUrl}/api/services/homeassistant/restart`);
        console.log(`[DRY-RUN] Would wait 10s for restart to initiate...`);
        console.log(`[DRY-RUN] Would then wait up to ${timeoutSec}s for HA to come back online`);
        console.log(`[DRY-RUN] Would poll every ${intervalSec}s`);
        console.log(`\n[DRY-RUN] No actual restart would be performed.`);
        console.log('\n[DRY-RUN] ====== Dry Run Complete ======');
      }
      return;
    }

    // Trigger restart
    const restartResult = await restartHomeAssistant(baseUrl, token, dryRun, jsonOutput);

    // Wait for restart to begin (give HA a moment to actually start shutting down)
    if (!jsonOutput) {
      console.log('[INFO] Waiting 10s for restart to initiate...');
    }
    await sleep(10000);

    // Wait for HA to come back
    const waitResult = await waitForHomeAssistant(baseUrl, token, timeoutSec, intervalSec, jsonOutput);

    if (jsonOutput) {
      const result = {
        timestamp: new Date().toISOString(),
        action: 'restart-and-wait',
        success: waitResult.success,
        restart: restartResult,
        wait: waitResult,
        parameters: {
          timeoutSeconds: timeoutSec,
          intervalSeconds: intervalSec,
          baseUrl: baseUrl
        }
      };
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n[SUCCESS] Home Assistant restart completed successfully!');
    }

    // If wait failed in JSON mode, exit with error
    if (jsonOutput && !waitResult.success) {
      process.exit(1);
    }
  } catch (error) {
    if (jsonOutput) {
      const result = {
        timestamp: new Date().toISOString(),
        action: 'restart-and-wait',
        success: false,
        error: error.message,
        parameters: {
          timeoutSeconds: timeoutSec,
          intervalSeconds: intervalSec,
          baseUrl: baseUrl
        }
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    } else {
      console.error(`[ERROR] ${error.message}`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
