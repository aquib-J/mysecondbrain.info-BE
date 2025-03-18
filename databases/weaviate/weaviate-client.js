import axios from 'axios';
import Logger from '../../utils/Logger.js';
import { WEAVIATE_SCHEME, WEAVIATE_HOST } from '../../config/env.js';

const logger = new Logger();

/**
 * Client for interacting with Weaviate API
 */
class WeaviateClient {
    constructor() {
        this.httpClient = axios.create({
            baseURL: `${WEAVIATE_SCHEME || 'http'}://${WEAVIATE_HOST || 'localhost:8080'}`,
            headers: {
                'Content-Type': 'application/json',
            }
        });
    }

    /**
     * Get Weaviate schema
     * @returns {Promise<Object>} - Schema object
     */
    async getSchema() {
        try {
            const response = await this.httpClient.get('/v1/schema');
            return response.data;
        } catch (error) {
            logger.error('Error getting schema', { error });
            throw error;
        }
    }

    /**
     * Get a specific class from the schema
     * @param {string} className - Name of the class to get
     * @returns {Promise<Object>} - Class object
     */
    async getClass(className) {
        try {
            const response = await this.httpClient.get(`/v1/schema/${className}`);
            return response.data;
        } catch (error) {
            logger.error(`Error getting class ${className}`, { error });
            throw error;
        }
    }

    /**
     * Create a new class in the schema
     * @param {Object} classDefinition - Definition of the class to create
     * @returns {Promise<Object>} - Response data
     */
    async createClass(classDefinition) {
        try {
            const response = await this.httpClient.post('/v1/schema', classDefinition);
            return response.data;
        } catch (error) {
            logger.error('Error creating class', { error, class: classDefinition.class });
            throw error;
        }
    }

    /**
     * Update a class in the schema
     * @param {string} className - Name of the class to update
     * @param {Object} updates - Updates to apply to the class
     * @returns {Promise<Object>} - Response data
     */
    async updateClass(className, updates) {
        try {
            const response = await this.httpClient.put(`/v1/schema/${className}`, updates);
            return response.data;
        } catch (error) {
            logger.error(`Error updating class ${className}`, { error });
            throw error;
        }
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
        try {
            const response = await this.httpClient.post('/v1/graphql', { query });
            // The Weaviate GraphQL API returns data in the format { data: { ... } }
            // We need to return the data property directly
            return response.data.data ? response.data : { data: response.data };
        } catch (error) {
            logger.error('Error executing GraphQL query', { error });
            throw error;
        }
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
            const response = await this.httpClient.get('v1/.well-known/live');
            return response.status === 200;
        } catch (error) {
            logger.error('Weaviate is not running', { error });
            return 'unavailable';
        }
    }
}

export default new WeaviateClient(); 