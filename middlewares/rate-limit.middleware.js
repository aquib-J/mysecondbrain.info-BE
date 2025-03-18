import rateLimit from 'express-rate-limit';
import { MemoryStore } from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';
import Logger from '../utils/Logger.js';
import Response from '../utils/Response.js';
import { USE_REDIS } from '../config/env.js';
import redisConnect from '../databases/redis/redisConnect.js';

const logger = new Logger();

// Create in-memory store by default (for development environments)
const createLimiter = (options) => {
    // const store = USE_REDIS === 'true' ? redisConnect : new MemoryStore();
    const store = new MemoryStore();
    const baseConfig = {
        windowMs: options.windowMs,
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
        storeType: USE_REDIS === 'true' ? 'redis' : 'memory',
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