const { body, param, query, validationResult } = require('express-validator');
const { VALIDATION } = require('../config/constants');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// CSV data validation
const validateCsvRow = (row, rowIndex) => {
  const errors = [];
  
  // Check required fields
  for (const field of VALIDATION.REQUIRED_CSV_FIELDS) {
    if (!row[field] || row[field].toString().trim() === '') {
      errors.push(`Row ${rowIndex}: Missing required field '${field}'`);
    }
  }
  
  // Validate quantity
  const quantity = parseInt(row['Quantity']);
  if (isNaN(quantity) || quantity < 0) {
    errors.push(`Row ${rowIndex}: Invalid quantity '${row['Quantity']}'`);
  }
  
  // Validate estimated cost
  const cost = parseFloat(row['Estimated Cost']);
  if (isNaN(cost) || cost < 0) {
    errors.push(`Row ${rowIndex}: Invalid estimated cost '${row['Estimated Cost']}'`);
  }
  
  // Validate SKU format
  const sku = row['Master SKU'];
  if (sku && !/^[A-Z0-9\-_]+$/i.test(sku)) {
    errors.push(`Row ${rowIndex}: Invalid SKU format '${sku}'`);
  }
  
  return errors;
};

// Validation rules for API endpoints
const validationRules = {
  // Export validation
  runExport: [
    body('type')
      .isIn(['full', 'export-only', 'process-only'])
      .withMessage('Invalid export type')
  ],
  
  // Settings validation
  updateSettings: [
    body('notifications_enabled')
      .optional()
      .isBoolean()
      .withMessage('Notifications enabled must be boolean'),
    body('notification_method')
      .optional()
      .isIn(['email', 'webhook', 'console'])
      .withMessage('Invalid notification method'),
    body('notification_email')
      .optional()
      .isEmail()
      .withMessage('Invalid email address'),
    body('webhook_url')
      .optional()
      .isURL()
      .withMessage('Invalid webhook URL'),
    body('export_wait_time')
      .optional()
      .isInt({ min: 1, max: 60 })
      .withMessage('Export wait time must be between 1 and 60 minutes'),
    body('retry_attempts')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('Retry attempts must be between 0 and 10'),
    body('export_retention_days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Export retention must be between 1 and 365 days'),
    body('log_retention_days')
      .optional()
      .isInt({ min: 1, max: 90 })
      .withMessage('Log retention must be between 1 and 90 days')
  ],
  
  // Notification test validation
  testNotification: [
    body('channel')
      .isIn(['email', 'webhook', 'console'])
      .withMessage('Invalid notification channel'),
    body('recipient')
      .notEmpty()
      .withMessage('Recipient is required'),
    body('message')
      .notEmpty()
      .isLength({ max: 1000 })
      .withMessage('Message is required and must be less than 1000 characters')
  ],
  
  // Inventory query validation
  getInventory: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('sort')
      .optional()
      .isJSON()
      .withMessage('Sort must be valid JSON'),
    query('filter')
      .optional()
      .isJSON()
      .withMessage('Filter must be valid JSON')
  ],
  
  // Date parameter validation
  getDateParam: [
    param('date')
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Date must be in YYYY-MM-DD format')
  ],
  
  // Analytics period validation
  getAnalytics: [
    param('period')
      .isIn(['daily', 'weekly', 'monthly'])
      .withMessage('Period must be daily, weekly, or monthly')
  ]
};

// Sanitization helpers
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove any script tags
  input = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Escape HTML entities
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return input.replace(/[&<>"'/]/g, match => htmlEntities[match]);
};

// File upload validation
const validateFileUpload = (file) => {
  const errors = [];
  
  if (!file) {
    errors.push('No file uploaded');
    return errors;
  }
  
  // Check file size
  if (file.size > VALIDATION.MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum of ${VALIDATION.MAX_FILE_SIZE / 1024 / 1024}MB`);
  }
  
  // Check file type
  const allowedTypes = ['.csv', '.txt'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (!allowedTypes.includes(fileExtension)) {
    errors.push(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  return errors;
};

module.exports = {
  validate,
  validateCsvRow,
  validationRules,
  sanitizeInput,
  validateFileUpload
};