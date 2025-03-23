import Logger from '../utils/Logger.js';
import openaiService from './openai.service.js';
import weaviateService from './weaviate/weaviate.service.js';
import documentProcessorService from './document.processor.service.js';
import jsonParserService from './document-parsers/json.parser.service.js';
import { Vector } from '../databases/mysql8/db-schemas.js';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import * as uuid from 'uuid';
import { flatten } from 'flat';
import path from 'path';
import fs from 'fs';
import weaviateClient from '../databases/weaviate/weaviate-client.js';

const logger = new Logger();

/**
 * Service for document vectorization, connecting document processing with embedding creation and vector storage
 */
class VectorizationService {
    constructor() {
        this.docStore = path.join(process.cwd(), 'doc-store');
        // Ensure doc-store directory exists
        if (!fs.existsSync(this.docStore)) {
            fs.mkdirSync(this.docStore, { recursive: true });
        }

        logger.info('VectorizationService initialized');
    }

    /**
     * Create a UUID Buffer
     * @private
     * @returns {Buffer} - UUID as Buffer
     */
    #createUuidBuffer() {
        if (crypto.randomUUID) {
            return Buffer.from(crypto.randomUUID().replace(/-/g, ''), 'hex');
        }
        return Buffer.from(uuid.v4().replace(/-/g, ''), 'hex');
    }

    /**
     * Process a document file and store vectors
     * @param {string} filePath - Path to the document file
     * @param {string} fileType - Type of the file (e.g., 'pdf', 'txt')
     * @param {number} jobId - Job ID
     * @param {Object} metadata - Additional metadata
     * @param {number} metadata.documentId - Document ID
     * @param {number} metadata.documentUserId - Document user ID
     * @returns {Promise<Object>} - Processing result
     */
    async processDocumentFile(filePath, fileType, jobId, metadata) {
        const operationId = uuid.v4();
        try {
            logger.info('Starting document vectorization', {
                operationId,
                filePath,
                fileType,
                jobId,
                documentId: metadata.documentId,
                userId: metadata.documentUserId,
                timestamp: new Date().toISOString()
            });

            // 1. Process document to get text chunks
            let chunks = await documentProcessorService.processDocument(filePath, fileType);

            // Add metadata to chunks
            chunks = chunks.map((chunk, index) => ({
                text: chunk.text,
                metadata: {
                    ...chunk.metadata,
                    ...metadata,
                    chunkIndex: index
                }
            }));

            // 2. Create fallback chunk if no text was extracted
            if (!chunks || chunks.length === 0) {
                logger.warn('No text chunks extracted, creating fallback chunk', {
                    operationId,
                    jobId,
                    documentId: metadata.documentId
                });

                chunks = [{
                    text: `This document could not be processed for text content. It may be an image-based document, encrypted, or in a format that's not fully supported.`,
                    metadata: {
                        ...metadata,
                        page: 1,
                        is_fallback: true,
                        chunkIndex: 0
                    }
                }];
            }

            // 3. Create embeddings
            logger.info('Creating embeddings for chunks', {
                operationId,
                jobId,
                chunksCount: chunks.length
            });

            const vectors = [];
            const texts = chunks.map(chunk => chunk.text);
            const embeddings = await openaiService.createEmbeddings(texts);

            // 4. Create vector records
            logger.info('Creating vector records', {
                operationId,
                jobId,
                embeddingsCount: embeddings.length
            });

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = embeddings[i];
                const vectorId = this.#createUuidBuffer();

                const vector = await Vector.create({
                    job_id: jobId,
                    vector_id: vectorId,
                    embedding_id: 1, // Assuming OpenAI is provider ID 1
                    text_content: chunk.text,
                    metadata: JSON.stringify(chunk.metadata),
                    embedding: JSON.stringify(embedding),
                    status: 'success',
                    is_active: 1
                });

                vectors.push(vector);
            }

            // 5. Store vectors in Weaviate
            logger.info('Storing vectors in Weaviate', {
                operationId,
                jobId,
                vectorsCount: vectors.length
            });

            await weaviateService.storeVectors(vectors);

            // 6. Clean up temporary output files
            await documentProcessorService.cleanup(filePath);

            logger.info('Document vectorization completed', {
                operationId,
                jobId,
                vectorsCount: vectors.length,
                timestamp: new Date().toISOString()
            });

            return {
                vector_count: vectors.length,
                weaviate_id: metadata.documentId.toString()
            };
        } catch (error) {
            logger.error('Error vectorizing document', {
                operationId,
                jobId,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Process JSON data for vectorization
     * @param {Object} jsonData - JSON data to process
     * @param {number} jobId - Job ID
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Processing result
     */
    async processJsonData(jsonData, jobId, documentId, userId) {
        const operationId = uuid.v4();
        logger.info('Processing JSON data for vectorization', {
            operationId,
            jobId,
            documentId,
            userId
        });

        try {
            // Store the complete JSON document in Weaviate
            const result = await weaviateService.storeJsonDocument(
                jsonData,
                documentId,
                userId,
                jobId
            );

            logger.info('JSON document stored in Weaviate', {
                operationId,
                jobId,
                documentId,
                fieldsCount: result.fieldsCount
            });

            // Create vectors for the flattened fields
            const vectors = await this._createVectorsForJsonFields(
                documentId,
                jobId,
                userId,
                jsonData
            );

            // Store vectors in MySQL and Weaviate with consistent IDs
            await this._storeVectors(vectors);

            return {
                success: true,
                vectorsCount: vectors.length,
                fieldsCount: result.fieldsCount
            };
        } catch (error) {
            logger.error('Error processing JSON data', {
                operationId,
                error: error.message,
                jobId,
                documentId
            });
            throw error;
        }
    }

    /**
     * Create vectors for JSON fields
     * @param {number} documentId - Document ID
     * @param {number} jobId - Job ID
     * @param {number} userId - User ID
     * @param {Object} jsonData - Parsed JSON data
     * @returns {Promise<Array>} - Array of vector objects
     * @private
     */
    async _createVectorsForJsonFields(documentId, jobId, userId, jsonData) {
        const operationId = uuid.v4();
        logger.info('Creating vectors for JSON fields', {
            operationId,
            documentId,
            jobId
        });

        try {
            // Flatten the JSON structure
            const flattened = this._flattenJson(jsonData);

            // Create embeddings for each field
            const vectors = [];
            const batchSize = 20; // Process in batches to avoid rate limits

            for (let i = 0; i < flattened.length; i += batchSize) {
                const batch = flattened.slice(i, i + batchSize);
                const batchTexts = batch.map(item => `${item.path}: ${item.value}`);

                // Create embeddings for the batch
                const embeddings = await openaiService.createEmbeddings(batchTexts);

                // Create vector objects
                for (let j = 0; j < batch.length; j++) {
                    const field = batch[j];
                    const embedding = embeddings[j];

                    // Generate a consistent UUID for both Weaviate and MySQL
                    const rawUuid = uuid.v4();
                    const vectorId = Buffer.from(rawUuid.replace(/-/g, ''), 'hex');

                    // Check if the value is numeric for aggregation
                    const isNumeric = this._isNumeric(field.value);
                    const numericValue = isNumeric ? parseFloat(field.value) : null;

                    // Create a vector object compatible with MySQL Vector schema
                    vectors.push({
                        job_id: jobId,                        // Required by MySQL schema
                        vector_id: vectorId,                  // Required by MySQL schema
                        embedding_id: 1,                      // Required by MySQL schema (OpenAI)
                        text_content: `${field.path}: ${field.value}`, // Required by MySQL schema
                        embedding: JSON.stringify(embedding), // Required by MySQL schema
                        metadata: JSON.stringify({           // Required by MySQL schema
                            documentId,
                            userId,
                            path: field.path,
                            value: String(field.value),     // Ensure value is a string
                            valueType: typeof field.value,
                            isNumeric,
                            numericValue,
                            vectorUuid: rawUuid,            // For Weaviate reference
                            format: 'json',                 // For type identification
                            schemaVersion: 1
                        }),
                        status: 'success',                   // Required by MySQL schema
                        is_active: true                      // Required by MySQL schema
                    });
                }

                logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}`, {
                    operationId,
                    batchSize: batch.length,
                    totalProcessed: i + batch.length,
                    totalFields: flattened.length
                });
            }

            logger.info('Completed creating vectors', {
                operationId,
                vectorsCount: vectors.length,
                documentId,
                jobId
            });

            return vectors;
        } catch (error) {
            logger.error('Error creating vectors for JSON fields', {
                operationId,
                error: error.message,
                documentId,
                jobId
            });
            throw error;
        }
    }

    /**
     * Store vectors in MySQL database and ensure they're also in Weaviate
     * @param {Array<Object>} vectors - Array of vector objects to store
     * @returns {Promise<Array>} - Array of created vector records
     * @private
     */
    async _storeVectors(vectors) {
        const operationId = uuid.v4();
        logger.info('Storing vectors in MySQL and Weaviate', {
            operationId,
            vectorsCount: vectors.length
        });

        try {
            // 1. Store in MySQL - the vectors are already correctly formatted
            const createdVectors = await Vector.bulkCreate(vectors);

            // 2. Format vectors for Weaviate storage
            // Group vectors by tenant/user ID
            const vectorsByUserId = {};

            for (const vector of vectors) {
                const metadata = JSON.parse(vector.metadata);
                const userId = metadata.userId;

                if (!vectorsByUserId[userId]) {
                    vectorsByUserId[userId] = [];
                }

                vectorsByUserId[userId].push({
                    vector,
                    metadata
                });
            }

            // 3. Store in Weaviate - process each user's vectors separately
            for (const [userId, userVectors] of Object.entries(vectorsByUserId)) {
                // Tenant ID format must match what weaviateService uses internally
                const tenantId = `user_${userId}`;

                // Process in batches
                const batchSize = 50;
                for (let i = 0; i < userVectors.length; i += batchSize) {
                    const batch = userVectors.slice(i, i + batchSize);
                    const batchObjects = [];

                    for (const { vector, metadata } of batch) {
                        // Format object for Weaviate
                        batchObjects.push({
                            class: 'JsonField',
                            id: metadata.vectorUuid,
                            tenant: tenantId,
                            properties: {
                                documentId: metadata.documentId,
                                userId: parseInt(userId),
                                path: metadata.path,
                                value: metadata.value,
                                valueType: metadata.valueType,
                                isNumeric: metadata.isNumeric,
                                numericValue: metadata.numericValue || null
                            },
                            vector: JSON.parse(vector.embedding)
                        });
                    }

                    if (batchObjects.length > 0) {
                        // Use the Weaviate client's batch API directly - this ensures proper tenancy
                        await weaviateClient.batch.objectsBatcher()
                            .withObjects(...batchObjects)
                            .do();

                        logger.info(`Stored batch for tenant ${tenantId}`, {
                            operationId,
                            batchSize: batchObjects.length,
                            totalProcessed: i + batch.length,
                            totalForUser: userVectors.length
                        });
                    }
                }
            }

            logger.info('Vectors stored successfully in MySQL and Weaviate', {
                operationId,
                storedCount: createdVectors.length,
                userCount: Object.keys(vectorsByUserId).length
            });

            return createdVectors;
        } catch (error) {
            logger.error('Error storing vectors', {
                operationId,
                error: error.message,
                vectorsCount: vectors.length
            });
            throw error;
        }
    }

    /**
     * Flatten a JSON object into path-value pairs
     * @param {Object|Array} data - Data to flatten
     * @param {string} prefix - Path prefix
     * @returns {Array<Object>} - Flattened data
     * @private
     */
    _flattenJson(data, prefix = '') {
        const result = [];

        if (Array.isArray(data)) {
            // Handle arrays
            for (let i = 0; i < data.length; i++) {
                const newPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
                const item = data[i];

                if (typeof item === 'object' && item !== null) {
                    // Recursively flatten objects within arrays
                    result.push(...this._flattenJson(item, newPrefix));
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
                    result.push(...this._flattenJson(value, newPrefix));
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
     * Check if a value can be parsed as a number
     * @param {any} value - Value to check
     * @returns {boolean} - Whether the value is numeric
     * @private
     */
    _isNumeric(value) {
        if (typeof value === 'number') return true;
        if (typeof value !== 'string') return false;
        return !isNaN(parseFloat(value)) && isFinite(value);
    }

    /**
     * Create a single vector from text
     * @param {string} text - Text to vectorize
     * @param {number} jobId - Job ID
     * @param {Object} metadata - Metadata for the vector
     * @returns {Promise<Object>} - Created vector
     */
    async vectorizeText(text, jobId, metadata) {
        try {
            // Create embedding
            const embedding = await openaiService.createSingleEmbedding(text);

            // Create vector record
            const vectorId = this.#createUuidBuffer();
            const vector = await Vector.create({
                job_id: jobId,
                vector_id: vectorId,
                embedding_id: 1, // Assuming OpenAI is provider ID 1
                text_content: text,
                metadata: JSON.stringify(metadata),
                embedding: JSON.stringify(embedding),
                status: 'success',
                is_active: 1
            });

            // Store in Weaviate
            await weaviateService.storeVectors([vector]);

            return vector;
        } catch (error) {
            logger.error('Error vectorizing text', {
                jobId,
                error: error.message,
                textLength: text.length
            });
            throw error;
        }
    }

    /**
     * Create a vector for a search query
     * @param {string} query - Query text
     * @returns {Promise<Array<number>>} - Query embedding
     */
    async createQueryVector(query) {
        return await openaiService.createSingleEmbedding(query);
    }

    /**
     * Search for similar vectors in Weaviate
     * @param {string} query - Query text
     * @param {Object} options - Search options
     * @returns {Promise<Array>} - Search results
     */
    async semanticSearch(query, options) {
        try {
            const queryVector = await this.createQueryVector(query);
            return await weaviateService.similaritySearch(queryVector, options);
        } catch (error) {
            logger.error('Error performing semantic search', {
                error: error.message,
                query
            });
            throw error;
        }
    }

    /**
     * Search using a pre-computed embedding vector
     * @param {Array} embedding - Pre-computed embedding vector
     * @param {Object} options - Search options
     * @returns {Promise<Array>} - Search results
     */
    async semanticSearchWithEmbedding(embedding, options) {
        try {
            logger.info('Performing semantic search with provided embedding', {
                className: options.className
            });
            return await weaviateService.similaritySearch(embedding, options);
        } catch (error) {
            logger.error('Error performing semantic search with embedding', {
                error: error.message,
                className: options.className
            });
            throw error;
        }
    }
}

export default new VectorizationService(); 