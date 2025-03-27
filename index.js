// Import polyfills first
import './polyfills.js';

import express from 'express';
import bodyParser from 'body-parser';
import { StatusCodes } from 'http-status-codes';
import { PORT } from './config/env.js';
import cookieParser from 'cookie-parser';
import errorMiddleware from './middlewares/error.middleware.js'
import fileUpload from 'express-fileupload';
import cors from 'cors';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { errors } from 'celebrate';
import Response from './utils/Response.js';
import Logger, { requestContext } from './utils/Logger.js';
import appRoute from './routes/app.routes.js';
import { initializeDatabase } from './databases/mysql8/sequelizeConnect.js';
import { setupSwagger } from './swagger.js';
import * as uuid from 'uuid';
// Import centralized cron job manager
import { startAllCronJobs, stopAllCronJobs } from './cron/index.js';
import { globalRateLimiter } from './middlewares/rate-limit.middleware.js';
// Import email queue service
import emailQueueService from './services/email.queue.js';

const logger = new Logger();

const app = express();

// Enable trust proxy to properly handle IP addresses behind proxies
app.set('trust proxy', true);

// Request ID middleware
app.use((req, res, next) => {
    const requestId = uuid.v4();
    req.requestId = requestId;
    res.locals.requestId = requestId;

    // Use AsyncLocalStorage to propagate the request context
    requestContext.run({ requestId, req, res }, () => {
        logger.info('New request received', {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
        next();
    });
});

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Setup Swagger documentation
setupSwagger(app);

// Apply global rate limiter for all API routes
app.use('/api/', globalRateLimiter);

app.get('/status', (req, res) => {
    logger.info('Checking application status');
    Response.success(res, 'Application is running', { status: true });
});

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(cookieParser());

// Apply request/response logging middleware
app.use(requestLoggerMiddleware);

app.use(appRoute);

// Handle celebrate/validation errors
app.use(errors());

app.use(errorMiddleware);

// Catch-all error block
app.use((err, req, res, next) => {
    logger.error('Unhandled error occurred', {
        error: err.message,
        stack: err.stack
    });
    Response.fail(res, err.message, err.status || StatusCodes.INTERNAL_SERVER_ERROR, err.code, err);
});

// Initialize database connection
await initializeDatabase();

// Start all cron jobs
startAllCronJobs();

// Initialize email queue system
logger.info('Initializing email queue service');
await emailQueueService.init();

// Start HTTP server and store server instance
const server = app.listen(PORT, () => {
    logger.info(`Application running on PORT ${PORT}`);
    logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
    logger.info(`API Documentation JSON collection available at http://localhost:${PORT}/api-docs.json`);
});

// Graceful shutdown handler
function gracefulShutdown() {
    logger.info('Graceful shutdown initiated');

    // Stop all cron jobs
    stopAllCronJobs();

    // Clean up the Redis rate limit stores [Maybe required down the line]
    try {
        logger.info('Cleaning up Redis rate limit resources');
        // If you have global references to your stores: globalLimiterStore.shutdown();
    } catch (error) {
        logger.error('Error cleaning up Redis resources', { error: error.message });
    }

    // Close HTTP server
    server.close(() => {
        logger.info('HTTP server closed');
        logger.info('Exiting process');
        process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 5000);
}

// Register signal handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;