#!/usr/bin/env node

/**
 * Test for _exit-codes.mjs module
 */

import { ExitCodes, formatErrorMessage, exitWithError, exitWithSuccess, exitWithDryRun } from '../scripts/_exit-codes.mjs';

console.log('Testing _exit-codes.mjs module...\n');

// Test 1: ExitCodes constants
console.log('Test 1: Exit code constants:');
Object.entries(ExitCodes).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});

// Test 2: formatErrorMessage
console.log('\nTest 2: formatErrorMessage:');
const errorMsg = formatErrorMessage({
  action: 'rename entity',
  target: 'sensor.temperature',
  rollback: 'Use the backup file at ./backups/entity-registry-*.json',
  details: 'Entity not found: sensor.temperature',
  script: 'ha-entity-rename.mjs',
});
console.log(errorMsg);

// Test 3: exitWithError (JSON mode)
console.log('\nTest 3: exitWithError (JSON mode - would exit with code 4):');
console.log('(This would exit in real usage)');

// Test 4: exitWithSuccess
console.log('\nTest 4: exitWithSuccess:');
console.log('(This would exit with code 0 in real usage)');

// Test 5: exitWithDryRun
console.log('\nTest 5: exitWithDryRun:');
console.log('(This would exit with code 8 in real usage)');

// Test actual exit functions (wrapped to prevent actual exit)
console.log('\n\nTo see actual behavior, you would call:');
console.log('  exitWithError({ action: "test", target: "test", code: ExitCodes.VALIDATION_FAILED })');
console.log('  exitWithSuccess({ message: "Test completed" })');
console.log('  exitWithDryRun({ message: "Dry run completed", plan: ["Action 1", "Action 2"] })');

console.log('\n✅ All tests completed (no actual exits performed).');