/**
 * Configuration Index
 * Central export point for all configuration files
 */

module.exports = {
    database: require('./database.config'),
    automation: require('./automation.config'),
    server: require('./server.config')
};