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