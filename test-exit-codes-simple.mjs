#!/usr/bin/env node

import { ExitCodes, exitWithError, exitWithSuccess, exitWithDryRun } from './scripts/_exit-codes.mjs';

// Test 1: Success
console.log("Test 1: Success exit");
// exitWithSuccess({ message: "Test successful", json: false });

// Test 2: Dry run  
console.log("\nTest 2: Dry run exit");
// exitWithDryRun({ message: "Dry run completed", plan: ["Step 1", "Step 2"], json: false });

// Test 3: Error
console.log("\nTest 3: Error exit");
// exitWithError({ 
//   action: "test operation",
//   target: "test target",
//   rollback: "undo test",
//   details: "test failed",
//   code: ExitCodes.VALIDATION_FAILED,
//   json: false
// });

console.log("\nAll tests would exit. To see actual behavior, uncomment the calls.");