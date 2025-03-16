import OpenAI from 'openai';
import Logger from '../utils/Logger.js';
import { Vector } from '../databases/mysql8/db-schemas.js';
import { v4 as uuidv4 } from 'uuid';
import { OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL, OPENAI_CHAT_MODEL } from './../config/env.js';
const logger = new Logger();

class OpenAIService {
    constructor() {
        this.client = new OpenAI({
            apiKey: OPENAI_API_KEY
        });
        this.embeddingModel = OPENAI_EMBEDDING_MODEL;
        this.chatModel = OPENAI_CHAT_MODEL;
    }

    /**
     * Create embeddings for text chunks
     * @param {Array<{text: string, metadata: Object}>} chunks - Array of text chunks with metadata
     * @param {number} jobId - ID of the job
     * @returns {Promise<Array>} - Array of created vectors
     */
    async createEmbeddings(chunks, jobId) {
        try {
            const vectors = [];
            // Process chunks in batches of 20 to avoid rate limits
            for (let i = 0; i < chunks.length; i += 20) {
                const batch = chunks.slice(i, i + 20);
                const texts = batch.map(chunk => chunk.text);

                const response = await this.client.embeddings.create({
                    model: this.embeddingModel,
                    input: texts
                });

                // Create vector records
                const batchVectors = await Promise.all(
                    batch.map(async (chunk, index) => {
                        const vectorId = Buffer.from(uuidv4().replace(/-/g, ''), 'hex');
                        const vector = await Vector.create({
                            job_id: jobId,
                            vector_id: vectorId,
                            embedding_id: 1, // Assuming OpenAI is provider ID 1
                            text_content: chunk.text,
                            metadata: JSON.stringify(chunk.metadata),
                            embedding: JSON.stringify(response.data[index].embedding),
                            status: 'success'
                        });
                        return vector;
                    })
                );

                vectors.push(...batchVectors);
            }

            return vectors;
        } catch (error) {
            logger.error('Error creating embeddings', { error });
            throw error;
        }
    }

    /**
     * Query the language model
     * @param {string} prompt - The prompt to send to the model
     * @param {Array} context - Array of relevant context chunks
     * @returns {Promise<string>} - The model's response
     */
    async query(prompt, context = []) {
        try {
            const systemPrompt = `You are a helpful AI assistant. Use the following context to answer the user's question. 
If you cannot find the answer in the context, say so.

Context:
${context.map(c => c.text_content).join('\n\n')}

Answer in a clear and concise manner.`;

            const response = await this.client.chat.completions.create({
                model: this.chatModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            return response.choices[0].message.content;
        } catch (error) {
            logger.error('Error querying OpenAI', { error });
            throw error;
        }
    }

    /**
     * Create embedding for a single query
     * @param {string} query - The query text
     * @returns {Promise<Array<number>>} - The query embedding
     */
    async createQueryEmbedding(query) {
        try {
            const response = await this.client.embeddings.create({
                model: this.embeddingModel,
                input: query
            });

            return response.data[0].embedding;
        } catch (error) {
            logger.error('Error creating query embedding', { error });
            throw error;
        }
    }
}

export default new OpenAIService(); 