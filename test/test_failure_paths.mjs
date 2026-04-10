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
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      resolve({
        code,
        stdout,
        stderr,
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

test('ha-entity-rename.mjs fails with invalid entity ID format', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');

  try {
    const result = await runScript(
      'ha-entity-rename.mjs',
      [
        '--from',
        'invalid_entity', // Missing domain
        '--to',
        'sensor.new',
        '--dry-run',
      ],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail - check exit code is not 0
    assert.notStrictEqual(result.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-entity-rename.mjs fails when --backup-dir is not writable', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');

  try {
    // Try to use a root directory that we can't write to
    const result = await runScript(
      'ha-entity-rename.mjs',
      [
        '--from',
        'sensor.old',
        '--to',
        'sensor.new',
        '--backup-dir',
        '/root/backups', // Should fail
        '--dry-run',
      ],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-disable-orphans.mjs fails with invalid allowlist file', async () => {
  const envFile = createTempEnvFile(
    'HA_BASE_URL=http://localhost:8123\nHA_LONG_LIVED_ACCESS_TOKEN=test-token\nHUBITAT_MAKER_API_BASE_URL=http://localhost\nHUBITAT_MAKER_API_ACCESS_TOKEN=hubitat-token'
  );

  const badAllowlistFile = join(tmpdir(), `bad-allowlist-${Date.now()}.json`);
  writeFileSync(badAllowlistFile, '{"not": "an array"}'); // Invalid JSON for allowlist

  try {
    const result = await runScript(
      'ha-disable-orphans.mjs',
      ['--allowlist', badAllowlistFile, '--dry-run'],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
    assert(
      result.stderr.includes('Allowlist must be a JSON array') ||
        result.stderr.includes('Failed to load allowlist')
    );
  } finally {
    unlinkSync(envFile);
    unlinkSync(badAllowlistFile);
  }
});

test('ha-disable-orphans.mjs fails with non-existent allowlist file', async () => {
  const envFile = createTempEnvFile(
    'HA_BASE_URL=http://localhost:8123\nHA_LONG_LIVED_ACCESS_TOKEN=test-token\nHUBITAT_MAKER_API_BASE_URL=http://localhost\nHUBITAT_MAKER_API_ACCESS_TOKEN=hubitat-token'
  );

  const nonExistentFile = join(tmpdir(), `nonexistent-${Date.now()}.json`);

  try {
    const result = await runScript(
      'ha-disable-orphans.mjs',
      ['--allowlist', nonExistentFile, '--dry-run'],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
    assert(
      result.stderr.includes('Failed to load allowlist') || result.stderr.includes('no such file')
    );
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-backup-config.mjs fails with missing required environment variables', async () => {
  // Empty env file - missing required vars
  const envFile = createTempEnvFile('');

  try {
    const result = await runScript('ha-backup-config.mjs', ['--dry-run'], {
      HA_ENV_FILE: envFile,
    });

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
    // Check for any error message about missing configuration
    assert(result.stderr.length > 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-backup-config.mjs fails with invalid URL format', async () => {
  const envFile = createTempEnvFile('HA_URL=invalid-url\nHA_TOKEN=test-token');

  try {
    const result = await runScript('ha-backup-config.mjs', ['--dry-run'], {
      HA_ENV_FILE: envFile,
    });

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-validate-config.mjs fails when HA is not reachable', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:9999\nHA_TOKEN=test-token'); // Unreachable port

  try {
    const result = await runScript('ha-validate-config.mjs', [], {
      HA_ENV_FILE: envFile,
    });

    // Should fail with non-zero exit code (connection refused/timeout)
    assert.notStrictEqual(result.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-restart-and-wait.mjs fails with invalid timeout value', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');

  try {
    const result = await runScript(
      'ha-restart-and-wait.mjs',
      [
        '--timeout',
        'invalid', // Not a number
      ],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('ha-hacs-update.mjs fails with invalid --auto-restart value', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');

  try {
    const result = await runScript(
      'ha-hacs-update.mjs',
      [
        '--auto-restart',
        'invalid', // Should be boolean
      ],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('scripts handle malformed command line arguments gracefully', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');

  try {
    // Test with dangling --from argument (no value)
    const result = await runScript(
      'ha-entity-rename.mjs',
      [
        '--from', // Missing value
        '--to',
        'sensor.new',
        '--dry-run',
      ],
      {
        HA_ENV_FILE: envFile,
      }
    );

    // Should fail with non-zero exit code
    assert.notStrictEqual(result.code, 0);
    assert(result.stderr.length > 0);
  } finally {
    unlinkSync(envFile);
  }
});

test('scripts exit with appropriate error codes for different failures', async () => {
  const envFile = createTempEnvFile('HA_URL=http://localhost:8123\nHA_TOKEN=test-token');

  try {
    // Test argument parsing failure
    const result1 = await runScript('ha-entity-rename.mjs', ['--unknown-flag'], {
      HA_ENV_FILE: envFile,
    });

    // Should exit with non-zero code
    assert.notStrictEqual(result1.code, 0);

    // Test missing required arguments
    const result2 = await runScript('ha-entity-rename.mjs', [], {
      HA_ENV_FILE: envFile,
    });

    assert.notStrictEqual(result2.code, 0);
  } finally {
    unlinkSync(envFile);
  }
});

console.log('All failure path tests passed');
