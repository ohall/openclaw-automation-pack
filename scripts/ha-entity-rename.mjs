#!/usr/bin/env node

/**
 * Safely rename Home Assistant entity IDs with backup/export functionality.
 *
 * This script helps rename entities while:
 * - Creating backups of current entity registry
 * - Validating the rename operation
 * - Supporting dry-run mode for safety
 * - Exporting current entity info for recovery
 *
 * Usage:
 *   node scripts/ha-entity-rename.mjs --from old_entity --to new_entity [--dry-run] [--backup-dir ./backups]
 */

import fs from 'node:fs';
import path from 'node:path';
import { getValidatedEnv } from './_env.mjs';
import { ExitCodes, exitWithError, exitWithSuccess, exitWithDryRun } from './_exit-codes.mjs';

function printHelp() {
  console.log(`Usage: node ha-entity-rename.mjs --from <old_entity> --to <new_entity> [options]

Options:
  --from <entity_id>    Source entity ID to rename (required)
  --to <entity_id>      Target entity ID (required)
  --dry-run            Show what would be done without making changes
  --backup-dir <dir>   Directory for backups (default: ./backups)
  --json               Output results in JSON format for machine parsing
  --yes                Required to proceed with destructive changes (unless using --dry-run)
  --force              Alias for --yes (same meaning)
  --help               Show this help message

Examples:
  node ha-entity-rename.mjs --from sensor.old_temp --to sensor.new_temp --dry-run
  node ha-entity-rename.mjs --from light.kitchen --to light.kitchen_main --backup-dir /tmp/ha-backups --yes
  node ha-entity-rename.mjs --from sensor.temp --to sensor.temperature --json --yes
`);
}

async function createBackup(baseUrl, token, backupDir, jsonOutput = false) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `entity-registry-${timestamp}.json`);

  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Export current entity registry
  const res = await fetch(`${baseUrl}/api/config/entity_registry/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get entity registry: ${res.status}`);
  }

  const entities = await res.json();
  fs.writeFileSync(backupFile, JSON.stringify(entities, null, 2));

  if (!jsonOutput) {
    console.log(`[BACKUP] Created backup: ${backupFile}`);
  }
  return { backupFile, entityCount: entities.length };
}

async function getEntityInfo(baseUrl, token, entityId) {
  const res = await fetch(`${baseUrl}/api/config/entity_registry/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get entity registry: ${res.status}`);
  }

  const entities = await res.json();
  return entities.find(e => e.entity_id === entityId);
}

async function updateEntityId(
  baseUrl,
  token,
  oldEntityId,
  newEntityId,
  dryRun = false,
  jsonOutput = false
) {
  if (dryRun) {
    if (!jsonOutput) {
      console.log(`[DRY-RUN] Would rename ${oldEntityId} -> ${newEntityId}`);
    }
    return { action: 'rename', performed: false, from: oldEntityId, to: newEntityId };
  }

  const res = await fetch(`${baseUrl}/api/config/entity_registry/update/${oldEntityId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      entity_id: newEntityId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to rename entity: ${res.status} ${text}`);
  }

  if (!jsonOutput) {
    console.log(`[SUCCESS] Renamed ${oldEntityId} -> ${newEntityId}`);
  }

  return { action: 'rename', performed: true, from: oldEntityId, to: newEntityId, success: true };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    return;
  }

  // Parse command line arguments
  let fromEntity = null;
  let toEntity = null;
  let dryRun = false;
  let backupDir = './backups';
  let jsonOutput = false;
  let yesFlag = false;
  let forceFlag = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from':
        fromEntity = args[++i];
        break;
      case '--to':
        toEntity = args[++i];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--backup-dir':
        backupDir = args[++i];
        break;
      case '--json':
        jsonOutput = true;
        break;
      case '--yes':
        yesFlag = true;
        break;
      case '--force':
        forceFlag = true;
        break;
      default:
        if (args[i].startsWith('--')) {
          console.error(`[ERROR] Unknown option: ${args[i]}`);
          process.exit(1);
        }
    }
  }

  if (!fromEntity || !toEntity) {
    if (jsonOutput) {
      console.log(
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            action: 'entity-rename',
            success: false,
            error: 'Both --from and --to entity IDs are required',
            parameters: {},
          },
          null,
          2
        )
      );
    } else {
      console.error('[ERROR] Both --from and --to entity IDs are required');
      printHelp();
    }
    process.exit(1);
  }

  // Load and validate environment
  const env = getValidatedEnv({
    envFile: process.env.HA_ENV_FILE,
    requiredKeys: ['HA_BASE_URL', 'HA_LONG_LIVED_ACCESS_TOKEN']
  });

  const baseUrl = env.HA_BASE_URL.replace(/\/$/, '');
  const token = env.HA_LONG_LIVED_ACCESS_TOKEN;

  // Require explicit confirmation for destructive operations
  const confirmed = yesFlag || forceFlag;
  if (!confirmed && !dryRun) {
    console.error(
      'ERROR: This command will make destructive changes to your Home Assistant configuration.'
    );
    console.error(
      '       To proceed, you must provide the --yes or --force flag to confirm you want to rename entities.'
    );
    console.error('');
    console.error(
      '       To see what would be changed without making changes, run with --dry-run flag.'
    );
    process.exit(1);
  }

  // Handle dry-run with JSON output early
  if (dryRun && jsonOutput) {
    const dryRunResult = {
      timestamp: new Date().toISOString(),
      action: 'entity-rename',
      performed: false,
      mode: 'dry-run',
      parameters: {
        from: fromEntity,
        to: toEntity,
        backupDir,
        baseUrl: baseUrl,
      },
      steps: [
        {
          action: 'validateSource',
          wouldPerform: true,
          check: `Check if entity ${fromEntity} exists`,
        },
        {
          action: 'validateTarget',
          wouldPerform: true,
          check: `Check if entity ${toEntity} already exists`,
        },
        {
          action: 'createBackup',
          wouldPerform: true,
          description: `Create entity registry backup in ${backupDir}`,
        },
        {
          action: 'rename',
          wouldPerform: true,
          description: `Rename ${fromEntity} -> ${toEntity}`,
        },
      ],
      note: 'No actual changes would be made in dry-run mode',
    };
    console.log(JSON.stringify(dryRunResult, null, 2));
    return;
  }

  try {
    // Validate source entity exists
    const sourceEntity = await getEntityInfo(baseUrl, token, fromEntity);
    if (!sourceEntity) {
      if (jsonOutput) {
        console.log(
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              action: 'entity-rename',
              success: false,
              error: `Source entity not found: ${fromEntity}`,
              parameters: { from: fromEntity, to: toEntity, dryRun, backupDir },
            },
            null,
            2
          )
        );
      } else {
        console.error(`[ERROR] Source entity not found: ${fromEntity}`);
      }
      process.exit(1);
    }

    // Check if target entity already exists
    const targetEntity = await getEntityInfo(baseUrl, token, toEntity);
    if (targetEntity) {
      if (jsonOutput) {
        console.log(
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              action: 'entity-rename',
              success: false,
              error: `Target entity already exists: ${toEntity}`,
              parameters: { from: fromEntity, to: toEntity, dryRun, backupDir },
            },
            null,
            2
          )
        );
      } else {
        console.error(`[ERROR] Target entity already exists: ${toEntity}`);
      }
      process.exit(1);
    }

    if (!jsonOutput) {
      console.log(`[INFO] Source entity: ${fromEntity}`);
      console.log(`[INFO] Platform: ${sourceEntity.platform}`);
      console.log(`[INFO] Device Class: ${sourceEntity.device_class || 'None'}`);
      console.log(`[INFO] Name: ${sourceEntity.name || 'None'}`);
    }

    let backupResult = null;
    if (!dryRun) {
      // Create backup before making changes
      backupResult = await createBackup(baseUrl, token, backupDir, jsonOutput);
    }

    // Perform the rename
    const renameResult = await updateEntityId(
      baseUrl,
      token,
      fromEntity,
      toEntity,
      dryRun,
      jsonOutput
    );
if (jsonOutput) {
      const result = {
        timestamp: new Date().toISOString(),
        action: 'entity-rename',
        success: true,
        parameters: {
          from: fromEntity,
          to: toEntity,
          dryRun,
          backupDir,
        },
        sourceEntity: {
          entity_id: sourceEntity.entity_id,
          platform: sourceEntity.platform,
          device_class: sourceEntity.device_class,
          name: sourceEntity.name,
        },
        backup: backupResult,
        rename: renameResult,
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(ExitCodes.SUCCESS);
    } else {
      if (dryRun) {
        exitWithDryRun({
          message: `Entity rename from ${fromEntity} to ${toEntity} would be performed`,
          plan: [
            `Backup entity registry to ${backupResult?.path || backupDir}`,
            `Rename entity: ${fromEntity} → ${toEntity}`,
            'Note: Home Assistant restart may be required for changes to take full effect',
          ],
          json: jsonOutput,
        });
      } else {
        exitWithSuccess({
          message: `Entity renamed from ${fromEntity} to ${toEntity} successfully`,
          data: {
            note: 'Home Assistant restart may be required for changes to take full effect',
            backup: backupResult?.path,
          },
          json: jsonOutput,
        });
      }
    }
  } catch (error) {
    exitWithError({
      action: 'rename entity',
      target: `${fromEntity} -> ${toEntity}`,
      rollback: dryRun ? 'No changes were made (dry run)' : `Check backup at ${backupResult?.path || backupDir} for recovery`,
      details: error.message,
      code: ExitCodes.OPERATION_FAILED,
      json: jsonOutput,
    });
  }
}

main().catch(e => {
  exitWithError({
    action: 'run entity rename script',
    target: 'script execution',
    rollback: 'No changes were made',
    details: e?.stack || String(e),
    code: ExitCodes.GENERAL_ERROR,
    json: false,
  });
});
