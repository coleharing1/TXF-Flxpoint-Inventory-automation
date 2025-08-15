// Configuration constants
module.exports = {
  TIMEOUTS: {
    EXPORT_WAIT: 15 * 60 * 1000, // 15 minutes
    TEST_WAIT: 60 * 1000,         // 1 minute for testing
    NAVIGATION: 5000,              // 5 seconds
    ELEMENT_WAIT: 1000,           // 1 second
    RETRY_DELAY: 2000             // 2 seconds
  },
  
  PAGINATION: {
    DEFAULT_LIMIT: 100,
    MAX_LIMIT: 1000,
    DEFAULT_PAGE: 1
  },
  
  EXPORT: {
    MAX_RETRIES: 3,
    BATCH_SIZE: 1000,
    FILE_RETENTION_DAYS: 30,
    LOG_RETENTION_DAYS: 7
  },
  
  CACHE: {
    TTL: 300,           // 5 minutes
    CHECK_PERIOD: 600   // 10 minutes
  },
  
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
    MAX_REQUESTS: 100
  },
  
  AUTH: {
    TOKEN_EXPIRY: '7d',
    SALT_ROUNDS: 10
  },
  
  VALIDATION: {
    REQUIRED_CSV_FIELDS: ['Master SKU', 'Quantity', 'Estimated Cost', 'Title'],
    MIN_PASSWORD_LENGTH: 8,
    MAX_FILE_SIZE: 50 * 1024 * 1024  // 50MB
  }
};