import Logger from '../utils/Logger.js';
const logger = new Logger();

/**
 * Middleware to log all incoming requests and outgoing responses
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const requestLoggerMiddleware = (req, res, next) => {
    const startTime = Date.now();

    // Log request details
    logger.info('Incoming request', {
        method: req.method,
        url: req.originalUrl,
        params: req.params,
        query: req.query,
        body: sanitizeBody(req.body),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id || 'unauthenticated'
    });

    // Store the original json method
    const originalJson = res.json;

    // Override the json method to log the response
    res.json = function (data) {
        const responseTime = Date.now() - startTime;

        // Log response details
        logger.info('Outgoing response', {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            response: sanitizeResponse(data),
            userId: req.user?.id || 'unauthenticated'
        });

        // Call the original json method
        return originalJson.call(this, data);
    };

    next();
};

/**
 * Sanitize the request body to remove sensitive information and limit size
 * @param {Object} body - Request body
 * @returns {Object} Sanitized body
 */
function sanitizeBody(body) {
    if (!body) return {};

    // Create a copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(body));

    // Remove sensitive fields TODO: add the correct fields later
    if (sanitized.password) sanitized.password = '********';
    if (sanitized.token) sanitized.token = '********';
    if (sanitized.apiKey) sanitized.apiKey = '********';

    // Limit the size of large text fields
    if (sanitized.query && typeof sanitized.query === 'string' && sanitized.query.length > 100) {
        sanitized.query = sanitized.query.substring(0, 100) + '...';
    }

    return sanitized;
}

/**
 * Sanitize the response to limit its size in logs
 * @param {Object} response - Response object
 * @returns {Object} Sanitized response
 */
function sanitizeResponse(response) {
    if (!response) return {};

    // Create a copy to avoid modifying the original
    let sanitized;
    try {
        sanitized = JSON.parse(JSON.stringify(response));
    } catch (e) {
        return { loggingError: 'Could not stringify response' };
    }

    // If the response has data and it's large, truncate it
    if (sanitized.data) {
        if (typeof sanitized.data === 'string' && sanitized.data.length > 100) {
            sanitized.data = sanitized.data.substring(0, 100) + '... (truncated)';
        } else if (Array.isArray(sanitized.data) && sanitized.data.length > 10) {
            sanitized.data = sanitized.data.slice(0, 3);
            sanitized.data.push(`... (${sanitized.data.length - 3} more items)`);
        }
    }

    return sanitized;
}

export default requestLoggerMiddleware; 