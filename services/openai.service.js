import OpenAI from 'openai';
import Logger from '../utils/Logger.js';
import { OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL, OPENAI_CHAT_MODEL } from './../config/env.js';
import crypto from 'crypto';

const logger = new Logger();

/**
 * Service for OpenAI API operations
 */
class OpenAIService {
    constructor() {
        this.client = new OpenAI({
            apiKey: OPENAI_API_KEY
        });
        this.embeddingModel = OPENAI_EMBEDDING_MODEL;
        this.chatModel = OPENAI_CHAT_MODEL;

        logger.info('OpenAI service initialized', {
            embeddingModel: this.embeddingModel,
            chatModel: this.chatModel
        });
    }

    /**
     * Create embeddings for multiple text inputs
     * @param {Array<string>} texts - Array of text strings to embed
     * @returns {Promise<Array<Array<number>>>} - Array of embedding vectors
     */
    async createEmbeddings(texts) {
        const operationId = crypto.randomUUID?.() || Date.now().toString();
        logger.info('Creating embeddings batch', {
            operationId,
            textsCount: texts.length,
            model: this.embeddingModel,
            timestamp: new Date().toISOString()
        });

        try {
            // Process texts in batches of 20 to avoid rate limits
            const totalBatches = Math.ceil(texts.length / 20);
            const embeddings = [];

            for (let i = 0; i < texts.length; i += 20) {
                const batchNumber = Math.floor(i / 20) + 1;
                const batch = texts.slice(i, i + 20);

                logger.info('Processing embedding batch', {
                    operationId,
                    batchNumber,
                    totalBatches,
                    batchSize: batch.length,
                    startIndex: i,
                    endIndex: Math.min(i + 20, texts.length) - 1
                });

                const batchStartTime = Date.now();
                const response = await this.client.embeddings.create({
                    model: this.embeddingModel,
                    input: batch
                });
                const batchEndTime = Date.now();

                logger.info('Embedding batch completed', {
                    operationId,
                    batchNumber,
                    totalBatches,
                    durationMs: batchEndTime - batchStartTime,
                    responseStatus: 'success',
                    embeddingsCount: response.data.length
                });

                const batchEmbeddings = response.data.map(item => item.embedding);
                embeddings.push(...batchEmbeddings);
            }

            logger.info('All embeddings created successfully', {
                operationId,
                totalEmbeddings: embeddings.length,
                timestamp: new Date().toISOString()
            });

            return embeddings;
        } catch (error) {
            logger.error('Error creating embeddings', {
                operationId,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Create a single embedding for text
     * @param {string} text - Text to create embedding for
     * @returns {Promise<Array<number>>} - Embedding vector
     */
    async createSingleEmbedding(text) {
        const embeddingId = crypto.randomUUID?.() || Date.now().toString();
        logger.info('Creating single embedding', {
            embeddingId,
            textLength: text.length,
            model: this.embeddingModel
        });

        try {
            const startTime = Date.now();
            // Create embedding
            const response = await this.client.embeddings.create({
                model: this.embeddingModel,
                input: text
            });
            const endTime = Date.now();

            logger.info('Single embedding created', {
                embeddingId,
                durationMs: endTime - startTime,
                embeddingDimensions: response.data[0].embedding.length,
                model: this.embeddingModel
            });

            // Return the embedding
            return response.data[0].embedding;
        } catch (error) {
            logger.error('Error creating single embedding', {
                embeddingId,
                error: error.message,
                stack: error.stack,
                textPreview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            });
            throw error;
        }
    }

    /**
     * Generate a text completion from OpenAI
     * @param {Array} messages - Array of message objects with role and content
     * @param {Object} options - Additional options for the completion
     * @returns {Promise<string>} - Completion text
     */
    async createChatCompletion(messages, options = {}) {
        const completionId = crypto.randomUUID?.() || Date.now().toString();
        const {
            temperature = 0.7,
            maxTokens = 1000,
            model = this.chatModel
        } = options;

        logger.info('Creating chat completion', {
            completionId,
            messagesCount: messages.length,
            model,
            temperature,
            maxTokens,
            timestamp: new Date().toISOString()
        });

        try {
            const startTime = Date.now();
            const response = await this.client.chat.completions.create({
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            });
            const endTime = Date.now();

            logger.info('Chat completion created', {
                completionId,
                durationMs: endTime - startTime,
                promptTokens: response.usage?.prompt_tokens,
                completionTokens: response.usage?.completion_tokens,
                totalTokens: response.usage?.total_tokens,
                model: response.model,
                timestamp: new Date().toISOString()
            });

            return response.choices[0].message.content;
        } catch (error) {
            logger.error('Error creating chat completion', {
                completionId,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Query the OpenAI model with the provided user query and context
     * @param {string} query - User query
     * @param {Array} contextDocs - Context documents
     * @param {string} instructions - Optional custom instructions
     * @returns {Promise<string>} - OpenAI response
     */
    async queryWithContext(query, contextDocs, instructions = '') {
        const queryId = crypto.randomUUID?.() || Date.now().toString();
        logger.info('Starting OpenAI context query', {
            queryId,
            queryLength: query.length,
            contextDocsCount: contextDocs.length,
            hasInstructions: !!instructions,
            model: this.chatModel,
            timestamp: new Date().toISOString()
        });

        try {
            // Format context documents as strings
            logger.debug('Formatting context documents', {
                queryId,
                contextDocsCount: contextDocs.length
            });

            const contextTexts = contextDocs.map((doc, index) => {
                const metadata = typeof doc.metadata === 'string'
                    ? JSON.parse(doc.metadata || '{}')
                    : (doc.metadata || {});

                return `Document ${index + 1}: ${doc.text_content || doc.text}\nSource: Document ID ${doc.documentId || metadata.documentId}, Page ${doc.pageNumber || metadata.pageNumber || 1}`;
            }).join('\n\n');

            logger.debug('Context formatted', {
                queryId,
                contextLength: contextTexts.length
            });

            // Prepare system and user messages
            let systemPrompt = `You are a helpful AI assistant that answers questions based on the provided document contexts. 
Answer questions based only on the provided context. If you can't find the answer in the context, say "I couldn't find information about that in your documents." 
Always cite your sources by referring to the document ID and page number.`;

            // Add custom instructions if provided
            if (instructions) {
                systemPrompt += `\n\n${instructions}`;
                logger.debug('Added custom instructions to system prompt', {
                    queryId,
                    instructionsLength: instructions.length
                });
            }

            const messages = [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: `Here is the context information to answer the question:\n\n${contextTexts}\n\nQuestion: ${query}`
                }
            ];

            return await this.createChatCompletion(messages, {
                temperature: 0.5,
                maxTokens: 2000
            });
        } catch (error) {
            logger.error('Error querying OpenAI with context', {
                queryId,
                error: error.message,
                stack: error.stack,
                query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Health check for OpenAI API
     * @returns {Promise<boolean>} - Whether the API is available
     */
    async healthCheck() {
        try {
            // Simple model list request to check API availability
            await this.client.models.list();
            return true;
        } catch (error) {
            logger.error('OpenAI API health check failed', {
                error: error.message
            });
            return false;
        }
    }
}

export default new OpenAIService(); 