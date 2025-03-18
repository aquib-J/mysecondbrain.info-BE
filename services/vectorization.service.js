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
     * Process a JSON file and store vectors
     * @param {Object} jsonData - Parsed JSON data
     * @param {number} jobId - Job ID
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Processing result
     */
    async processJsonData(jsonData, jobId, documentId, userId) {
        const operationId = uuid.v4();
        const vectors = [];

        try {
            logger.info('Starting JSON vectorization', {
                operationId,
                jobId,
                documentId,
                userId,
                jsonType: Array.isArray(jsonData) ? 'array' : 'object',
                timestamp: new Date().toISOString()
            });

            // 1. Process JSON data into chunks using jsonParserService
            const chunks = jsonParserService.processJsonData(jsonData, operationId);

            // Add user ID and document ID to each chunk's metadata
            const enrichedChunks = chunks.map(chunk => ({
                text: chunk.text,
                metadata: {
                    ...chunk.metadata,
                    documentId,
                    documentUserId: userId,
                    userId
                }
            }));

            // 2. Create embeddings for chunks
            logger.info('Creating embeddings for JSON chunks', {
                operationId,
                jobId,
                chunksCount: enrichedChunks.length
            });

            const texts = enrichedChunks.map(chunk => chunk.text);
            const embeddings = await openaiService.createEmbeddings(texts);

            // 3. Create vector records
            logger.info('Creating vector records for JSON', {
                operationId,
                jobId,
                embeddingsCount: embeddings.length
            });

            for (let i = 0; i < enrichedChunks.length; i++) {
                const chunk = enrichedChunks[i];
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

            // 4. Store vectors in Weaviate
            logger.info('Storing JSON vectors in Weaviate', {
                operationId,
                jobId,
                vectorsCount: vectors.length
            });

            await weaviateService.storeVectors(vectors);

            logger.info('JSON vectorization completed', {
                operationId,
                jobId,
                vectorsCount: vectors.length,
                timestamp: new Date().toISOString()
            });

            return {
                vector_count: vectors.length,
                weaviate_id: documentId.toString()
            };
        } catch (error) {
            logger.error('Error vectorizing JSON data', {
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
}

export default new VectorizationService(); 