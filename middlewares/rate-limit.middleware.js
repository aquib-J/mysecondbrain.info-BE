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
        this.client = redisConnect;
        this.prefix = 'rl:';
        this.windowMs = windowMs || 60 * 1000; // Default to 1 minute if not provided
    }

    /**
     * Increment key and get count
     * @param {string} key - The key to increment
     * @param {Object} options - Options object
     * @returns {Promise<Object>} - The incremented count and TTL
     */
    async increment(key) {
        const redisKey = this.prefix + key;

        try {
            // Increment key
            const count = await this.client.incr(redisKey);

            // Set expiry if first hit
            if (count === 1) {
                await this.client.expire(redisKey, Math.ceil(this.windowMs / 1000));
            }

            // Get remaining TTL
            const ttl = await this.client.ttl(redisKey);

            return {
                totalHits: count,
                resetTime: Date.now() + (ttl * 1000)
            };
        } catch (err) {
            logger.error('Redis store error on increment', { key, error: err.message });
            // Fallback to success in case of Redis error
            return { totalHits: 0, resetTime: Date.now() };
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
            const count = await this.client.get(redisKey);
            if (count && parseInt(count) > 0) {
                await this.client.decr(redisKey);
            }
        } catch (err) {
            logger.error('Redis store error on decrement', { key, error: err.message });
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
            logger.error('Redis store error on reset', { key, error: err.message });
        }
    }

    /**
     * Reset all keys (not implemented for Redis)
     * @returns {Promise<void>}
     */
    async resetAll() {
        logger.warn('resetAll called on Redis store - operation not supported');
    }
}

// Create appropriate store based on environment
const createLimiter = (options) => {
    const windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
    let store;

    // Use Redis in production, memory in development
    if (USE_REDIS === 'true' && NODE_ENV === 'production') {
        store = new RedisStore(windowMs);
        logger.info('Using Redis store for rate limiting');
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
        storeType: USE_REDIS === 'true' && NODE_ENV === 'production' ? 'redis' : 'memory',
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
    max: 6, // 6 uploads per day
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
    max: 10, // 10 queries per day
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
    max: 10, // 10 requests per minute
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