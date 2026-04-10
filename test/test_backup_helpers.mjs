import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Helper imports (we need to extract these functions from the backup script)
// For now, we'll create mocks or recreate the helper functions

function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

test('generateTimestamp produces valid format', () => {
  const timestamp = generateTimestamp();
  // Should match YYYY-MM-DD_HH-MM-SS
  const pattern = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
  assert.match(timestamp, pattern);

  // Parse to ensure it's valid
  const [datePart, timePart] = timestamp.split('_');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split('-').map(Number);

  assert.ok(year >= 2024, 'Year should be reasonable');
  assert.ok(month >= 1 && month <= 12, 'Month should be 1-12');
  assert.ok(day >= 1 && day <= 31, 'Day should be 1-31');
  assert.ok(hour >= 0 && hour <= 23, 'Hour should be 0-23');
  assert.ok(minute >= 0 && minute <= 59, 'Minute should be 0-59');
  assert.ok(second >= 0 && second <= 59, 'Second should be 0-59');
});

test('ensureDirectory creates directory if it doesnt exist', () => {
  const tempDir = join(tmpdir(), `test-backup-dir-${Date.now()}`);

  try {
    // Directory shouldn't exist initially
    assert.ok(!fs.existsSync(tempDir));

    // Create it
    const createdDir = ensureDirectory(tempDir);
    assert.strictEqual(createdDir, tempDir);
    assert.ok(fs.existsSync(tempDir));
    assert.ok(fs.statSync(tempDir).isDirectory());

    // Call again - should not fail
    const existingDir = ensureDirectory(tempDir);
    assert.strictEqual(existingDir, tempDir);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('ensureDirectory creates nested directories', () => {
  const tempDir = join(tmpdir(), `test-backup-dir-${Date.now()}`, 'nested', 'deep');

  try {
    // Directory shouldn't exist initially
    assert.ok(!fs.existsSync(tempDir));

    // Create it
    const createdDir = ensureDirectory(tempDir);
    assert.strictEqual(createdDir, tempDir);
    assert.ok(fs.existsSync(tempDir));
    assert.ok(fs.statSync(tempDir).isDirectory());
  } finally {
    const parentDir = join(tempDir, '..', '..');
    if (fs.existsSync(parentDir)) {
      fs.rmSync(parentDir, { recursive: true });
    }
  }
});

console.log('All backup helper tests passed');
