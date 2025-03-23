import * as uuid from 'uuid';
import Logger from '../../utils/Logger.js';
import weaviateClient from '../../databases/weaviate/weaviate-client.js';
import weaviateSchema from './weaviate-schema.js';
import weaviateQuery from './weaviate-query.js';
import openaiService from '../openai.service.js';

const logger = new Logger();

/**
 * Service for Weaviate vector database operations
 */
class VectorStoreService {
    constructor() {
        this.documentClassName = 'Document';
        this.jsonClassName = 'JsonDocument';
        this.jsonFieldClassName = 'JsonField';
        this.initialized = false;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 10;

        // Start initialization process
        this.initialize();

        // Schedule periodic health checks and re-initialization if needed
        setInterval(() => this.ensureInitialized(), 60000); // Check every minute
    }

    /**
     * Initialize Weaviate schema with retry logic
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        this.initializationAttempts++;

        try {
            logger.info('Initializing Weaviate schema', { attempt: this.initializationAttempts });

            // Ensure Weaviate is available
            const isHealthy = await weaviateClient.healthCheck();
            if (!isHealthy) {
                logger.warn('Weaviate is not healthy, will retry initialization later');
                this.scheduleReinitialization();
                return;
            }

            // Initialize schema classes
            await this.initializeDocumentClass();
            await this.initializeJsonDocumentClass();
            await this.initializeJsonFieldClass();

            // Mark as successfully initialized
            this.initialized = true;
            this.initializationAttempts = 0;
            logger.info('Weaviate schema initialized successfully');
        } catch (error) {
            logger.error('Error initializing Weaviate schema', { error, attempt: this.initializationAttempts });
            this.scheduleReinitialization();
        }
    }

    /**
     * Schedule a re-initialization attempt with exponential backoff
     * @private
     */
    scheduleReinitialization() {
        if (this.initializationAttempts >= this.maxInitAttempts) {
            logger.error(`Failed to initialize Weaviate after ${this.maxInitAttempts} attempts, giving up`);
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.initializationAttempts), 60000);
        logger.info(`Scheduling Weaviate re-initialization in ${delay}ms`, { attempt: this.initializationAttempts });

        setTimeout(() => this.initialize(), delay);
    }

    /**
     * Ensure the service is initialized, retry if not
     */
    async ensureInitialized() {
        if (!this.initialized) {
            logger.info('Weaviate not initialized, retrying initialization');
            await this.initialize();
            return;
        }

        // Check if Weaviate is healthy
        const isHealthy = await weaviateClient.healthCheck();
        if (!isHealthy) {
            logger.warn('Weaviate connection lost, resetting initialization state');
            this.initialized = false;
            this.initializationAttempts = 0;
            await this.initialize();
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
     * Initialize JsonField class schema
     * @private
     */
    async initializeJsonFieldClass() {
        try {
            await weaviateSchema.initializeClass(this.jsonFieldClassName);
        } catch (error) {
            logger.error('Error initializing JSON field class', { error });
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

    /**
     * Get fields available in a JSON document
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID for tenant isolation
     * @returns {Promise<Array>} - List of fields with metadata
     */
    async getJsonDocumentFields(documentId, userId) {
        try {
            if (!userId) {
                throw new Error('userId is required for field discovery to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);

            // Build GraphQL query
            const query = `{
                Get {
                    ${this.jsonClassName}(
                        tenant: "${tenantId}",
                        where: {
                            path: ["documentId"],
                            operator: Equal,
                            valueInt: ${documentId}
                        },
                        limit: 1
                    ) {
                        documentId
                        rawJson
                    }
                }
            }`;

            // Execute GraphQL query
            const result = await weaviateClient.graphqlQuery(query);

            if (!result.data || !result.data.Get || !result.data.Get[this.jsonClassName] || result.data.Get[this.jsonClassName].length === 0) {
                return [];
            }

            // Get the raw JSON string
            const rawJson = result.data.Get[this.jsonClassName][0].rawJson;

            // Parse and analyze the structure
            const jsonData = JSON.parse(rawJson);
            return this.#analyzeJsonStructure(jsonData);
        } catch (error) {
            logger.error('Error getting JSON document fields', { error, documentId, userId });
            throw error;
        }
    }

    /**
     * Perform semantic search on JSON document
     * @param {string} query - Natural language query
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID for tenant isolation
     * @param {Object} filter - Optional filter conditions
     * @returns {Promise<Object>} - Search results
     */
    async semanticJsonSearch(query, documentId, userId, filter = null) {
        try {
            if (!userId) {
                throw new Error('userId is required for semantic search to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);

            // Build GraphQL query with nearText and optional filter
            let whereClause = {
                operator: 'And',
                operands: [
                    {
                        path: ['documentId'],
                        operator: 'Equal',
                        valueInt: documentId
                    }
                ]
            };

            // Add additional filters if provided
            if (filter) {
                Object.entries(filter).forEach(([key, value]) => {
                    whereClause.operands.push({
                        path: ['fields', key],
                        operator: 'Equal',
                        valueString: String(value)
                    });
                });
            }

            // Convert to proper string format
            const whereStr = JSON.stringify(whereClause)
                .replace(/"([^"]+)":/g, '$1:')  // Remove quotes around property names
                .replace(/"Equal"/g, 'Equal')   // Remove quotes around operators
                .replace(/"And"/g, 'And')
                .replace(/"Or"/g, 'Or');

            const graphqlQuery = `{
                Get {
                    ${this.jsonClassName}(
                        tenant: "${tenantId}",
                        nearText: {
                            concepts: ["${query.replace(/"/g, '\\"')}"],
                            certainty: 0.7
                        },
                        where: ${whereStr},
                        limit: 10
                    ) {
                        documentId
                        fields
                        _additional {
                            certainty
                        }
                    }
                }
            }`;

            // Execute GraphQL query
            const result = await weaviateClient.graphqlQuery(graphqlQuery);

            if (!result.data || !result.data.Get || !result.data.Get[this.jsonClassName]) {
                return { results: [], count: 0 };
            }

            // Process results
            const searchResults = result.data.Get[this.jsonClassName];

            return {
                results: searchResults.map(item => ({
                    ...item.fields,
                    _additional: {
                        certainty: item._additional.certainty
                    }
                })),
                count: searchResults.length
            };
        } catch (error) {
            logger.error('Error performing semantic JSON search', { error, documentId, userId, query });
            throw error;
        }
    }

    /**
     * Recursively analyze JSON structure
     * @param {Object|Array} data - JSON data to analyze
     * @param {string} prefix - Path prefix for nested properties
     * @returns {Array} - Fields with metadata
     * @private
     */
    #analyzeJsonStructure(data, prefix = '') {
        let fields = [];

        if (Array.isArray(data)) {
            // Handle array
            if (data.length > 0) {
                // Analyze first item as representative
                if (typeof data[0] === 'object' && data[0] !== null) {
                    fields = [...fields, ...this.#analyzeJsonStructure(data[0], `${prefix}[0]`)];
                } else {
                    fields.push({
                        path: prefix,
                        type: 'array',
                        subtype: typeof data[0],
                        example: data.slice(0, 3)
                    });
                }
            } else {
                fields.push({
                    path: prefix,
                    type: 'array',
                    subtype: 'unknown',
                    example: []
                });
            }
        } else if (typeof data === 'object' && data !== null) {
            // Handle object
            for (const key in data) {
                const path = prefix ? `${prefix}.${key}` : key;
                const value = data[key];

                if (value === null) {
                    fields.push({
                        path,
                        type: 'null',
                        example: null
                    });
                } else if (Array.isArray(value)) {
                    // For arrays, analyze the structure
                    if (value.length > 0) {
                        fields.push({
                            path,
                            type: 'array',
                            subtype: typeof value[0],
                            arrayLength: value.length,
                            example: value.slice(0, 3)
                        });

                        // If array contains objects, analyze first item
                        if (typeof value[0] === 'object' && value[0] !== null) {
                            fields = [...fields, ...this.#analyzeJsonStructure(value[0], `${path}[0]`)];
                        }
                    } else {
                        fields.push({
                            path,
                            type: 'array',
                            subtype: 'unknown',
                            arrayLength: 0,
                            example: []
                        });
                    }
                } else if (typeof value === 'object') {
                    fields.push({
                        path,
                        type: 'object',
                        example: value
                    });
                    fields = [...fields, ...this.#analyzeJsonStructure(value, path)];
                } else {
                    fields.push({
                        path,
                        type: typeof value,
                        example: value
                    });
                }
            }
        } else {
            // Handle primitive
            fields.push({
                path: prefix,
                type: typeof data,
                example: data
            });
        }

        return fields;
    }

    /**
     * Store a JSON document with enhanced structure
     * @param {Object} jsonData - The JSON document
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID
     * @param {number} jobId - Job ID
     * @returns {Promise<Object>} - Storage result
     */
    async storeJsonDocument(jsonData, documentId, userId, jobId) {
        try {
            if (!userId) {
                throw new Error('userId is required to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);
            const operationId = uuid.v4();

            logger.info('Storing JSON document', {
                operationId,
                documentId,
                userId,
                jsonType: Array.isArray(jsonData) ? 'array' : 'object'
            });

            // 1. Ensure tenants exist for both classes
            await this.#ensureTenantExists(this.jsonClassName, tenantId);
            await this.#ensureTenantExists(this.jsonFieldClassName, tenantId);

            // 2. Store the complete JSON document
            const completeDocumentId = uuid.v4();
            await weaviateClient.graphqlQuery(`
                mutation {
                    Create {
                        ${this.jsonClassName}(
                            id: "${completeDocumentId}"
                            tenant: "${tenantId}"
                            properties: {
                                documentId: ${documentId}
                                userId: ${userId}
                                rawJson: ${JSON.stringify(JSON.stringify(jsonData))}
                                schemaVersion: 1
                            }
                        ) {
                            documentId
                        }
                    }
                }
            `);

            // 3. Flatten and prepare individual fields for vectorization
            const flattened = this.#flattenJson(jsonData);

            // 4. Store each field with its own vector
            const batchSize = 100;
            const totalBatches = Math.ceil(flattened.length / batchSize);

            for (let i = 0; i < flattened.length; i += batchSize) {
                const batch = flattened.slice(i, i + batchSize);
                const batchObjects = [];

                for (const item of batch) {
                    // Prepare the text that will be embedded
                    const textForEmbedding = `${item.path}: ${item.value}`;

                    // Determine if numeric for aggregation
                    const isNumeric = this.#isNumeric(item.value);
                    const numericValue = isNumeric ? parseFloat(item.value) : null;

                    batchObjects.push({
                        class: this.jsonFieldClassName,
                        tenant: tenantId,
                        properties: {
                            documentId,
                            userId,
                            path: item.path,
                            value: String(item.value),
                            valueType: typeof item.value,
                            isNumeric,
                            numericValue
                        }
                    });
                }

                if (batchObjects.length > 0) {
                    await weaviateClient.batchObjects(batchObjects);
                    logger.info(`Stored batch ${Math.floor(i / batchSize) + 1}/${totalBatches} of JSON fields`, {
                        operationId,
                        documentId,
                        batchSize: batchObjects.length
                    });
                }
            }

            return {
                success: true,
                documentId,
                fieldsCount: flattened.length
            };
        } catch (error) {
            logger.error('Error storing JSON document', { error, documentId, userId });
            throw error;
        }
    }

    /**
     * Check if a value can be parsed as a number
     * @param {any} value - Value to check
     * @returns {boolean} - Whether the value is numeric
     * @private
     */
    #isNumeric(value) {
        if (typeof value === 'number') return true;
        if (typeof value !== 'string') return false;
        return !isNaN(parseFloat(value)) && isFinite(value);
    }

    /**
     * Flatten a JSON object into path-value pairs
     * @param {Object|Array} data - Data to flatten
     * @param {string} prefix - Path prefix
     * @returns {Array<Object>} - Flattened data
     * @private
     */
    #flattenJson(data, prefix = '') {
        const result = [];

        if (Array.isArray(data)) {
            // Handle arrays
            for (let i = 0; i < data.length; i++) {
                const newPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
                const item = data[i];

                if (typeof item === 'object' && item !== null) {
                    // Recursively flatten objects within arrays
                    result.push(...this.#flattenJson(item, newPrefix));
                } else {
                    // Add array item as a field
                    result.push({
                        path: newPrefix,
                        value: item
                    });
                }
            }
        } else if (typeof data === 'object' && data !== null) {
            // Handle objects
            for (const key in data) {
                const value = data[key];
                const newPrefix = prefix ? `${prefix}.${key}` : key;

                if (value === null) {
                    result.push({
                        path: newPrefix,
                        value: null
                    });
                } else if (typeof value === 'object') {
                    // Recursively flatten nested objects
                    result.push(...this.#flattenJson(value, newPrefix));
                } else {
                    // Add simple value
                    result.push({
                        path: newPrefix,
                        value: value
                    });
                }
            }
        } else {
            // Handle primitive value
            result.push({
                path: prefix,
                value: data
            });
        }

        return result;
    }

    /**
     * Enhanced JSON query - handles both structured and natural language queries
     * @param {Object} params - Query parameters
     * @param {string|Object} params.query - Natural language query or structured query object
     * @param {number} params.documentId - Document ID
     * @param {number} params.userId - User ID
     * @returns {Promise<Object>} - Query results
     */
    async unifiedJsonQuery(params) {
        const { query, documentId, userId } = params;

        try {
            if (!userId) {
                throw new Error('userId is required for unified JSON query to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);

            // Determine if this is a structured or natural language query
            const isStructured = typeof query === 'object';

            if (isStructured) {
                // Handle structured query
                return await this.enhancedStructuredQuery(query, userId, documentId);
            } else {
                // It's a natural language query - delegate to specialized handler
                return await this.naturalLanguageJsonQuery(query, documentId, userId);
            }
        } catch (error) {
            logger.error('Error executing unified JSON query', { error, documentId, userId });
            throw error;
        }
    }

    /**
     * Enhanced structured query on JSON documents
     * @param {Object} query - Query parameters
     * @param {number} userId - User ID
     * @param {number} documentId - Document ID
     * @returns {Promise<Object>} - Query results
     */
    async enhancedStructuredQuery(query, userId, documentId) {
        try {
            if (!userId) {
                throw new Error('userId is required for structured query to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);
            const { operation, field, filter, groupBy, limit = 100 } = query;

            // Basic validation
            if (!operation || !field) {
                throw new Error('Operation and field are required for structured query');
            }

            // For simple aggregations like max, min, avg - use optimized query
            if (['max', 'min', 'avg', 'sum', 'count'].includes(operation)) {
                // Use the aggregate API for efficiency
                const graphqlQuery = weaviateQuery.buildEnhancedJsonAggregationQuery({
                    className: this.jsonFieldClassName,
                    tenantId,
                    operation,
                    field,
                    documentId,
                    filter
                });

                const result = await weaviateClient.graphqlQuery(graphqlQuery);

                // Process aggregation result
                if (result?.data?.Aggregate?.[this.jsonFieldClassName]) {
                    const aggregateData = result.data.Aggregate[this.jsonFieldClassName];
                    const count = aggregateData.meta?.count || 0;

                    // Extract the aggregation value
                    let aggregateValue = null;
                    if (aggregateData[operation]?.numericValue) {
                        if (operation === 'count') {
                            aggregateValue = count;
                        } else {
                            aggregateValue = aggregateData[operation].numericValue;
                        }
                    }

                    // Build natural language response
                    const filterDesc = filter ? ` with filter on ${Object.keys(filter).join(', ')}` : '';
                    const naturalLanguageResponse = count === 0
                        ? `No results found for the ${operation} of ${field}${filterDesc}`
                        : `The ${operation} of ${field}${filterDesc} is ${aggregateValue} (based on ${count} values)`;

                    return {
                        result: aggregateValue,
                        count,
                        query: { operation, field, filter, documentId },
                        naturalLanguageResponse
                    };
                }

                return { result: null, count: 0 };
            }

            // For more complex operations, retrieve the complete document and process
            const completeDocQuery = weaviateQuery.buildCompleteJsonDocumentQuery({
                className: this.jsonClassName,
                tenantId,
                documentId
            });

            const completeDocResult = await weaviateClient.graphqlQuery(completeDocQuery);

            if (!completeDocResult?.data?.Get?.[this.jsonClassName]?.[0]?.rawJson) {
                return {
                    result: null,
                    count: 0,
                    error: 'Document not found or has no content'
                };
            }

            // Parse the raw JSON
            const jsonDocument = JSON.parse(completeDocResult.data.Get[this.jsonClassName][0].rawJson);

            // Process the JSON document based on operation
            const result = this.#processJsonOperation(jsonDocument, operation, field, filter, groupBy);

            return result;
        } catch (error) {
            logger.error('Error performing enhanced structured query', { error, userId, documentId });
            throw error;
        }
    }

    /**
     * Process a JSON operation in memory
     * @param {Object} jsonDocument - The JSON document to process
     * @param {string} operation - Operation to perform
     * @param {string} field - Field to operate on
     * @param {Object} filter - Filter conditions
     * @param {string} groupBy - Field to group by
     * @returns {Object} - Operation result
     * @private
     */
    #processJsonOperation(jsonDocument, operation, field, filter, groupBy) {
        // Flatten the document for easier processing
        const flattened = this.#flattenJson(jsonDocument);

        // Apply filters if provided
        let filteredData = flattened;
        if (filter && Object.keys(filter).length > 0) {
            filteredData = flattened.filter(item => {
                for (const [filterKey, filterValue] of Object.entries(filter)) {
                    // Check if any item with the filter key has the filter value
                    const matchingFields = flattened.filter(
                        field => field.path === filterKey && field.value == filterValue
                    );

                    if (matchingFields.length === 0) {
                        return false;
                    }
                }
                return true;
            });
        }

        // Get the fields that match the requested field path
        const targetFields = filteredData.filter(item => item.path === field);

        // Extract numeric values for aggregation
        const numericValues = targetFields
            .filter(item => this.#isNumeric(item.value))
            .map(item => parseFloat(item.value));

        // If there are no values to aggregate
        if (numericValues.length === 0) {
            return {
                result: null,
                count: 0,
                query: { operation, field, filter, groupBy }
            };
        }

        // Handle grouped operation
        if (groupBy) {
            // Create groups
            const groups = {};
            const groupFields = flattened.filter(item => item.path === groupBy);

            // Group values by the groupBy field
            for (const group of groupFields) {
                const groupValue = String(group.value);
                groups[groupValue] = numericValues;
            }

            // Perform operation on each group
            const groupResults = {};
            for (const [group, values] of Object.entries(groups)) {
                switch (operation) {
                    case 'max': groupResults[group] = Math.max(...values); break;
                    case 'min': groupResults[group] = Math.min(...values); break;
                    case 'avg': groupResults[group] = values.reduce((a, b) => a + b, 0) / values.length; break;
                    case 'sum': groupResults[group] = values.reduce((a, b) => a + b, 0); break;
                    case 'count': groupResults[group] = values.length; break;
                    default: groupResults[group] = null;
                }
            }

            // Build natural language response
            let naturalLanguageResponse = `${operation.toUpperCase()} of ${field} grouped by ${groupBy}:\n`;
            Object.entries(groupResults).forEach(([group, value]) => {
                naturalLanguageResponse += `- ${group}: ${value}\n`;
            });

            return {
                groupedResults: groupResults,
                count: numericValues.length,
                query: { operation, field, filter, groupBy },
                naturalLanguageResponse
            };
        }

        // Handle non-grouped operation
        let result;
        switch (operation) {
            case 'max': result = Math.max(...numericValues); break;
            case 'min': result = Math.min(...numericValues); break;
            case 'avg': result = numericValues.reduce((a, b) => a + b, 0) / numericValues.length; break;
            case 'sum': result = numericValues.reduce((a, b) => a + b, 0); break;
            case 'count': result = numericValues.length; break;
            default: result = null;
        }

        // Build natural language response
        const filterDesc = filter ? ` with filter on ${Object.keys(filter).join(', ')}` : '';
        const naturalLanguageResponse =
            `The ${operation} of ${field}${filterDesc} is ${result} (based on ${numericValues.length} values)`;

        return {
            result,
            count: numericValues.length,
            query: { operation, field, filter, groupBy },
            naturalLanguageResponse
        };
    }

    /**
     * Process natural language query on JSON documents
     * @param {string} query - Natural language query
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Query results
     */
    async naturalLanguageJsonQuery(query, documentId, userId) {
        try {
            if (!userId) {
                throw new Error('userId is required for natural language query to ensure multi-tenancy');
            }

            const tenantId = this.#getTenantId(userId);

            // Get document fields to provide context for query intent analysis
            const documentFields = await this.getJsonDocumentFields(documentId, userId);

            // Analyze query intent using LLM
            const queryIntent = await this.#analyzeQueryIntent(query, documentFields);
            logger.info('Analyzed query intent', {
                query,
                documentId,
                intentType: queryIntent.type,
                operation: queryIntent.operation
            });

            // If it's an aggregation query, use structured query handling
            if (queryIntent.type === 'aggregation' && queryIntent.operation && queryIntent.field) {
                const structuredQueryParams = {
                    operation: queryIntent.operation,
                    field: queryIntent.field,
                    filter: queryIntent.filter || {},
                    groupBy: queryIntent.groupBy
                };

                return await this.enhancedStructuredQuery(structuredQueryParams, userId, documentId);
            }

            // Otherwise, perform semantic search
            const graphqlQuery = weaviateQuery.buildSemanticJsonSearchQuery({
                className: this.jsonFieldClassName,
                tenantId,
                query,
                documentId,
                filter: queryIntent.filter,
                limit: 10
            });

            const result = await weaviateClient.graphqlQuery(graphqlQuery);

            if (!result?.data?.Get?.[this.jsonFieldClassName]) {
                return { results: [], count: 0 };
            }

            // Process the search results
            const searchResults = result.data.Get[this.jsonFieldClassName];

            // Format the results for readable output
            const formattedResults = searchResults.map(item => ({
                path: item.path,
                value: item.value,
                valueType: item.valueType,
                certainty: item._additional?.certainty
            }));

            // Build natural language response
            let naturalLanguageResponse;
            if (formattedResults.length === 0) {
                naturalLanguageResponse = `No results found for: "${query}"`;
            } else {
                naturalLanguageResponse = `I found ${formattedResults.length} results for: "${query}"\n\n`;

                // Format the top results
                formattedResults.slice(0, 5).forEach((item, i) => {
                    naturalLanguageResponse += `${i + 1}. ${item.path}: ${item.value}\n`;
                });

                if (formattedResults.length > 5) {
                    naturalLanguageResponse += `\n...and ${formattedResults.length - 5} more results.`;
                }
            }

            return {
                results: formattedResults,
                count: formattedResults.length,
                query: {
                    original: query,
                    intent: queryIntent
                },
                naturalLanguageResponse
            };
        } catch (error) {
            logger.error('Error processing natural language JSON query', { error, documentId, userId, query });
            throw error;
        }
    }

    /**
     * Analyze natural language query intent using LLM
     * @param {string} query - Natural language query
     * @param {Array} documentFields - Document fields for context
     * @returns {Promise<Object>} - Query intent
     * @private
     */
    async #analyzeQueryIntent(query, documentFields) {
        try {
            // Use OpenAI service to analyze the query intent
            return await openaiService.analyzeJsonQueryIntent(query, documentFields);
        } catch (error) {
            logger.error('Error analyzing query intent', { error, query });
            // Default to simple search if analysis fails
            return { type: 'search', filter: null };
        }
    }
}

export default new VectorStoreService();
