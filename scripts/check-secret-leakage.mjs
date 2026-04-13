#!/usr/bin/env node

/**
 * Security check script to ensure scripts never print secrets.
 *
 * This script scans all JavaScript/TypeScript files in the scripts directory
 * for patterns that might leak sensitive information.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.join(__dirname);

// Patterns that might indicate secret leakage
const SUSPICIOUS_PATTERNS = [
  // Direct logging of environment variables (in console.log/error calls)
  /console\.(log|error|warn|debug|info)\([^)]*\b(?:process\.env\.|env\.)([A-Z_]+)\b[^)]*\)/,

  // Logging actual token/password values (not just the word)
  /console\.(log|error|warn|debug|info)\([^)]*\b(?:token|password|secret|key|auth|bearer)\s*[:=]\s*['"][^'"]+['"][^)]*\)/i,
  /logger\.(error|warn|info|debug|success|ok)\([^)]*\b(?:token|password|secret|key|auth|bearer)\s*[:=]\s*['"][^'"]+['"][^)]*\)/i,

  // JSON.stringify of environment or config objects to console
  /console\.(log|error|warn|debug|info)\(\s*JSON\.stringify\(\s*(?:env|process\.env|config)\b[^)]*\)/i,
];

// Patterns that are OK (false positives to exclude)
const OK_PATTERNS = [
  // Writing to files (not console) - these are backups
  /\.writeFileSync\(.*JSON\.stringify/,

  // Error messages about tokens being invalid/missing (not the token itself)
  /token is (?:invalid|missing|required|expired)/i,
  /make sure.*token.*valid/i,
  /authorization.*failed/i,

  // Logging error messages (not full error objects)
  /\.(log|error|warn|info|debug)\([^)]*\berror\.message[^)]*\)/,

  // JSON.stringify of result/report/data objects (common output)
  /console\.(log|error|warn|debug|info)\(\s*JSON\.stringify\(\s*(?:result|report|data|plan|dryRunResult)\b/i,

  // Logging without actual values
  /\.(log|error|warn|info|debug)\([^)]*\berror\b(?!\s*=)/,

  // Comments
  /^\s*\/\//,
  /^\s*\/\*/,
];

// Files to exclude from scanning
const EXCLUDED_FILES = [
  'check-secret-leakage.mjs', // This file itself
];

/**
 * Check if a line contains a suspicious pattern
 */
function isSuspicious(line) {
  // Skip comments and strings that are likely safe
  for (const okPattern of OK_PATTERNS) {
    if (okPattern.test(line)) {
      return false;
    }
  }

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Scan a file for potential secret leakage
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];

  lines.forEach((line, index) => {
    if (isSuspicious(line, filePath)) {
      issues.push({
        line: index + 1,
        content: line.trim(),
        file: path.relative(scriptsDir, filePath),
      });
    }
  });

  return issues;
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Scanning scripts for potential secret leakage...\n');

  // Get all .mjs and .js files in scripts directory
  const files = fs.readdirSync(scriptsDir)
    .filter(file => file.endsWith('.mjs') || file.endsWith('.js'))
    .filter(file => !EXCLUDED_FILES.includes(file))
    .map(file => path.join(scriptsDir, file));

  let totalIssues = 0;
  const allIssues = [];

  for (const file of files) {
    const issues = scanFile(file);

    if (issues.length > 0) {
      console.log(`📄 ${path.relative(scriptsDir, file)}:`);
      issues.forEach(issue => {
        console.log(`  Line ${issue.line}: ${issue.content}`);
        totalIssues++;
      });
      console.log();

      allIssues.push(...issues);
    }
  }

  // Summary
  console.log('='.repeat(50));
  console.log(`📊 Scan complete: ${files.length} files scanned`);
  console.log(`⚠️  Found ${totalIssues} potential issues`);
  console.log();

  if (totalIssues > 0) {
    console.log('🔴 POTENTIAL SECRET LEAKAGE DETECTED!');
    console.log('\nIssues to investigate:');
    allIssues.forEach(issue => {
      console.log(`  ${issue.file}:${issue.line} - ${issue.content.substring(0, 60)}...`);
    });

    console.log('\n💡 Recommendations:');
    console.log('  1. Avoid logging environment variables directly');
    console.log('  2. Use error.message instead of full error objects');
    console.log('  3. Be careful with JSON.stringify on API responses');
    console.log('  4. Use --verbose flag for debug info, not production');
    console.log('  5. Consider using a secrets masking library');

    process.exit(1);
  } else {
    console.log('✅ No secret leakage detected!');
    console.log('\n💡 Good practices observed:');
    console.log('  - No direct logging of environment variables');
    console.log('  - No logging of tokens or passwords');
    console.log('  - Careful error handling');
    process.exit(0);
  }
}

// Run the scan
main().catch(error => {
  console.error('Error during scan:', error);
  process.exit(1);
});
