/**
 * Server Configuration
 * Express server and API settings
 */

module.exports = {
    // Server settings
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        corsEnabled: true,
        trustProxy: process.env.TRUST_PROXY === 'true'
    },
    
    // API settings
    api: {
        prefix: '/api',
        version: 'v1',
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        }
    },
    
    // WebSocket settings
    websocket: {
        enabled: true,
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    },
    
    // Session settings
    session: {
        secret: process.env.SESSION_SECRET || 'txf-inventory-tracker-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    },
    
    // Static files
    static: {
        path: 'public',
        maxAge: '1d',
        extensions: ['html', 'css', 'js', 'png', 'jpg', 'gif', 'svg']
    },
    
    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'combined',
        errorLog: 'logs/error.log',
        accessLog: 'logs/access.log'
    }
};