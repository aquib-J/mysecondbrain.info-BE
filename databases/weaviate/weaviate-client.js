import axios from 'axios';
import Logger from '../../utils/Logger.js';
import { WEAVIATE_SCHEME, WEAVIATE_HOST, WEAVIATE_API_KEY } from '../../config/env.js';

const logger = new Logger();

/**
 * Client for interacting with Weaviate API
 */
class WeaviateClient {
    constructor() {
        // Base headers
        const headers = {
            'Content-Type': 'application/json',
        };

        // Add API key if provided
        if (WEAVIATE_API_KEY) {
            headers['Authorization'] = `Bearer ${WEAVIATE_API_KEY}`;
            logger.info('Weaviate API key authentication enabled');
        } else {
            logger.info('Weaviate running in anonymous mode (no API key)');
        }

        this.httpClient = axios.create({
            baseURL: `${WEAVIATE_SCHEME || 'http'}://${WEAVIATE_HOST || 'localhost:8080'}`,
            headers,
            // Add longer timeout to handle slow startup
            timeout: 30000
        });

        // Retry configuration
        this.maxRetries = 10;
        this.retryDelay = 2000;
    }

    /**
     * Make an API request with retry mechanism
     * @private
     * @param {Function} apiCall - Function that returns a promise for the API call
     * @param {string} operation - Name of the operation for logging
     * @returns {Promise<any>} - API response
     */
    async #withRetry(apiCall, operation) {
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await apiCall();
            } catch (error) {
                lastError = error;

                // Log the error
                if (attempt < this.maxRetries) {
                    logger.warn(`Weaviate ${operation} failed, retrying (${attempt}/${this.maxRetries})`, {
                        error: error.message,
                        attempt
                    });

                    // Wait before retrying (with exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(1.5, attempt - 1)));
                }
            }
        }

        // If we've exhausted all retries, throw the last error
        logger.error(`Weaviate ${operation} failed after ${this.maxRetries} attempts`, {
            error: lastError.message,
            stack: lastError.stack
        });
        throw lastError;
    }

    /**
     * Get Weaviate schema
     * @returns {Promise<Object>} - Schema object
     */
    async getSchema() {
        return this.#withRetry(
            () => this.httpClient.get('/v1/schema').then(response => response.data),
            'getSchema'
        );
    }

    /**
     * Get a specific class from the schema
     * @param {string} className - Name of the class to get
     * @returns {Promise<Object>} - Class object
     */
    async getClass(className) {
        return this.#withRetry(
            () => this.httpClient.get(`/v1/schema/${className}`).then(response => response.data),
            `getClass(${className})`
        );
    }

    /**
     * Create a new class in the schema
     * @param {Object} classDefinition - Definition of the class to create
     * @returns {Promise<Object>} - Response data
     */
    async createClass(classDefinition) {
        return this.#withRetry(
            () => this.httpClient.post('/v1/schema', classDefinition).then(response => response.data),
            'createClass'
        );
    }

    /**
     * Update a class in the schema
     * @param {string} className - Name of the class to update
     * @param {Object} updates - Updates to apply to the class
     * @returns {Promise<Object>} - Response data
     */
    async updateClass(className, updates) {
        return this.#withRetry(
            () => this.httpClient.put(`/v1/schema/${className}`, updates).then(response => response.data),
            `updateClass(${className})`
        );
    }

    /**
     * Get tenants for a class
     * @param {string} className - Name of the class
     * @returns {Promise<Array>} - List of tenants
     */
    async getTenants(className) {
        try {
            const response = await this.httpClient.get(`/v1/schema/${className}/tenants`);
            return response.data || [];
        } catch (error) {
            logger.error(`Error getting tenants for class ${className}`, { error });
            throw error;
        }
    }

    /**
     * Create tenants for a class
     * @param {string} className - Name of the class
     * @param {Array<Object>} tenants - Array of tenant objects with name property
     * @returns {Promise<Object>} - Response data
     */
    async createTenants(className, tenants) {
        try {
            const response = await this.httpClient.post(`/v1/schema/${className}/tenants`, tenants);
            return response.data;
        } catch (error) {
            logger.error(`Error creating tenants for class ${className}`, { error });
            throw error;
        }
    }

    /**
     * Store objects in batch
     * @param {Array<Object>} objects - Array of objects to store
     * @returns {Promise<Object>} - Response data
     */
    async batchObjects(objects) {
        try {
            const response = await this.httpClient.post('/v1/batch/objects', { objects });
            return response.data;
        } catch (error) {
            logger.error('Error storing batch objects', { error });
            throw error;
        }
    }

    /**
     * Execute a GraphQL query
     * @param {string} query - GraphQL query
     * @returns {Promise<Object>} - Query results
     */
    async graphqlQuery(query) {
        return this.#withRetry(
            () => this.httpClient.post('/v1/graphql', { query }).then(response => response.data),
            'graphqlQuery'
        );
    }

    /**
     * Get Weaviate meta information
     * @returns {Promise<Object>} - Meta information
     */
    async getMeta() {
        try {
            const response = await this.httpClient.get('/v1/meta');
            return response.data;
        } catch (error) {
            logger.error('Error getting meta information', { error });
            throw error;
        }
    }

    async healthCheck() {
        try {
            return await this.#withRetry(
                () => this.httpClient.get('v1/.well-known/live').then(response => response.status === 200),
                'healthCheck'
            );
        } catch (error) {
            logger.error('Weaviate health check failed', { error: error.message });
            return false;
        }
    }

    async deleteClass(className) {
        return this.#withRetry(
            () => this.httpClient.delete(`/v1/schema/${className}`).then(response => response.data),
            `deleteClass(${className})`
        );
    }

    async batchImport(objects, className) {
        return this.#withRetry(
            () => this.httpClient.post('/v1/batch/objects', { objects }).then(response => response.data),
            `batchImport(${className})`
        );
    }

    async deleteObject(id, className) {
        return this.#withRetry(
            () => this.httpClient.delete(`/v1/objects/${id}`).then(response => response.data),
            `deleteObject(${id})`
        );
    }
}

export default new WeaviateClient(); 