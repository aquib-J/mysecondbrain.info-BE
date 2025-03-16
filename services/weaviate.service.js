import weaviate from 'weaviate-ts-client';
import Logger from '../utils/Logger.js';

const logger = new Logger();

class WeaviateService {
    constructor() {
        this.client = weaviate.client({
            scheme: process.env.WEAVIATE_SCHEME || 'http',
            host: process.env.WEAVIATE_HOST || 'localhost:8080',
        });
        this.className = 'Document';
        this.initialize();
    }

    /**
     * Initialize Weaviate schema
     */
    async initialize() {
        try {
            // Check if class exists
            const classExists = await this.client.schema
                .classGetter()
                .withClassName(this.className)
                .do();

            if (!classExists) {
                // Create class if it doesn't exist
                await this.client.schema
                    .classCreator()
                    .withClass({
                        class: this.className,
                        vectorizer: 'none', // We'll provide our own vectors
                        properties: [
                            {
                                name: 'text',
                                dataType: ['text'],
                            },
                            {
                                name: 'metadata',
                                dataType: ['text'], // Store metadata as JSON string
                            },
                            {
                                name: 'jobId',
                                dataType: ['int'],
                            },
                            {
                                name: 'vectorId',
                                dataType: ['text'],
                            }
                        ],
                    })
                    .do();
            }
        } catch (error) {
            logger.error('Error initializing Weaviate schema', { error });
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
                    batcher.withObject({
                        class: this.className,
                        vector: JSON.parse(vector.embedding),
                        properties: {
                            text: vector.text_content,
                            metadata: vector.metadata,
                            jobId: vector.job_id,
                            vectorId: vector.vector_id.toString('hex')
                        }
                    });
                });

                await batcher.do();
            }
        } catch (error) {
            logger.error('Error storing vectors in Weaviate', { error });
            throw error;
        }
    }

    /**
     * Perform similarity search
     * @param {Array<number>} queryVector - Query vector
     * @param {number} limit - Number of results to return
     * @returns {Promise<Array>} - Array of similar documents
     */
    async similaritySearch(queryVector, limit = 5) {
        try {
            const result = await this.client.graphql
                .get()
                .withClassName(this.className)
                .withFields(['text', 'metadata', 'jobId', 'vectorId', '_additional { distance }'])
                .withNearVector({
                    vector: queryVector,
                    distance: 0.8 // Adjust this threshold as needed
                })
                .withLimit(limit)
                .do();

            return result.data.Get[this.className];
        } catch (error) {
            logger.error('Error performing similarity search', { error });
            throw error;
        }
    }

    /**
     * Delete vectors for a job
     * @param {number} jobId - ID of the job
     * @returns {Promise<void>}
     */
    async deleteVectors(jobId) {
        try {
            await this.client.batch
                .objectsDeleter()
                .withClassName(this.className)
                .withWhere({
                    path: ['jobId'],
                    operator: 'Equal',
                    valueNumber: jobId
                })
                .do();
        } catch (error) {
            logger.error('Error deleting vectors', { error });
            throw error;
        }
    }
}

export default new WeaviateService(); 