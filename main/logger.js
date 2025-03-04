// logger.js
const winston = require('winston');

// Create logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(info => {
      // Mask sensitive data
      if (info.message && typeof info.message === 'string') {
        info.message = info.message.replace(/(0x)?[a-fA-F0-9]{64}/g, '[PRIVATE_KEY]');
      }
      return JSON.stringify(info);
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Helper to log bot actions
function logAction(action, data = {}) {
  logger.info({
    action,
    timestamp: new Date().toISOString(),
    ...data
  });
}

module.exports = {
  logger,
  logAction
};
