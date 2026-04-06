#!/usr/bin/env node

/**
 * Shared logger utility for consistent timestamps, status labels, and stderr handling.
 * 
 * Features:
 * - Timestamps (ISO format or human-readable)
 * - Consistent status labels ([OK], [ERROR], [WARN], [INFO], [SUCCESS])
 * - Color support (auto-detected, can be disabled)
 * - JSON output mode support
 * - Proper stderr/stdout routing
 * - Log levels (error, warn, info, success, debug)
 * - Progress indicators
 */

/**
 * Logger configuration
 */
const config = {
  // Enable color output (auto-detected from TTY)
  color: process.stdout.isTTY && !process.env.NO_COLOR,
  
  // Include timestamps in logs
  timestamp: true,
  
  // Timestamp format: 'iso' or 'human'
  timestampFormat: 'human',
  
  // Output mode: 'text' or 'json'
  outputMode: 'text',
  
  // Minimum log level to output
  // Levels: error, warn, info, success, debug
  minLevel: 'info',
  
  // Prefix for status labels
  statusPrefix: true,
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Status colors
  error: '\x1b[31m',    // red
  warn: '\x1b[33m',     // yellow
  info: '\x1b[36m',     // cyan
  success: '\x1b[32m',  // green
  ok: '\x1b[32m',       // green
  debug: '\x1b[90m',    // gray
  
  // Text colors
  timestamp: '\x1b[90m', // gray
  label: '\x1b[1m',      // bold
};

// Level priorities (higher = more important)
const levelPriority = {
  error: 4,
  warn: 3,
  info: 2,
  success: 2,
  ok: 2,
  debug: 1,
};

/**
 * Get current timestamp
 * @param {string} format - 'iso' or 'human'
 * @returns {string} Formatted timestamp
 */
function getTimestamp(format = config.timestampFormat) {
  const now = new Date();
  
  if (format === 'iso') {
    return now.toISOString();
  }
  
  // Human-readable format: YYYY-MM-DD HH:MM:SS
  const pad = (n) => n.toString().padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format a status label with color if enabled
 * @param {string} label - Label text (e.g., "OK", "ERROR")
 * @param {string} level - Log level for color selection
 * @returns {string} Formatted label
 */
function formatLabel(label, level) {
  if (!config.color) {
    return `[${label}]`;
  }
  
  const color = colors[level] || colors.info;
  return `${color}[${label}]${colors.reset}`;
}

/**
 * Format a message with timestamp and label
 * @param {string} message - Message text
 * @param {string} level - Log level
 * @param {string} label - Status label (if different from level)
 * @returns {string} Formatted message
 */
function formatMessage(message, level, label = null) {
  const parts = [];
  
  // Add timestamp if enabled
  if (config.timestamp) {
    const timestamp = getTimestamp();
    if (config.color) {
      parts.push(`${colors.timestamp}${timestamp}${colors.reset}`);
    } else {
      parts.push(timestamp);
    }
  }
  
  // Add status label if enabled
  if (config.statusPrefix) {
    const statusLabel = label || level.toUpperCase();
    parts.push(formatLabel(statusLabel, level));
  }
  
  // Add the message
  parts.push(message);
  
  return parts.join(' ');
}

/**
 * Base logging function
 * @param {string} level - Log level
 * @param {string} message - Message to log
 * @param {Object} options - Additional options
 */
function log(level, message, options = {}) {
  const { label = null, jsonOutput = false, forceStdout = false } = options;
  
  // Check if this level should be logged
  const priority = levelPriority[level] || 2;
  const minPriority = levelPriority[config.minLevel] || 2;
  
  if (priority < minPriority) {
    return;
  }
  
  // If in JSON output mode, messages are handled differently
  if (jsonOutput && config.outputMode === 'json') {
    return;
  }
  
  const formatted = formatMessage(message, level, label);
  const stream = (level === 'error' || level === 'warn') && !forceStdout 
    ? process.stderr 
    : process.stdout;
  
  stream.write(formatted + '\n');
}

/**
 * Log an error message (to stderr)
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 */
export function error(message, options = {}) {
  log('error', message, options);
}

/**
 * Log a warning message (to stderr)
 * @param {string} message - Warning message
 * @param {Object} options - Additional options
 */
export function warn(message, options = {}) {
  log('warn', message, options);
}

/**
 * Log an info message (to stdout)
 * @param {string} message - Info message
 * @param {Object} options - Additional options
 */
export function info(message, options = {}) {
  log('info', message, options);
}

/**
 * Log a success message (to stdout)
 * @param {string} message - Success message
 * @param {Object} options - Additional options
 */
export function success(message, options = {}) {
  log('success', message, { ...options, label: 'SUCCESS' });
}

/**
 * Log an OK message (to stdout)
 * @param {string} message - OK message
 * @param {Object} options - Additional options
 */
export function ok(message, options = {}) {
  log('ok', message, { ...options, label: 'OK' });
}

/**
 * Log a debug message (to stdout)
 * @param {string} message - Debug message
 * @param {Object} options - Additional options
 */
export function debug(message, options = {}) {
  log('debug', message, options);
}

/**
 * Configure the logger
 * @param {Object} newConfig - Configuration options
 */
export function configure(newConfig) {
  Object.assign(config, newConfig);
  
  // Disable color if NO_COLOR env var is set
  if (process.env.NO_COLOR) {
    config.color = false;
  }
}

/**
 * Create a progress indicator
 * @param {string} message - Initial message
 * @returns {Object} Progress indicator with update() and stop() methods
 */
export function progress(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let intervalId = null;
  
  const start = () => {
    if (config.color && process.stdout.isTTY) {
      intervalId = setInterval(() => {
        process.stdout.write(`\r${frames[frameIndex]} ${message}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, 80);
    } else {
      process.stdout.write(`${message}... `);
    }
  };
  
  const update = (newMessage) => {
    message = newMessage;
  };
  
  const stop = (finalMessage = '', success = true) => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      
      if (config.color && process.stdout.isTTY) {
        const status = success ? '✓' : '✗';
        const color = success ? colors.success : colors.error;
        process.stdout.write(`\r${color}${status}${colors.reset} ${finalMessage || message}\n`);
      } else {
        const status = success ? '[OK]' : '[ERROR]';
        process.stdout.write(`\r${status} ${finalMessage || message}\n`);
      }
    } else {
      const status = success ? '[OK]' : '[ERROR]';
      process.stdout.write(`${status} ${finalMessage || message}\n`);
    }
  };
  
  start();
  
  return { update, stop };
}

/**
 * Print help text (colored if enabled)
 * @param {string} text - Help text
 */
export function help(text) {
  if (config.color) {
    console.log(`${colors.info}${text}${colors.reset}`);
  } else {
    console.log(text);
  }
}

/**
 * Print JSON output (for scripts with --json flag)
 * @param {Object} data - Data to output as JSON
 */
export function json(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Check if JSON output mode is enabled
 * @returns {boolean} True if in JSON output mode
 */
export function isJsonMode() {
  return config.outputMode === 'json';
}

// Export default logger functions for convenience
export default {
  configure,
  error,
  warn,
  info,
  success,
  ok,
  debug,
  progress,
  help,
  json,
  isJsonMode,
};