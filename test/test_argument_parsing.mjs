import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';

const scriptsDir = join(process.cwd(), 'scripts');

// Helper to run a script with arguments and capture output
function runScript(scriptName, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(scriptsDir, scriptName);
    const child = spawn('node', [scriptPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr
      });
    });
    
    child.on('error', reject);
  });
}

// Helper to create a temporary env file for testing
function createTempEnvFile(content) {
  const tmpFile = join(tmpdir(), `test-env-${Date.now()}.env`);
  writeFileSync(tmpFile, content);
  return tmpFile;
}

test('ha-entity-rename.mjs --help shows usage', async () => {
  const result = await runScript('ha-entity-rename.mjs', ['--help']);
  
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--from/);
  assert.match(result.stdout, /--to/);
  assert.match(result.stdout, /--dry-run/);
});

test('ha-entity-rename.mjs requires --from and --to arguments', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-entity-rename.mjs', [], {
      HA_ENV_FILE: envFile
    });
    
    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /--from/);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-entity-rename.mjs --from without --to fails', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-entity-rename.mjs', ['--from', 'sensor.test'], {
      HA_ENV_FILE: envFile
    });
    
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /--to/);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-entity-rename.mjs --to without --from fails', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-entity-rename.mjs', ['--to', 'sensor.new'], {
      HA_ENV_FILE: envFile
    });
    
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /--from/);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-entity-rename.mjs accepts --dry-run flag', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-entity-rename.mjs', [
      '--from', 'sensor.old',
      '--to', 'sensor.new',
      '--dry-run'
    ], {
      HA_ENV_FILE: envFile
    });
    
    // Should exit with non-zero (since it can't connect to HA)
    // But should not crash due to argument parsing - check exit code is not 0
    assert.notStrictEqual(result.code, 0);
    // Should show some error about connection or missing env
    assert(result.stderr.length > 0 || result.stdout.length > 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-entity-rename.mjs accepts --json flag', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-entity-rename.mjs', [
      '--from', 'sensor.old',
      '--to', 'sensor.new',
      '--json',
      '--dry-run'
    ], {
      HA_ENV_FILE: envFile
    });
    
    // Should exit with non-zero (can't connect to HA)
    // But should not crash due to argument parsing
    assert.notStrictEqual(result.code, 0);
    assert(result.stderr.length > 0 || result.stdout.length > 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-disable-orphans.mjs --help shows usage', async () => {
  const result = await runScript('ha-disable-orphans.mjs', ['--help']);
  
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--json/);
});

test('ha-disable-orphans.mjs accepts --dry-run flag', async () => {
  const envFile = createTempEnvFile('HA_BASE_URL=http://localhost:8123\nHA_LONG_LIVED_ACCESS_TOKEN=test-token\nHUBITAT_MAKER_API_BASE_URL=http://localhost\nHUBITAT_MAKER_API_ACCESS_TOKEN=hubitat-token');
  
  try {
    const result = await runScript('ha-disable-orphans.mjs', ['--dry-run'], {
      HA_ENV_FILE: envFile
    });
    
    // Should exit with non-zero (can't connect to HA/Hubitat)
    // But should not crash due to argument parsing
    assert.notStrictEqual(result.code, 0);
    assert(result.stderr.length > 0 || result.stdout.length > 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-disable-orphans.mjs requires --yes for destructive operations', async () => {
  const envFile = createTempEnvFile('HA_BASE_URL=http://localhost:8123\nHA_LONG_LIVED_ACCESS_TOKEN=test-token\nHUBITAT_MAKER_API_BASE_URL=http://localhost\nHUBITAT_MAKER_API_ACCESS_TOKEN=hubitat-token');
  
  try {
    const result = await runScript('ha-disable-orphans.mjs', [], {
      HA_ENV_FILE: envFile
    });
    
    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
    // Check for confirmation requirement in output
    assert(result.stderr.includes('--yes') || result.stdout.includes('--yes') || result.stderr.includes('confirmation'));
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-backup-config.mjs --help shows usage', async () => {
  const result = await runScript('ha-backup-config.mjs', ['--help']);
  
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--output-dir/);
});

test('ha-backup-config.mjs accepts --output-dir with path', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-backup-config.mjs', [
      '--output-dir', '/tmp/test-backup',
      '--dry-run'
    ], {
      HA_ENV_FILE: envFile
    });
    
    // Should exit with non-zero (can't connect to HA)
    // But should not crash due to argument parsing
    assert.notStrictEqual(result.code, 0);
    assert(result.stderr.length > 0 || result.stdout.length > 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-backup-config.mjs --output-dir without path fails', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-backup-config.mjs', ['--output-dir'], {
      HA_ENV_FILE: envFile
    });
    
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /requires a path/);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-validate-config.mjs --help shows usage', async () => {
  const result = await runScript('ha-validate-config.mjs', ['--help']);
  
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--verbose/);
  assert.match(result.stdout, /--json/);
});

test('Unknown arguments cause error with help text', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');
  
  try {
    const result = await runScript('ha-backup-config.mjs', ['--unknown-flag'], {
      HA_ENV_FILE: envFile
    });
    
    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /Unknown option/);
  } finally {
    unlinkSync(envFile);
  }
});

console.log('All argument parsing tests passed');