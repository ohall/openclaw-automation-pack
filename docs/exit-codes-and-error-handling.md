# Exit Codes and Error Handling Standards

## Overview

This document outlines the standardized approach to exit codes and error message formatting for all automation scripts in this repository.

## Exit Code Convention

All scripts should use the following exit codes for consistency:

| Exit Code | Constant | Meaning |
|-----------|----------|---------|
| 0 | `SUCCESS` | Operation completed successfully |
| 1 | `GENERAL_ERROR` | General/unclassified error |
| 2 | `USAGE_ERROR` | Invalid command-line arguments or usage |
| 3 | `CONFIG_ERROR` | Configuration or connection error |
| 4 | `OPERATION_FAILED` | API call or operation failed |
| 5 | `VALIDATION_FAILED` | Validation or precondition check failed |
| 6 | `TIMEOUT` | Operation timed out |
| 7 | `AUTH_ERROR` | Authentication or permission error |
| 8 | `DRY_RUN` | Dry run completed (not an error) |
| 9 | `PARTIAL_SUCCESS` | Some operations succeeded, others failed |

## Error Message Format

All error messages should follow this standardized format:

```
[ERROR] Action: <what was attempted>
  Target: <what entity/resource was targeted>
  Rollback: <suggested recovery steps>
  Details: <technical error details>
  Script: <script name>
```

### Example

```bash
[ERROR] Action: rename entity
  Target: sensor.temperature -> sensor.temp_new
  Rollback: Check backup at ./backups/entity-registry-2025-04-12T18-00-00Z.json for recovery
  Details: Entity not found: sensor.temperature
  Script: ha-entity-rename.mjs
```

## Using the `_exit-codes.mjs` Module

### Import

```javascript
import { ExitCodes, exitWithError, exitWithSuccess, exitWithDryRun } from './_exit-codes.mjs';
```

### Exiting with Success

```javascript
exitWithSuccess({
  message: 'Operation completed successfully',
  data: { /* optional additional data for JSON output */ },
  json: false, // or true for JSON output mode
});
```

### Exiting with Dry Run

```javascript
exitWithDryRun({
  message: 'Dry run completed - no changes were made',
  plan: [ // optional array of planned actions
    'Step 1: Backup configuration',
    'Step 2: Update entity',
  ],
  json: false,
});
```

### Exiting with Error

```javascript
exitWithError({
  action: 'rename entity',
  target: 'sensor.temperature -> sensor.temp_new',
  rollback: 'Use backup file for recovery',
  details: error.message,
  code: ExitCodes.OPERATION_FAILED,
  json: false,
});
```

## JSON Output Mode

When scripts support `--json` flag, they should output structured JSON instead of human-readable text. The `exitWith*` functions automatically handle JSON formatting when `json: true` is passed.

### Success JSON Output

```json
{
  "timestamp": "2025-04-12T18:00:00.000Z",
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    "note": "Additional information"
  }
}
```

### Error JSON Output

```json
{
  "timestamp": "2025-04-12T18:00:00.000Z",
  "success": false,
  "error": {
    "action": "rename entity",
    "target": "sensor.temperature -> sensor.temp_new",
    "rollback": "Use backup file for recovery",
    "details": "Entity not found",
    "code": 4
  }
}
```

## Best Practices

1. **Always include rollback instructions** when an operation fails after making changes
2. **Be specific about the target** - include entity IDs, file paths, or resource identifiers
3. **Keep error details technical** but avoid exposing secrets or sensitive information
4. **Use appropriate exit codes** - don't always use `1` for everything
5. **Support both text and JSON output** for machine parsing
6. **Test error paths** as thoroughly as success paths

## Example Implementation

See `ha-entity-rename.mjs` for a complete example of standardized error handling and exit codes.

## Migration Guide

To update existing scripts:

1. Add import for `_exit-codes.mjs`
2. Replace `console.error()` calls with `exitWithError()`
3. Replace `console.log()` for success messages with `exitWithSuccess()`
4. Replace dry-run notifications with `exitWithDryRun()`
5. Update `process.exit(n)` calls to use `ExitCodes` constants