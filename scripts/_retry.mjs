#!/usr/bin/env node

/**
 * Retry/backoff utility for transient HA API failures.
 * 
 * Provides exponential backoff with jitter for retrying failed operations.
 * Supports both fetch-based HTTP calls and WebSocket operations.
 */

import { error, warn, info, success, debug } from './_logger.mjs';

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterFactor: 0.1,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrorTypes: [
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH',
    'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'
  ],
  onRetry: null,
};

/**
 * Exponential backoff with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt, config = {}) {
  const { baseDelayMs = 1000, maxDelayMs = 10000, jitterFactor = 0.1 } = config;
  
  // Exponential backoff: baseDelayMs * 2^attempt
  let delay = baseDelayMs * Math.pow(2, attempt);
  
  // Cap at maxDelayMs
  delay = Math.min(delay, maxDelayMs);
  
  // Add jitter: ±jitterFactor% random variation
  const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
  delay += jitter;
  
  // Ensure minimum delay of 1ms
  return Math.max(delay, 1);
}

/**
 * Check if an error is retryable
 * @param {Error|Response} error - The error or response to check
 * @param {Object} config - Retry configuration
 * @returns {boolean} True if the error is retryable
 */
export function isRetryableError(error, config = {}) {
  const { 
    retryableStatusCodes = DEFAULT_CONFIG.retryableStatusCodes,
    retryableErrorTypes = DEFAULT_CONFIG.retryableErrorTypes 
  } = config;
  
  // Check for fetch Response objects
  if (error && typeof error.status === 'number') {
    return retryableStatusCodes.includes(error.status);
  }
  
  // Check for Node.js error codes
  if (error && error.code) {
    return retryableErrorTypes.includes(error.code);
  }
  
  // Check for network errors (fetch throws TypeError for network errors)
  if (error instanceof TypeError) {
    // Common network error messages
    const networkErrorMessages = [
      'fetch failed',
      'network error',
      'failed to fetch',
      'connection',
      'timeout',
      'reset',
      'refused'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return networkErrorMessages.some(msg => errorMessage.includes(msg));
  }
  
  // Check for WebSocket errors
  if (error && error.message) {
    const wsErrorMessages = [
      'websocket',
      'socket',
      'connection',
      'timeout'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return wsErrorMessages.some(msg => errorMessage.includes(msg));
  }
  
  return false;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the operation
 */
export async function retry(operation, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { 
    maxAttempts, 
    baseDelayMs, 
    maxDelayMs, 
    jitterFactor,
    onRetry,
    operationName = 'Operation',
    jsonOutput = false
  } = config;
  
  let lastError;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if this is the last attempt
      const isLastAttempt = attempt === maxAttempts - 1;
      
      // Check if error is retryable
      if (!isRetryableError(error, config) || isLastAttempt) {
        throw error;
      }
      
      // Calculate backoff delay
      const delay = calculateBackoff(attempt, { baseDelayMs, maxDelayMs, jitterFactor });
      
      // Log retry attempt
      if (!jsonOutput) {
        warn(`${operationName} failed (attempt ${attempt + 1}/${maxAttempts}): ${error.message}`);
        info(`Retrying in ${Math.round(delay / 100) / 10}s...`);
      }
      
      // Call onRetry callback if provided
      if (onRetry && typeof onRetry === 'function') {
        onRetry(error, attempt, delay);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // This should never be reached due to throw in loop, but just in case
  throw lastError || new Error('Retry failed');
}

/**
 * Create a retryable fetch function
 * @param {Object} config - Retry configuration
 * @returns {Function} Retryable fetch function
 */
export function createRetryableFetch(config = {}) {
  return async function retryableFetch(url, options = {}) {
    const operation = async () => {
      const response = await fetch(url, options);
      
      // Throw for non-2xx status codes to trigger retry logic
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      
      return response;
    };
    
    return retry(operation, { ...config, operationName: `Fetch ${url}` });
  };
}

/**
 * Create a retryable WebSocket connection function
 * @param {Object} config - Retry configuration  
 * @returns {Function} Retryable WebSocket connection function
 */
export function createRetryableWebSocket(config = {}) {
  return async function retryableWebSocket(connectFunction, ...args) {
    const operation = async () => {
      return await connectFunction(...args);
    };
    
    return retry(operation, { ...config, operationName: 'WebSocket connection' });
  };
}

/**
 * Wrap an existing async function with retry logic
 * @param {Function} fn - Async function to wrap
 * @param {Object} config - Retry configuration
 * @returns {Function} Wrapped function with retry logic
 */
export function withRetry(fn, config = {}) {
  return async function(...args) {
    const operation = async () => {
      return await fn(...args);
    };
    
    const operationName = config.operationName || fn.name || 'Wrapped operation';
    return retry(operation, { ...config, operationName });
  };
}

/**
 * Example usage:
 * 
 * 1. Basic retry:
 *    const result = await retry(() => fetchApi(url, options));
 * 
 * 2. Retryable fetch:
 *    const retryFetch = createRetryableFetch({ maxAttempts: 3 });
 *    const response = await retryFetch(url, options);
 * 
 * 3. With function wrapper:
 *    const fetchWithRetry = withRetry(fetchApi, { maxAttempts: 3 });
 *    const result = await fetchWithRetry(url, options);
 * 
 * 4. Custom retryable error check:
 *    const result = await retry(() => someOperation(), {
 *      isRetryable: (error) => error.code === 'TEMPORARY_FAILURE',
 *      maxAttempts: 5,
 *      baseDelayMs: 2000
 *    });
 */

export default {
  calculateBackoff,
  isRetryableError,
  sleep,
  retry,
  createRetryableFetch,
  createRetryableWebSocket,
  withRetry,
  DEFAULT_CONFIG,
};