const { logger } = require('./logger');

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries
 * @param {number} options.initialDelay - Initial delay in ms
 * @param {number} options.maxDelay - Maximum delay in ms
 * @param {Function} options.onRetry - Callback on each retry
 * @returns {Promise} Result of the operation
 */
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry = () => {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        logger.error(`Operation failed after ${maxRetries} retries`, {
          error: error.message,
          attempts: attempt + 1
        });
        throw error;
      }
      
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: error.message
      });
      
      onRetry(attempt + 1, delay, error);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Retry with custom retry conditions
 * @param {Function} operation - Async function to retry
 * @param {Function} shouldRetry - Function to determine if should retry
 * @param {Object} options - Retry options
 */
async function retryWithCondition(operation, shouldRetry, options = {}) {
  const { maxRetries = 3, delay = 1000 } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (!shouldRetry || !shouldRetry(result, null, attempt)) {
        return result;
      }
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      if (!shouldRetry || !shouldRetry(null, error, attempt)) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Batch process items with retry logic
 * @param {Array} items - Items to process
 * @param {Function} processor - Function to process each item
 * @param {Object} options - Batch options
 */
async function batchProcessWithRetry(items, processor, options = {}) {
  const {
    batchSize = 10,
    concurrency = 5,
    retryOptions = {}
  } = options;
  
  const results = [];
  const errors = [];
  
  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch items concurrently
    const batchPromises = batch.map(async (item, index) => {
      try {
        const result = await retryWithBackoff(
          () => processor(item, i + index),
          retryOptions
        );
        results.push({ item, result, success: true });
      } catch (error) {
        errors.push({ item, error, index: i + index });
        results.push({ item, error, success: false });
      }
    });
    
    // Limit concurrency
    const chunks = [];
    for (let j = 0; j < batchPromises.length; j += concurrency) {
      chunks.push(batchPromises.slice(j, j + concurrency));
    }
    
    for (const chunk of chunks) {
      await Promise.all(chunk);
    }
    
    logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}`, {
      processed: Math.min(i + batchSize, items.length),
      total: items.length,
      errors: errors.length
    });
  }
  
  return { results, errors };
}

module.exports = {
  retryWithBackoff,
  retryWithCondition,
  batchProcessWithRetry
};