const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'txf-inventory' },
  transports: [
    // Error logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    // Export specific logs
    new winston.transports.File({
      filename: path.join(logsDir, 'exports.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.printf(info => {
          if (info.category === 'export') {
            return JSON.stringify(info);
          }
          return false;
        })
      )
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create specialized loggers
const exportLogger = (message, meta = {}) => {
  logger.info(message, { category: 'export', ...meta });
};

const errorLogger = (error, context = {}) => {
  logger.error(error.message, {
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

const auditLogger = (action, user, details = {}) => {
  logger.info('Audit log', {
    category: 'audit',
    action,
    user,
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  exportLogger,
  errorLogger,
  auditLogger
};