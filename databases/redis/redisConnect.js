import { createClient } from 'redis';
import Logger from '../../utils/Logger.js';
import { REDIS_URL, NODE_ENV } from '../../config/env.js';

const logger = new Logger();

/**
 * Redis connection manager with connection pooling and error handling
 */
class RedisConnect {
    constructor() {
        this.client = null;
        this.isConnecting = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.url = REDIS_URL || 'redis://localhost:6379';
        this.isAuthenticated = this.detectAuthFromUrl(this.url);

        logger.info('Redis connection manager initialized', {
            url: this.maskRedisUrl(this.url),
            authenticated: this.isAuthenticated
        });
    }

    /**
     * Detect if Redis URL contains authentication
     * @param {string} url - Redis URL
     * @returns {boolean} - True if authentication is present
     */
    detectAuthFromUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return !!parsedUrl.password && parsedUrl.password.length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Mask sensitive parts of Redis URL for logging
     * @param {string} url - Redis URL
     * @returns {string} - Masked URL
     */
    maskRedisUrl(url) {
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.password) {
                parsedUrl.password = '***';
            }
            return parsedUrl.toString();
        } catch (error) {
            return 'Invalid URL format';
        }
    }

    /**
     * Connect to Redis server
     * @returns {Promise<Object>} - Redis client
     */
    async connect() {
        if (this.client && this.client.isOpen) {
            return this.client;
        }

        if (this.isConnecting) {
            // Wait for the ongoing connection
            logger.debug('Connection already in progress, waiting...');
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.getClient();
        }

        this.isConnecting = true;
        this.connectionAttempts++;

        try {
            logger.info('Connecting to Redis', {
                attempt: this.connectionAttempts,
                maxAttempts: this.maxConnectionAttempts
            });

            this.client = createClient({ url: this.url });

            // Set up event handlers
            this.client.on('error', (err) => {
                logger.error('Redis client error', { error: err.message });
            });

            this.client.on('connect', () => {
                logger.info('Redis client connected');
            });

            this.client.on('reconnecting', () => {
                logger.info('Redis client reconnecting');
            });

            this.client.on('end', () => {
                logger.info('Redis client connection closed');
            });

            await this.client.connect();
            this.isConnecting = false;
            this.connectionAttempts = 0;
            return this.client;

        } catch (error) {
            this.isConnecting = false;
            logger.error('Failed to connect to Redis', {
                error: error.message,
                attempt: this.connectionAttempts
            });

            // Retry connection if not exceeded max attempts
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const backoff = Math.min(Math.pow(2, this.connectionAttempts) * 100, 3000);
                logger.info(`Retrying Redis connection in ${backoff}ms`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                return this.connect();
            }

            logger.error('Max Redis connection attempts reached', {
                attempts: this.connectionAttempts
            });
            this.client = null;
            return null;
        }
    }

    /**
     * Get Redis client, connecting if necessary
     * @returns {Promise<Object>} - Redis client
     */
    async getClient() {
        if (!this.client || !this.client.isOpen) {
            return this.connect();
        }
        return this.client;
    }

    /**
     * Check if Redis client is connected
     * @returns {boolean} - True if connected
     */
    isConnected() {
        return !!(this.client && this.client.isOpen);
    }

    /**
     * Ping Redis server to check connection
     * @returns {Promise<boolean>} - True if ping succeeded
     */
    async ping() {
        try {
            const client = await this.getClient();
            if (!client) return false;

            const result = await client.ping();
            return result === 'PONG';
        } catch (error) {
            logger.error('Redis ping failed', { error: error.message });
            return false;
        }
    }

    /**
     * Close Redis connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.client && this.client.isOpen) {
            try {
                await this.client.quit();
                this.client = null;
                logger.info('Redis connection closed');
            } catch (error) {
                logger.error('Error closing Redis connection', { error: error.message });
            }
        }
    }
}

// Export singleton instance
export default new RedisConnect(); 