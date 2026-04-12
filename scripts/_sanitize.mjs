#!/usr/bin/env node

/**
 * Sanitization utility to prevent secret leakage in logs.
 * 
 * This module provides functions to sanitize strings and objects
 * before logging to ensure secrets (tokens, passwords, keys) are not exposed.
 */

/**
 * Patterns that match potential secrets
 */
const SECRET_PATTERNS = [
  // API tokens and keys with key=value pattern
  /\b(?:access[_-]?token|api[_-]?key|auth[_-]?token|bearer)\s*[:=]\s*['"]?([a-zA-Z0-9._~+/-]+=*)['"]?/gi,
  /\b(?:password|passwd|pwd|secret|key)\s*[:=]\s*['"]?([^'"\s]+)['"]?/gi,
  
  // Common token formats (JWT, etc.) - standalone
  /\b(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g, // JWT tokens
  /\b([a-f0-9]{32,})\b/gi, // Hex tokens (32+ chars)
  /\b([A-Za-z0-9+/]{40,})\b/g, // Base64 tokens (40+ chars)
];

/**
 * Mask a secret value
 * @param {string} value - The secret value to mask
 * @returns {string} Masked value (e.g., "***")
 */
function maskSecret(value) {
  if (!value || typeof value !== 'string' || value.length === 0) return '***';
  if (value.length <= 4) return '***';
  return `${value.substring(0, 2)}***${value.substring(value.length - 2)}`;
}

/**
 * Sanitize a string by replacing secrets with masked values
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeString(text) {
  if (typeof text !== 'string') return text;
  
  let sanitized = text;
  
  // Replace secrets in the text
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, secret) => {
      if (!secret) return match; // No capture group matched
      const prefix = match.substring(0, match.indexOf(secret));
      return `${prefix}${maskSecret(secret)}`;
    });
  }
  
  return sanitized;
}

/**
 * Sanitize an error object for logging
 * @param {Error|any} error - Error object to sanitize
 * @returns {Object} Sanitized error object
 */
export function sanitizeError(error) {
  if (!error) return error;
  
  // Create a sanitized copy
  const sanitized = {
    name: error.name,
    message: sanitizeString(error.message),
  };
  
  // Copy stack trace but sanitize it
  if (error.stack) {
    sanitized.stack = sanitizeString(error.stack);
  }
  
  // Copy other properties (excluding potentially sensitive ones)
  const sensitiveProps = ['config', 'request', 'response', 'headers', 'auth', 'token', 'password', 'secret', 'key'];
  
  for (const [key, value] of Object.entries(error)) {
    if (key === 'name' || key === 'message' || key === 'stack') continue;
    
    if (sensitiveProps.includes(key.toLowerCase())) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize objects
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Sanitize an object for logging
 * @param {Object} obj - Object to sanitize
 * @param {string[]} sensitiveKeys - Additional keys to treat as sensitive
 * @returns {Object} Sanitized object
 */
export function sanitizeObject(obj, sensitiveKeys = []) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const allSensitiveKeys = [
    'token', 'access_token', 'api_key', 'auth_token', 'bearer',
    'password', 'passwd', 'pwd', 'secret', 'key',
    'authorization', 'x-api-key', 'x-auth-token',
    ...sensitiveKeys.map(k => k.toLowerCase())
  ];
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Check if this key should be treated as sensitive
    if (allSensitiveKeys.some(sk => keyLower.includes(sk))) {
      if (typeof value === 'string' && value.length > 0) {
        sanitized[key] = maskSecret(value);
      } else {
        sanitized[key] = '***REDACTED***';
      }
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value, sensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Safe JSON.stringify that sanitizes objects before stringifying
 * @param {any} value - Value to stringify
 * @param {Function} replacer - JSON.stringify replacer function
 * @param {number|string} space - JSON.stringify space parameter
 * @param {string[]} sensitiveKeys - Additional keys to treat as sensitive
 * @returns {string} Sanitized JSON string
 */
export function safeStringify(value, replacer = null, space = 2, sensitiveKeys = []) {
  let sanitizedValue = value;
  
  if (typeof value === 'object' && value !== null) {
    if (value instanceof Error) {
      sanitizedValue = sanitizeError(value);
    } else {
      sanitizedValue = sanitizeObject(value, sensitiveKeys);
    }
  } else if (typeof value === 'string') {
    sanitizedValue = sanitizeString(value);
  }
  
  return JSON.stringify(sanitizedValue, replacer, space);
}

/**
 * Create a safe console.log wrapper
 * @returns {Object} Safe console methods
 */
export function createSafeConsole() {
  const safeMethods = {};
  
  ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
    safeMethods[method] = (...args) => {
      const sanitizedArgs = args.map(arg => {
        if (typeof arg === 'string') {
          return sanitizeString(arg);
        } else if (typeof arg === 'object' && arg !== null) {
          if (arg instanceof Error) {
            return sanitizeError(arg);
          }
          return sanitizeObject(arg);
        }
        return arg;
      });
      
      console[method](...sanitizedArgs);
    };
  });
  
  // Special method for JSON output
  safeMethods.json = (obj, space = 2) => {
    console.log(safeStringify(obj, null, space));
  };
  
  return safeMethods;
}

/**
 * Create a safe logger wrapper
 * @param {Object} logger - Logger object with log methods
 * @returns {Object} Wrapped logger with sanitization
 */
export function wrapLogger(logger) {
  const wrapped = { ...logger };
  
  const methods = ['error', 'warn', 'info', 'debug', 'success', 'ok', 'json'];
  methods.forEach(method => {
    if (typeof logger[method] === 'function') {
      const original = logger[method];
      wrapped[method] = (...args) => {
        const sanitizedArgs = args.map(arg => {
          if (typeof arg === 'string') {
            return sanitizeString(arg);
          } else if (typeof arg === 'object' && arg !== null) {
            if (arg instanceof Error) {
              return sanitizeError(arg);
            }
            return sanitizeObject(arg);
          }
          return arg;
        });
        
        return original(...sanitizedArgs);
      };
    }
  });
  
  return wrapped;
}

// Export default for convenience
export default {
  sanitizeString,
  sanitizeError,
  sanitizeObject,
  safeStringify,
  createSafeConsole,
  wrapLogger,
};