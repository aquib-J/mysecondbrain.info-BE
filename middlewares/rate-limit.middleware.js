import rateLimit from 'express-rate-limit';
import { MemoryStore } from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';
import Logger from '../utils/Logger.js';
import Response from '../utils/Response.js';
import { USE_REDIS, NODE_ENV } from '../config/env.js';
import redisConnect from '../databases/redis/redisConnect.js';

const logger = new Logger();

/**
 * Redis store implementation for express-rate-limit with enhanced connection handling
 */
class RedisStore {
    constructor(windowMs) {
        this.windowMs = windowMs || 60 * 1000; // Default to 1 minute if not provided
        this.prefix = 'rl:';
        this.client = null;
        this.connectionAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.healthCheckInterval = null;
        this.reconnecting = false;

        // Initialize Redis client
        this.initializeClient();

        // Start health check monitoring
        this.startHealthCheck();
    }

    /**
     * Initialize Redis client
     */
    async initializeClient() {
        if (this.reconnecting) {
            return;
        }

        this.reconnecting = true;

        try {
            // Get Redis client using the connection manager
            this.client = await redisConnect.getClient();

            if (!this.client) {
                throw new Error('Redis client not available from connection manager');
            }

            logger.info('Redis client successfully obtained for rate limiting');
            this.connectionAttempts = 0;
            this.reconnecting = false;

            // Test connection with a PING
            await this.testConnection();
        } catch (err) {
            this.connectionAttempts++;
            this.reconnecting = false;

            if (this.connectionAttempts <= this.maxRetries) {
                logger.warn(`Redis rate limiter initialization attempt ${this.connectionAttempts} failed, retrying in ${this.retryDelay}ms`, {
                    error: err.message
                });

                // Retry after delay
                setTimeout(() => this.initializeClient(), this.retryDelay * this.connectionAttempts);
            } else {
                logger.error('Failed to initialize Redis client for rate limiting after retries', {
                    attempts: this.connectionAttempts,
                    error: err.message
                });
            }
        }
    }

    /**
     * Test connection to Redis with a PING command
     */
    async testConnection() {
        try {
            const result = await this.client.ping();
            if (result !== 'PONG') {
                throw new Error('Redis ping did not return PONG');
            }
            return true;
        } catch (err) {
            logger.error('Redis connection test failed', {
                error: err.message
            });
            return false;
        }
    }

    /**
     * Start a health check interval to monitor Redis connection
     */
    startHealthCheck() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Set up health check every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            if (!this.isConnected()) {
                logger.warn('Health check detected Redis disconnection, attempting to reconnect');
                await this.initializeClient();
            }
        }, 30000); // 30 seconds
    }

    /**
     * Clean up resources when the store is no longer needed
     */
    shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Check if client is connected and ready
     * @returns {boolean} - Whether the client is connected
     */
    isConnected() {
        return redisConnect.isConnected();
    }

    /**
     * Increment key and get count
     * @param {string} key - The key to increment
     * @returns {Promise<Object>} - The incremented count and TTL
     */
    async increment(key) {
        const redisKey = this.prefix + key;
        const now = Date.now();

        // If Redis is not connected, return default values
        if (!this.isConnected()) {
            logger.debug('Redis not connected, using in-memory fallback for rate limiting', { key });
            return {
                totalHits: 1,
                resetTime: new Date(now + this.windowMs)
            };
        }

        try {
            // Use INCR to increment the counter and get the new value
            let countStr = await this.client.incr(redisKey);

            // Handle unexpected response types
            let count = 1;
            if (typeof countStr === 'number') {
                count = countStr;
            } else if (typeof countStr === 'string') {
                count = parseInt(countStr, 10);
                if (isNaN(count) || count < 1) {
                    count = 1; // Fallback to safe value
                }
            }

            logger.debug('Rate limit incremented', {
                key: redisKey,
                count,
                type: typeof countStr
            });

            // Get TTL for the key
            let ttl = await this.client.ttl(redisKey);

            // If this is a new key (count === 1) or TTL is -1 (no expiry set) or -2 (key doesn't exist)
            if (count === 1 || ttl < 0) {
                await this.client.expire(redisKey, Math.ceil(this.windowMs / 1000));
                ttl = Math.ceil(this.windowMs / 1000);

                logger.debug('Set expiry on rate limit key', {
                    key: redisKey,
                    ttl: Math.ceil(this.windowMs / 1000)
                });
            }

            // Calculate reset time based on TTL
            const resetTime = new Date(now + (ttl * 1000));

            return {
                totalHits: count,
                resetTime: resetTime
            };
        } catch (err) {
            logger.error('Redis store error on increment', {
                key,
                error: err.message,
                stack: err.stack
            });

            // Return valid fallback values that won't trigger validation errors
            return {
                totalHits: 1,
                resetTime: new Date(now + this.windowMs)
            };
        }
    }

    /**
     * Decrement key
     * @param {string} key - The key to decrement
     * @returns {Promise<void>}
     */
    async decrement(key) {
        // If Redis is not connected, do nothing
        if (!this.isConnected()) return;

        const redisKey = this.prefix + key;
        try {
            const multi = this.client.multi();

            // Get current value
            multi.get(redisKey);

            // Execute command
            const [currentValue] = await multi.exec();

            // Only decrement if value exists and is greater than 0
            if (currentValue[1] && parseInt(currentValue[1]) > 0) {
                await this.client.decr(redisKey);
            }
        } catch (err) {
            logger.error('Redis store error on decrement', {
                key,
                error: err.message,
                stack: err.stack
            });
        }
    }

    /**
     * Reset key
     * @param {string} key - The key to reset
     * @returns {Promise<void>}
     */
    async resetKey(key) {
        // If Redis is not connected, do nothing
        if (!this.isConnected()) return;

        const redisKey = this.prefix + key;
        try {
            await this.client.del(redisKey);
        } catch (err) {
            logger.error('Redis store error on reset', {
                key,
                error: err.message,
                stack: err.stack
            });
        }
    }

    /**
     * Reset all keys with this prefix
     * @returns {Promise<void>}
     */
    async resetAll() {
        // If Redis is not connected, do nothing
        if (!this.isConnected()) return;

        try {
            // Get all keys with our prefix
            const keys = await this.client.keys(this.prefix + '*');
            if (keys.length > 0) {
                await this.client.del(keys);
                logger.info(`Reset ${keys.length} rate limit keys`);
            }
        } catch (err) {
            logger.error('Redis store error on resetAll', {
                error: err.message,
                stack: err.stack
            });
        }
    }
}

/**
 * Create appropriate store based on environment
 * @param {Object} options - Rate limiter options
 * @returns {Object} - Configured rate limiter middleware
 */
const createLimiter = (options) => {
    const windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
    let store;

    // Use Redis in production, memory in development
    if (USE_REDIS === 'true' && NODE_ENV === 'production') {
        try {
            store = new RedisStore(windowMs);
            logger.info('Using Redis store for rate limiting');
        } catch (err) {
            logger.error('Failed to create Redis store, falling back to memory store', {
                error: err.message
            });
            store = new MemoryStore();
        }
    } else {
        store = new MemoryStore();
        logger.info('Using in-memory store for rate limiting');
    }

    const baseConfig = {
        windowMs: windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        store: store,
        keyGenerator: options.keyGenerator || ((req) => req.ip),
        handler: options.handler,
        skipFailedRequests: false,
        skipSuccessfulRequests: false,
    };

    // Log information about the rate limiter
    logger.info(`Rate limiter created`, {
        windowMs: options.windowMs,
        max: options.max,
        storeType: store instanceof RedisStore ? 'redis' : 'memory',
        limitType: options.limitType || 'general'
    });

    return rateLimit(baseConfig);
};

/**
 * Generate a key for rate limiting based on user ID or IP
 * @param {Object} req - Express request object
 * @returns {string} - Key for rate limiting
 */
const userKeyGenerator = (req) => {
    // If authenticated, use user ID
    if (req.user?.id) {
        return `user:${req.user.id}`;
    }

    // Use the consistent clientIp property set by the requestLoggerMiddleware
    // This already handles all the different headers and fallbacks
    const ip = req.clientIp || req.ip || 'unknown';

    return `ip:${ip}`;
};

/**
 * Rate limiting middleware for file uploads - 6 uploads per 24 hours
 */
export const uploadRateLimiter = createLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 20, // 20 uploads per day
    keyGenerator: userKeyGenerator,
    limitType: 'upload',
    handler: (req, res) => {
        const userId = req.user?.id || req.ip;
        logger.warn('Rate limit exceeded for file uploads', { userId });

        return Response.fail(
            res,
            'You have reached your daily upload limit (6 uploads per day). Please contact the author for increases or consider hosting the service locally.',
            StatusCodes.TOO_MANY_REQUESTS
        );
    }
});

/**
 * Rate limiting middleware for queries - 10 queries per 24 hours
 * This includes chat creation, querying, querying by document ID, and structured queries
 */
export const queryRateLimiter = createLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 100, // 10 queries per day
    keyGenerator: userKeyGenerator,
    limitType: 'query',
    handler: (req, res) => {
        const userId = req.user?.id || req.ip;
        logger.warn('Rate limit exceeded for queries', { userId });

        return Response.fail(
            res,
            'You have reached your daily query limit (10 queries per day). Please contact the author for increases or consider hosting the service locally.',
            StatusCodes.TOO_MANY_REQUESTS
        );
    }
});

/**
 * Global API rate limiter - 10 requests per minute per IP
 */
export const globalRateLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 10 requests per minute
    keyGenerator: (req) => req?.clientIp || req.ip, // Always use IP for global rate limiting
    limitType: 'global',
    handler: (req, res) => {
        logger.warn('Global rate limit exceeded', { ip: req.ip });

        return Response.fail(
            res,
            'Too many requests. Please try again later.',
            StatusCodes.TOO_MANY_REQUESTS
        );
    }
}); 