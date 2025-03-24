import rateLimit from 'express-rate-limit';
import { MemoryStore } from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';
import Logger from '../utils/Logger.js';
import Response from '../utils/Response.js';
import { USE_REDIS, NODE_ENV } from '../config/env.js';
import redisConnect from '../databases/redis/redisConnect.js';

const logger = new Logger();

/**
 * Redis store implementation for express-rate-limit
 */
class RedisStore {
    constructor(windowMs) {
        this.client = redisConnect.getClient(); // Get the actual Redis client
        this.prefix = 'rl:';
        this.windowMs = windowMs || 60 * 1000; // Default to 1 minute if not provided

        // Ensure Redis client is ready
        if (!this.client || !this.client.isReady) {
            logger.error('Redis client not ready');
            throw new Error('Redis client not ready');
        }
    }

    /**
     * Increment key and get count
     * @param {string} key - The key to increment
     * @returns {Promise<Object>} - The incremented count and TTL
     */
    async increment(key) {
        const redisKey = this.prefix + key;
        const now = Date.now();

        try {
            // Use multi to ensure atomic operations
            const multi = this.client.multi();

            // Increment the counter
            multi.incr(redisKey);

            // Get TTL for existing key
            multi.ttl(redisKey);

            // Execute both commands
            const [count, ttl] = await multi.exec();

            // If this is a new key (count === 1) or TTL is -1 (no expiry set)
            if (count[1] === 1 || ttl[1] === -1) {
                await this.client.expire(redisKey, Math.ceil(this.windowMs / 1000));

                return {
                    totalHits: 1,
                    resetTime: new Date(now + this.windowMs)
                };
            }

            // Calculate reset time based on TTL
            const resetTime = new Date(now + (ttl[1] * 1000));

            return {
                totalHits: count[1],
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
    return req.user?.id || req.ip; // Use userId if available, otherwise IP
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
    keyGenerator: (req) => req.ip, // Always use IP for global rate limiting
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