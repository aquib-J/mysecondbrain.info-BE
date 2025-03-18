import * as uuid from 'uuid';
import Logger from '../../utils/Logger.js';
import weaviateClient from '../../databases/weaviate/weaviate-client.js';
import weaviateSchema from './weaviate-schema.js';
import weaviateQuery from './weaviate-query.js';

const logger = new Logger();

/**
 * Service for Weaviate vector database operations
 */
class VectorStoreService {
    constructor() {
        this.documentClassName = 'Document';
        this.jsonClassName = 'JsonDocument';
        this.initialize();
    }

    /**
     * Initialize Weaviate schema
     */
    async initialize() {
        try {
            await this.initializeDocumentClass();
            await this.initializeJsonDocumentClass();
            logger.info('Weaviate schema initialized successfully');
        } catch (error) {
            logger.error('Error initializing Weaviate schema', { error });
        }
    }

    /**
     * Initialize Document class schema
     * @private
     */
    async initializeDocumentClass() {
        try {
            await weaviateSchema.initializeClass(this.documentClassName);
        } catch (error) {
            logger.error('Error initializing Document class schema', { error });
            throw error;
        }
    }

    /**
     * Initialize JsonDocument class schema
     * @private
     */
    async initializeJsonDocumentClass() {
        try {
            await weaviateSchema.initializeClass(this.jsonClassName);
        } catch (error) {
            logger.error('Error initializing JSON document class', { error });
            throw error;
        }
    }

    /**
     * Get tenant ID from user ID
     * @private
     * @param {number} userId - User ID
     * @returns {string} - Tenant ID
     */
    #getTenantId(userId) {
        return `user_${userId}`;
    }

    /**
     * Ensure the tenant exists for the given class
     * @private
     * @param {string} className - Class name
     * @param {string} tenantId - Tenant ID
     */
    async #ensureTenantExists(className, tenantId) {
        return weaviateSchema.ensureTenantExists(className, tenantId);
    }

    /**
     * Store vectors in Weaviate
     * @param {Array} vectors - Array of vector objects from the database
     * @returns {Promise<Object>} - Result of the storage operation
     */
    async storeVectors(vectors) {
        const traceId = uuid.v4();
        try {
            logger.info('Starting vector storage process', {
                traceId,
                vectorsCount: vectors.length,
                timestamp: new Date().toISOString()
            });

            // Group vectors by tenant ID to ensure batch operations respect tenancy
            const vectorsByTenant = {};

            for (const vector of vectors) {
                const metadata = JSON.parse(vector.metadata || '{}');
                const userId = metadata.userId || metadata.documentUserId;

                if (!userId) {
                    logger.warn('Vector missing userId in metadata', {
                        traceId,
                        vectorId: vector.id,
                        metadataKeys: Object.keys(metadata)
                    });
                    continue;
                }

                const tenantId = this.#getTenantId(userId);
                const className = metadata.format === 'json' ? this.jsonClassName : this.documentClassName;

                // Ensure tenant exists before adding vectors
                await this.#ensureTenantExists(className, tenantId);

                // Group by className and tenantId
                const key = `${className}:${tenantId}`;
                if (!vectorsByTenant[key]) {
                    vectorsByTenant[key] = [];
                }

                vectorsByTenant[key].push({
                    vector,
                    className,
                    tenantId
                });
            }

            logger.info('Vectors grouped by tenant', {
                traceId,
                tenantCount: Object.keys(vectorsByTenant).length,
                groupedVectors: Object.keys(vectorsByTenant).map(key => ({
                    key,
                    count: vectorsByTenant[key].length
                }))
            });

            // Process each tenant's vectors in batches
            for (const [key, tenantVectors] of Object.entries(vectorsByTenant)) {
                const [className, tenantId] = key.split(':');
                const batchSize = 100;
                const totalBatches = Math.ceil(tenantVectors.length / batchSize);

                logger.info('Processing vectors for tenant', {
                    traceId,
                    className,
                    tenantId,
                    vectorCount: tenantVectors.length,
                    batchSize,
                    totalBatches
                });

                for (let i = 0; i < tenantVectors.length; i += batchSize) {
                    const batchNumber = Math.floor(i / batchSize) + 1;
                    const batch = tenantVectors.slice(i, i + batchSize);
                    const objects = [];

                    logger.info('Preparing batch for Weaviate', {
                        traceId,
                        className,
                        tenantId,
                        batchNumber,
                        totalBatches,
                        batchSize: batch.length
                    });

                    batch.forEach(({ vector }) => {
                        const metadata = JSON.parse(vector.metadata || '{}');

                        // For JSON documents, we still need to store the value for structured querying
                        const isJsonDocument = className === this.jsonClassName;

                        objects.push({
                            class: className,
                            tenant: tenantId,
                            vector: JSON.parse(vector.embedding),
                            properties: {
                                // Instead of storing full text, just store a reference to the text
                                // Only store the value for JSON documents, needed for structured queries
                                text: isJsonDocument ? vector.text_content : `Vector ID: ${vector.vector_id.toString('hex')}`,
                                metadata: vector.metadata,
                                jobId: vector.job_id,
                                documentId: metadata.documentId || 0,
                                vectorId: vector.vector_id.toString('hex'),
                                pageNumber: metadata.pageNumber || 0,
                                chunkIndex: metadata.chunkIndex || 0,
                                userId: metadata.userId || metadata.documentUserId,
                                // For JSON documents
                                path: metadata.path || '',
                                value: isJsonDocument ? metadata.value || '' : '',
                                valueType: metadata.valueType || ''
                            }
                        });
                    });

                    const batchStartTime = Date.now();

                    // Use batch API to store vectors
                    await weaviateClient.batchObjects(objects);

                    const batchEndTime = Date.now();
                    logger.info('Batch stored in Weaviate', {
                        traceId,
                        className,
                        tenantId,
                        batchNumber,
                        totalBatches,
                        batchSize: batch.length,
                        durationMs: batchEndTime - batchStartTime
                    });
                }

                logger.info('Completed vector storage for tenant', {
                    traceId,
                    className,
                    tenantId,
                    totalVectors: tenantVectors.length
                });
            }

            logger.info('Vector storage process completed', {
                traceId,
                totalVectorsStored: vectors.length,
                timestamp: new Date().toISOString()
            });

            return { success: true, count: vectors.length };
        } catch (error) {
            logger.error('Error storing vectors in Weaviate', {
                traceId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Perform similarity search
     * @param {Array<number>} queryVector - Query vector
     * @param {Object} options - Search options
     * @param {number} options.limit - Number of results to return
     * @param {number} options.documentId - Filter by document ID
     * @param {string} options.className - Class to search in (Document or JsonDocument)
     * @param {number} options.userId - User ID for tenant isolation
     * @returns {Promise<Array>} - Array of similar documents
     */
    async similaritySearch(queryVector, options = {}) {
        const searchId = uuid.v4();
        let retryCount = 0;
        const maxRetries = 2;

        try {
            const {
                limit = 5,
                documentId = null,
                className = this.documentClassName,
                userId
            } = options;

            logger.info('Starting similarity search', {
                searchId,
                className,
                limit,
                documentId,
                userId,
                vectorDimensions: queryVector.length,
                timestamp: new Date().toISOString()
            });

            if (!userId) {
                logger.error('Missing userId for similarity search', { searchId });
                throw new Error('userId is required for similarity search to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);
            const isJsonClass = className === this.jsonClassName;

            logger.debug('Building search query', {
                searchId,
                className,
                tenantId,
                isJsonClass,
                limit,
                hasDocumentIdFilter: !!documentId
            });

            // Build GraphQL query using query builder
            const query = weaviateQuery.buildSimilaritySearchQuery({
                className,
                tenantId,
                vector: queryVector,
                limit,
                documentId
            });

            const startTime = Date.now();
            let searchResults = [];
            let result;

            // Execute GraphQL query with retries
            while (retryCount <= maxRetries) {
                try {
                    logger.debug(`Executing GraphQL query (attempt ${retryCount + 1}/${maxRetries + 1})`, { searchId });
                    result = await weaviateClient.graphqlQuery(query);

                    // If successful, break the retry loop
                    searchResults = result.data && result.data.Get && result.data.Get[className]
                        ? result.data.Get[className]
                        : [];
                    break;
                } catch (error) {
                    retryCount++;

                    if (retryCount <= maxRetries) {
                        // Log the error and retry
                        logger.warn(`Similarity search failed, retrying (${retryCount}/${maxRetries})`, {
                            searchId,
                            error: error.message,
                            retryCount
                        });

                        // Wait before retrying (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, retryCount - 1)));
                    } else {
                        // All retries failed
                        logger.error('All similarity search attempts failed', {
                            searchId,
                            error: error.message,
                            stack: error.stack
                        });

                        // Return empty results instead of throwing
                        return [];
                    }
                }
            }

            const endTime = Date.now();

            logger.info('Received search results', {
                searchId,
                resultsCount: searchResults.length,
                durationMs: endTime - startTime,
                hasResults: searchResults.length > 0
            });

            return searchResults;
        } catch (error) {
            logger.error('Error performing similarity search', {
                searchId,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });

            // Return empty results instead of throwing for non-critical operations
            return [];
        }
    }

    /**
     * Execute a structured query on JSON documents
     * @param {Object} query - Query parameters
     * @param {string} query.operation - Operation to perform (sum, avg, max, min, count)
     * @param {string} query.field - Field to query
     * @param {Object} query.filter - Filter conditions
     * @param {number} query.documentId - Filter by document ID
     * @param {string} query.groupBy - Group results by field
     * @param {number} userId - User ID for tenant isolation
     * @returns {Promise<Object>} - Query result
     */
    async structuredQuery(query, userId) {
        try {
            if (!userId) {
                throw new Error('userId is required for structured query to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);
            const { operation, field, filter, documentId, groupBy } = query;

            // Build GraphQL query using query builder
            const graphqlQuery = weaviateQuery.buildStructuredQuery({
                className: this.jsonClassName,
                tenantId,
                field,
                documentId
            });

            // Execute GraphQL query
            const result = await weaviateClient.graphqlQuery(graphqlQuery);
            const documents = result.data && result.data.Get && result.data.Get[this.jsonClassName]
                ? result.data.Get[this.jsonClassName]
                : [];

            // If no documents found
            if (documents.length === 0) {
                return { result: null, count: 0 };
            }

            // If groupBy is specified, perform grouped aggregation
            if (groupBy) {
                return this._performGroupedAggregation(documents, operation, groupBy, userId);
            }

            // Extract values and perform the operation
            const values = documents.map(doc => parseFloat(doc.value));

            let operationResult;
            switch (operation) {
                case 'max':
                    operationResult = Math.max(...values);
                    break;
                case 'min':
                    operationResult = Math.min(...values);
                    break;
                case 'sum':
                    operationResult = values.reduce((sum, val) => sum + val, 0);
                    break;
                case 'avg':
                    operationResult = values.reduce((sum, val) => sum + val, 0) / values.length;
                    break;
                case 'count':
                    operationResult = values.length;
                    break;
            }

            return {
                result: operationResult,
                count: values.length
            };
        } catch (error) {
            logger.error('Error performing structured query', { error });
            throw error;
        }
    }

    /**
     * Perform grouped aggregation on query results
     * @param {Array} documents - Documents from query
     * @param {string} operation - Operation to perform
     * @param {string} groupBy - Field to group by
     * @param {number} userId - User ID for tenant isolation
     * @returns {Promise<Object>} - Grouped results
     * @private
     */
    async _performGroupedAggregation(documents, operation, groupBy, userId) {
        try {
            if (!userId) {
                throw new Error('userId is required for grouped aggregation to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);

            // Build GraphQL query for group by field using query builder
            const graphqlQuery = weaviateQuery.buildGroupByQuery({
                className: this.jsonClassName,
                tenantId,
                groupByField: groupBy
            });

            // Execute GraphQL query
            const result = await weaviateClient.graphqlQuery(graphqlQuery);
            const groupDocuments = result.data && result.data.Get && result.data.Get[this.jsonClassName]
                ? result.data.Get[this.jsonClassName]
                : [];

            // Create a map of document ID to group value
            const documentGroups = {};
            for (const doc of groupDocuments) {
                documentGroups[doc.documentId] = doc.value;
            }

            // Group values by the groupBy field
            const groups = {};
            for (const doc of documents) {
                const groupValue = documentGroups[doc.documentId];
                if (groupValue) {
                    if (!groups[groupValue]) {
                        groups[groupValue] = [];
                    }
                    groups[groupValue].push(parseFloat(doc.value));
                }
            }

            // Perform operation on each group
            const groupedResults = {};
            for (const [group, values] of Object.entries(groups)) {
                switch (operation) {
                    case 'max':
                        groupedResults[group] = Math.max(...values);
                        break;
                    case 'min':
                        groupedResults[group] = Math.min(...values);
                        break;
                    case 'sum':
                        groupedResults[group] = values.reduce((sum, val) => sum + val, 0);
                        break;
                    case 'avg':
                        groupedResults[group] = values.reduce((sum, val) => sum + val, 0) / values.length;
                        break;
                    case 'count':
                        groupedResults[group] = values.length;
                        break;
                    default:
                        groupedResults[group] = null;
                }
            }

            return {
                groupedResults,
                count: documents.length
            };
        } catch (error) {
            logger.error('Error performing grouped aggregation', { error });
            throw error;
        }
    }

    /**
     * Delete vectors for a document
     * @param {number} documentId - ID of the document
     * @param {number} userId - ID of the user who owns the document
     * @returns {Promise<void>}
     */
    async deleteDocumentVectors(documentId, userId) {
        try {
            const tenantId = this.#getTenantId(userId);

            // Build and execute delete mutation for Document class
            const documentDeleteQuery = weaviateQuery.buildDeleteMutation({
                className: this.documentClassName,
                tenantId,
                field: 'documentId',
                operator: 'Equal',
                value: documentId
            });

            await weaviateClient.graphqlQuery(documentDeleteQuery);

            // Build and execute delete mutation for JsonDocument class
            const jsonDocumentDeleteQuery = weaviateQuery.buildDeleteMutation({
                className: this.jsonClassName,
                tenantId,
                field: 'documentId',
                operator: 'Equal',
                value: documentId
            });

            await weaviateClient.graphqlQuery(jsonDocumentDeleteQuery);

            logger.info('Deleted vectors for document', { documentId, userId });
        } catch (error) {
            logger.error('Error deleting document vectors', { error, documentId, userId });
            throw error;
        }
    }

    /**
     * Delete vectors for a job
     * @param {number} jobId - ID of the job
     * @param {number} userId - ID of the user who owns the document
     * @returns {Promise<void>}
     */
    async deleteJobVectors(jobId, userId) {
        try {
            const tenantId = this.#getTenantId(userId);

            // Build and execute delete mutation for Document class
            const documentDeleteQuery = weaviateQuery.buildDeleteMutation({
                className: this.documentClassName,
                tenantId,
                field: 'jobId',
                operator: 'Equal',
                value: jobId
            });

            await weaviateClient.graphqlQuery(documentDeleteQuery);

            // Build and execute delete mutation for JsonDocument class
            const jsonDocumentDeleteQuery = weaviateQuery.buildDeleteMutation({
                className: this.jsonClassName,
                tenantId,
                field: 'jobId',
                operator: 'Equal',
                value: jobId
            });

            await weaviateClient.graphqlQuery(jsonDocumentDeleteQuery);

            logger.info('Deleted vectors for job', { jobId, userId });
        } catch (error) {
            logger.error('Error deleting job vectors', { error, jobId, userId });
            throw error;
        }
    }

    /**
     * Clear all data from Weaviate collections
     * @returns {Promise<boolean>}
     */
    async clearAllData() {
        try {
            logger.info('Clearing all data from Weaviate');

            // Delete all objects in the Document class
            await weaviateClient.schema
                .classDeleter()
                .withClassName(this.documentClassName)
                .do();

            // Delete all objects in the JsonDocument class
            await weaviateClient.schema
                .classDeleter()
                .withClassName(this.jsonClassName)
                .do();

            // Re-create the schema
            await this.initialize();

            logger.info('Successfully cleared all Weaviate data');
            return true;
        } catch (error) {
            logger.error('Error clearing Weaviate data', { error });
            throw error;
        }
    }

    /**
     * Get health status of Weaviate
     * @returns {Promise<boolean>} Whether Weaviate is available
     */
    async healthCheck() {
        try {
            await weaviateClient.misc.metaGetter().do();
            return true;
        } catch (error) {
            logger.error('Weaviate health check failed', { error: error.message });
            return false;
        }
    }
}

export default new VectorStoreService();
