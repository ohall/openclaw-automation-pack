// Simple test to verify confirmation logic
import { spawnSync } from 'child_process';

console.log('Test 1: Running without --yes or --dry-run (should fail)');
const result1 = spawnSync('node', ['scripts/ha-disable-orphans.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, HA_ENV_FILE: '.env.test' },
  encoding: 'utf8'
});
if (result1.stderr.includes('ERROR: This command will make destructive changes')) {
  console.log('✓ Test 1 passed - correctly shows error about missing --yes flag');
} else {
  console.log('✗ Test 1 failed');
  console.log('stderr:', result1.stderr);
}

console.log('\nTest 2: Running with --dry-run (should work)');
const result2 = spawnSync('node', ['scripts/ha-disable-orphans.mjs', '--dry-run'], {
  cwd: process.cwd(),
  env: { ...process.env, HA_ENV_FILE: '.env.test' },
  encoding: 'utf8'
});
if (result2.stderr.includes('fetch failed')) {
  console.log('✓ Test 2 passed - script ran (fetch failed is expected)');
} else if (result2.stderr.includes('ERROR: This command will make destructive changes')) {
  console.log('✗ Test 2 failed - should not require --yes with --dry-run');
} else {
  console.log('? Test 2 - unclear');
}

console.log('\nTest 3: Running with --yes (should work)');
const result3 = spawnSync('node', ['scripts/ha-disable-orphans.mjs', '--yes'], {
  cwd: process.cwd(),
  env: { ...process.env, HA_ENV_FILE: '.env.test' },
  encoding: 'utf8'
});
if (result3.stderr.includes('fetch failed')) {
  console.log('✓ Test 3 passed - script ran with --yes (fetch failed is expected)');
} else if (result3.stderr.includes('ERROR: This command will make destructive changes')) {
  console.log('✗ Test 3 failed - should not show error with --yes flag');
} else {
  console.log('? Test 3 - unclear');
}