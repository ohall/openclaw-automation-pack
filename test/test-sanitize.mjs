#!/usr/bin/env node

import { sanitizeString, sanitizeError, sanitizeObject, safeStringify } from '../scripts/_sanitize.mjs';
import { test } from 'node:test';
import assert from 'node:assert';

test('sanitizeString masks tokens', () => {
  const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const output = sanitizeString(input);
  assert(!output.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  assert(output.includes('***'));
  console.log('✓ Token masking works');
});

test('sanitizeString masks passwords', () => {
  const input = 'password=supersecret123';
  const output = sanitizeString(input);
  assert(!output.includes('supersecret123'));
  assert(output.includes('***'));
  console.log('✓ Password masking works');
});

test('sanitizeString leaves non-secrets intact', () => {
  const input = 'Hello world, this is a normal message';
  const output = sanitizeString(input);
  assert.strictEqual(output, input);
  console.log('✓ Non-secrets are preserved');
});

test('sanitizeError sanitizes error messages', () => {
  const error = new Error('Failed to connect: Bearer eyJhbGci...');
  const sanitized = sanitizeError(error);
  assert(!sanitized.message.includes('eyJhbGci'));
  assert(sanitized.message.includes('***'));
  console.log('✓ Error sanitization works');
});

test('sanitizeObject masks sensitive keys', () => {
  const obj = {
    token: 'secret-token-123',
    password: 'myPassword',
    normal: 'normal value',
    nested: {
      api_key: 'key-456',
      data: 'some data'
    }
  };
  
  const sanitized = sanitizeObject(obj);
  
  assert.strictEqual(sanitized.token, 'se***23');
  assert.strictEqual(sanitized.password, 'my***rd');
  assert.strictEqual(sanitized.normal, 'normal value');
  assert.strictEqual(sanitized.nested.api_key, 'ke***56');
  assert.strictEqual(sanitized.nested.data, 'some data');
  
  console.log('✓ Object sanitization works');
});

test('safeStringify sanitizes before stringifying', () => {
  const obj = {
    message: 'Request failed',
    config: {
      headers: {
        Authorization: 'Bearer token123'
      }
    }
  };
  
  const result = safeStringify(obj);
  const parsed = JSON.parse(result);
  
  assert(!result.includes('token123'));
  assert(parsed.config.headers.Authorization === 'to***23');
  
  console.log('✓ Safe stringify works');
});

console.log('\n✅ All sanitization tests passed!');