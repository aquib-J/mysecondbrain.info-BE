import weaviate from 'weaviate-ts-client';
import Logger from '../utils/Logger.js';
import { flatten } from 'flat';
import { Vector } from '../databases/mysql8/db-schemas.js';
import { WEAVIATE_SCHEME, WEAVIATE_HOST } from '../config/env.js';
import crypto from 'crypto';
import { Buffer } from 'buffer';

const logger = new Logger();

class VectorStoreService {
    constructor() {
        this.client = weaviate.client({
            scheme: WEAVIATE_SCHEME || 'http',
            host: WEAVIATE_HOST || 'localhost:8080',
        });
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
            // Check if class exists
            const classExists = await this.client.schema
                .classGetter()
                .withClassName(this.documentClassName)
                .do()
                .catch(() => null);

            if (!classExists) {
                // Create class if it doesn't exist
                await this.client.schema
                    .classCreator()
                    .withClass({
                        class: this.documentClassName,
                        vectorizer: 'none', // We'll provide our own vectors
                        properties: [
                            {
                                name: 'text',
                                dataType: ['text'],
                                description: 'The text content of the document chunk',
                            },
                            {
                                name: 'metadata',
                                dataType: ['text'], // Store metadata as JSON string
                                description: 'Metadata about the document chunk',
                            },
                            {
                                name: 'jobId',
                                dataType: ['int'],
                                description: 'ID of the job that processed this document',
                            },
                            {
                                name: 'documentId',
                                dataType: ['int'],
                                description: 'ID of the document this chunk belongs to',
                            },
                            {
                                name: 'vectorId',
                                dataType: ['text'],
                                description: 'ID of the vector in the database',
                            },
                            {
                                name: 'pageNumber',
                                dataType: ['int'],
                                description: 'Page number in the original document',
                            },
                            {
                                name: 'chunkIndex',
                                dataType: ['int'],
                                description: 'Index of this chunk within the document',
                            }
                        ],
                    })
                    .do();

                logger.info('Document class created in Weaviate');
            }
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
            // Check if class exists
            const classExists = await this.client.schema
                .classGetter()
                .withClassName(this.jsonClassName)
                .do()
                .catch(() => null);

            if (!classExists) {
                // Create class if it doesn't exist
                await this.client.schema
                    .classCreator()
                    .withClass({
                        class: this.jsonClassName,
                        vectorizer: 'none', // We'll provide our own vectors
                        properties: [
                            {
                                name: 'text',
                                dataType: ['text'],
                                description: 'The flattened text representation of the JSON',
                            },
                            {
                                name: 'metadata',
                                dataType: ['text'], // Store metadata as JSON string
                                description: 'Metadata about the JSON document',
                            },
                            {
                                name: 'jobId',
                                dataType: ['int'],
                                description: 'ID of the job that processed this document',
                            },
                            {
                                name: 'documentId',
                                dataType: ['int'],
                                description: 'ID of the document this chunk belongs to',
                            },
                            {
                                name: 'vectorId',
                                dataType: ['text'],
                                description: 'ID of the vector in the database',
                            },
                            {
                                name: 'path',
                                dataType: ['text'],
                                description: 'Path to the field in the JSON document',
                            },
                            {
                                name: 'value',
                                dataType: ['text'],
                                description: 'Value of the field',
                            },
                            {
                                name: 'valueType',
                                dataType: ['text'],
                                description: 'Type of the value (string, number, boolean, etc.)',
                            }
                        ],
                    })
                    .do();

                logger.info('JsonDocument class created in Weaviate');
            }
        } catch (error) {
            logger.error('Error initializing JsonDocument class schema', { error });
            throw error;
        }
    }

    /**
     * Store vectors in Weaviate
     * @param {Array} vectors - Array of vector objects from the database
     * @returns {Promise<void>}
     */
    async storeVectors(vectors) {
        try {
            const batcher = this.client.batch.objectsBatcher();
            const batchSize = 100;

            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);

                batch.forEach(vector => {
                    const metadata = JSON.parse(vector.metadata || '{}');
                    const className = metadata.format === 'json' ? this.jsonClassName : this.documentClassName;

                    batcher.withObject({
                        class: className,
                        vector: JSON.parse(vector.embedding),
                        properties: {
                            text: vector.text_content,
                            metadata: vector.metadata,
                            jobId: vector.job_id,
                            documentId: metadata.documentId || 0,
                            vectorId: vector.vector_id.toString('hex'),
                            pageNumber: metadata.pageNumber || 0,
                            chunkIndex: metadata.chunkIndex || 0,
                            // For JSON documents
                            path: metadata.path || '',
                            value: metadata.value || '',
                            valueType: metadata.valueType || ''
                        }
                    });
                });

                await batcher.do();
                logger.info(`Stored batch of ${batch.length} vectors in Weaviate`);
            }
        } catch (error) {
            logger.error('Error storing vectors in Weaviate', { error });
            throw error;
        }
    }

    /**
     * Process and store JSON document
     * @param {Object} jsonData - The parsed JSON data
     * @param {number} jobId - ID of the job
     * @param {number} documentId - ID of the document
     * @param {Function} createEmbedding - Function to create embeddings
     * @returns {Promise<Array>} - Array of created vectors
     */
    async processJsonDocument(jsonData, jobId, documentId, createEmbedding) {
        try {
            // Flatten the JSON object
            const flattenedJson = flatten(jsonData);
            const vectors = [];

            // Process each key-value pair
            for (const [path, value] of Object.entries(flattenedJson)) {
                // Skip null or undefined values
                if (value === null || value === undefined) continue;

                // Convert the key-value pair to a text representation
                const textRepresentation = `${path}: ${value}`;
                const valueType = typeof value;

                // Create metadata
                const metadata = {
                    documentId,
                    format: 'json',
                    path,
                    value: String(value),
                    valueType
                };

                // Create embedding
                const embedding = await createEmbedding(textRepresentation);

                // Create vector record
                const vector = await Vector.create({
                    job_id: jobId,
                    vector_id: Buffer.from(crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : crypto.randomBytes(16).toString('hex'), 'hex'),
                    embedding_id: 1, // Assuming OpenAI is provider ID 1
                    text_content: textRepresentation,
                    metadata: JSON.stringify(metadata),
                    embedding: JSON.stringify(embedding),
                    status: 'success'
                });

                vectors.push(vector);
            }

            // Store vectors in Weaviate
            await this.storeVectors(vectors);

            return vectors;
        } catch (error) {
            logger.error('Error processing JSON document', { error });
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
     * @returns {Promise<Array>} - Array of similar documents
     */
    async similaritySearch(queryVector, options = {}) {
        try {
            const {
                limit = 5,
                documentId = null,
                className = this.documentClassName
            } = options;

            // Build the GraphQL query
            let graphqlQuery = this.client.graphql
                .get()
                .withClassName(className)
                .withFields(['text', 'metadata', 'jobId', 'documentId', 'vectorId', 'pageNumber', 'chunkIndex', '_additional { distance }'])
                .withNearVector({
                    vector: queryVector,
                    distance: 0.8 // Adjust this threshold as needed
                })
                .withLimit(limit);

            // Add document ID filter if provided
            if (documentId) {
                graphqlQuery = graphqlQuery.withWhere({
                    path: ['documentId'],
                    operator: 'Equal',
                    valueInt: documentId
                });
            }

            const result = await graphqlQuery.do();

            return result.data.Get[className];
        } catch (error) {
            logger.error('Error performing similarity search', { error });
            throw error;
        }
    }

    /**
     * Perform structured query on JSON documents
     * @param {Object} query - Query parameters
     * @param {string} query.operation - Operation to perform (max, min, sum, avg)
     * @param {string} query.field - Field to perform operation on
     * @param {Object} query.filter - Filter criteria
     * @returns {Promise<Object>} - Query result
     */
    async structuredQuery(query) {
        try {
            const { operation, field, filter = {} } = query;

            // Validate operation
            if (!['max', 'min', 'sum', 'avg'].includes(operation)) {
                throw new Error(`Unsupported operation: ${operation}`);
            }

            // Build where clause for the filter
            const whereClause = this.buildWhereClause(filter);

            // Find all matching JSON documents
            const graphqlQuery = this.client.graphql
                .get()
                .withClassName(this.jsonClassName)
                .withFields(['path', 'value', 'valueType', 'documentId'])
                .withWhere({
                    operator: 'And',
                    operands: [
                        {
                            path: ['path'],
                            operator: 'Equal',
                            valueString: field
                        },
                        {
                            path: ['valueType'],
                            operator: 'Equal',
                            valueString: 'number'
                        },
                        ...(whereClause ? [whereClause] : [])
                    ]
                })
                .withLimit(1000); // Set a reasonable limit

            const result = await graphqlQuery.do();
            const documents = result.data.Get[this.jsonClassName];

            // Extract values and perform the operation
            const values = documents.map(doc => parseFloat(doc.value));

            if (values.length === 0) {
                return { result: null, count: 0 };
            }

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
     * Build where clause for Weaviate query
     * @private
     * @param {Object} filter - Filter criteria
     * @returns {Object} - Weaviate where clause
     */
    buildWhereClause(filter) {
        if (!filter || Object.keys(filter).length === 0) {
            return null;
        }

        const operands = [];

        for (const [key, value] of Object.entries(filter)) {
            operands.push({
                path: ['metadata'],
                operator: 'ContainsAny',
                valueText: [`"${key}":"${value}"`]
            });
        }

        if (operands.length === 0) {
            return null;
        }

        if (operands.length === 1) {
            return operands[0];
        }

        return {
            operator: 'And',
            operands
        };
    }

    /**
     * Delete vectors for a document
     * @param {number} documentId - ID of the document
     * @returns {Promise<void>}
     */
    async deleteDocumentVectors(documentId) {
        try {
            // Delete from Document class
            await this.client.batch
                .objectsDeleter()
                .withClassName(this.documentClassName)
                .withWhere({
                    path: ['documentId'],
                    operator: 'Equal',
                    valueInt: documentId
                })
                .do();

            // Delete from JsonDocument class
            await this.client.batch
                .objectsDeleter()
                .withClassName(this.jsonClassName)
                .withWhere({
                    path: ['documentId'],
                    operator: 'Equal',
                    valueInt: documentId
                })
                .do();

            logger.info('Deleted vectors for document', { documentId });
        } catch (error) {
            logger.error('Error deleting document vectors', { error, documentId });
            throw error;
        }
    }

    /**
     * Delete vectors for a job
     * @param {number} jobId - ID of the job
     * @returns {Promise<void>}
     */
    async deleteJobVectors(jobId) {
        try {
            // Delete from Document class
            await this.client.batch
                .objectsDeleter()
                .withClassName(this.documentClassName)
                .withWhere({
                    path: ['jobId'],
                    operator: 'Equal',
                    valueInt: jobId
                })
                .do();

            // Delete from JsonDocument class
            await this.client.batch
                .objectsDeleter()
                .withClassName(this.jsonClassName)
                .withWhere({
                    path: ['jobId'],
                    operator: 'Equal',
                    valueInt: jobId
                })
                .do();

            logger.info('Deleted vectors for job', { jobId });
        } catch (error) {
            logger.error('Error deleting job vectors', { error, jobId });
            throw error;
        }
    }
}

export default new VectorStoreService();
