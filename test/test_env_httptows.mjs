import { httpToWs } from '../scripts/_env.mjs';
import { test } from 'node:test';
import assert from 'node:assert';

test('httpToWs converts HTTP to WebSocket', () => {
  assert.strictEqual(
    httpToWs('http://example.com'),
    'ws://example.com'
  );
});

test('httpToWs converts HTTPS to WebSocket Secure', () => {
  assert.strictEqual(
    httpToWs('https://example.com'),
    'wss://example.com'
  );
});

test('httpToWs handles URLs with paths', () => {
  assert.strictEqual(
    httpToWs('https://example.com/api/ws'),
    'wss://example.com/api/ws'
  );
});

test('httpToWs leaves ws:// URLs unchanged', () => {
  assert.strictEqual(
    httpToWs('ws://example.com'),
    'ws://example.com'
  );
});

test('httpToWs leaves wss:// URLs unchanged', () => {
  assert.strictEqual(
    httpToWs('wss://example.com'),
    'wss://example.com'
  );
});

console.log('All httpToWs tests passed');