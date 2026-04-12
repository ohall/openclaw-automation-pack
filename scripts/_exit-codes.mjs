#!/usr/bin/env node

import path from 'node:path';
import { safeStringify } from './_sanitize.mjs';

/**
 * Standardized exit codes and error message formatting for automation scripts.
 *
 * Exit codes follow convention:
 * - 0: Success
 * - 1: General error
 * - 2: Invalid arguments/usage error
 * - 3: Configuration/connection error
 * - 4: Operation failed (e.g., API call failed)
 * - 5: Validation/precondition failed
 * - 6: Timeout
 * - 7: Permission/authentication error
 * - 8: Dry run (not an error, but signals nothing was changed)
 * - 9: Partial success (some operations succeeded, others failed)
 *
 * Error messages should follow the format:
 * [ERROR] Action: <what was attempted>
 *   Target: <what entity/resource was targeted>
 *   Rollback: <suggested recovery steps>
 *   Details: <technical error details>
 */

/**
 * Exit code constants
 */
export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  CONFIG_ERROR: 3,
  OPERATION_FAILED: 4,
  VALIDATION_FAILED: 5,
  TIMEOUT: 6,
  AUTH_ERROR: 7,
  DRY_RUN: 8,
  PARTIAL_SUCCESS: 9,
};

/**
 * Format a standardized error message
 * @param {Object} options - Error message components
 * @param {string} options.action - What action was attempted
 * @param {string} options.target - What entity/resource was targeted
 * @param {string} options.rollback - Suggested recovery steps
 * @param {string} options.details - Technical error details
 * @param {string} options.script - Script name (optional, auto-detected)
 * @returns {string} Formatted error message
 */
export function formatErrorMessage({
  action,
  target,
  rollback,
  details,
  script = process.argv[1] ? path.basename(process.argv[1]) : 'script',
}) {
  const parts = [`[ERROR] Action: ${action}`];
  
  if (target) {
    parts.push(`  Target: ${target}`);
  }
  
  if (rollback) {
    parts.push(`  Rollback: ${rollback}`);
  }
  
  if (details) {
    parts.push(`  Details: ${details}`);
  }
  
  parts.push(`  Script: ${script}`);
  
  return parts.join('\n');
}

/**
 * Exit with a standardized error message and exit code
 * @param {Object} options - Error options
 * @param {string} options.action - What action was attempted
 * @param {string} options.target - What entity/resource was targeted
 * @param {string} options.rollback - Suggested recovery steps
 * @param {string} options.details - Technical error details
 * @param {number} options.code - Exit code (default: GENERAL_ERROR)
 * @param {boolean} options.json - Output as JSON (default: false)
 */
export function exitWithError({
  action,
  target = null,
  rollback = null,
  details = null,
  code = ExitCodes.GENERAL_ERROR,
  json = false,
}) {
  const errorMessage = formatErrorMessage({ action, target, rollback, details });
  
  if (json) {
    const errorObj = {
      timestamp: new Date().toISOString(),
      success: false,
      error: {
        action,
        target,
        rollback,
        details: details ? safeStringify(details, null, 2, ['token', 'password', 'secret', 'key']) : null,
        code,
      },
    };
    console.error(safeStringify(errorObj));
  } else {
    console.error(errorMessage);
  }
  
  process.exit(code);
}

/**
 * Exit with success (for consistency)
 * @param {Object} options - Success options
 * @param {string} options.message - Success message
 * @param {Object} options.data - Additional data (for JSON output)
 * @param {boolean} options.json - Output as JSON (default: false)
 */
export function exitWithSuccess({
  message = 'Operation completed successfully',
  data = null,
  json = false,
}) {
  if (json) {
    const result = {
      timestamp: new Date().toISOString(),
      success: true,
      message,
      data,
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[SUCCESS] ${message}`);
  }
  
  process.exit(ExitCodes.SUCCESS);
}

/**
 * Exit with dry run notification
 * @param {Object} options - Dry run options
 * @param {string} options.message - Dry run message
 * @param {Object} options.plan - What would have been done
 * @param {boolean} options.json - Output as JSON (default: false)
 */
export function exitWithDryRun({
  message = 'Dry run completed - no changes were made',
  plan = null,
  json = false,
}) {
  if (json) {
    const result = {
      timestamp: new Date().toISOString(),
      success: true,
      dryRun: true,
      message,
      plan,
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[DRY-RUN] ${message}`);
    if (plan && !json) {
      console.log('Planned actions:');
      if (Array.isArray(plan)) {
        plan.forEach(item => console.log(`  • ${item}`));
      } else if (typeof plan === 'object') {
        Object.entries(plan).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      }
    }
  }
  
  process.exit(ExitCodes.DRY_RUN);
}

// Re-export for convenience
export default {
  ExitCodes,
  formatErrorMessage,
  exitWithError,
  exitWithSuccess,
  exitWithDryRun,
};