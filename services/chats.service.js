import sequelize from '../databases/mysql8/sequelizeConnect.js';
import Logger from '../utils/Logger.js';
import openaiService from './openai.service.js';
import vectorStoreService from './VectorStore.js';
import { Chat, Document, User } from '../databases/mysql8/db-schemas.js';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger();

class ChatService {
    /**
     * Create a new chat
     * @param {number} userId - User ID
     * @param {string} title - Chat title
     * @param {Array} messages - Chat messages
     * @param {string} type - Chat type (user or system)
     * @returns {Promise<Chat>}
     */
    async createChat(userId, title = 'New Chat', messages = [], type = 'user') {
        try {
            const chat = await Chat.create({
                user_id: userId,
                title,
                chat_id: uuidv4(),
                type,
                metadata: {},
                messages,
                status: 'active'
            });

            logger.info('Chat created successfully', { chatId: chat.id, userId });
            return chat;
        } catch (error) {
            logger.error('Error creating chat', { error, userId });
            throw error;
        }
    }

    /**
     * Get a chat by ID
     * @param {number} chatId - Chat ID
     * @param {number} userId - User ID
     * @returns {Promise<Chat>}
     */
    async getChat(chatId, userId, page = 1, pageSize = 10) {
        try {
            const { count, rows: chats } = await Chat.findAndCountAll({
                where: {
                    chat_id: chatId,
                    user_id: userId,
                    status: 'active'
                },
                include: [
                    {
                        model: User,
                        attributes: ['id', 'username', 'email']
                    }
                ],
                order: [['created_at', 'DESC']],
                limit: pageSize,
                offset: (page - 1) * pageSize
            });

            if (!chats) {
                throw new Error('Chat not found');
            }

            return {
                chats,
                totalPages: Math.ceil(count / pageSize),
                currentPage: page
            };
        } catch (error) {
            logger.error('Error getting chat', { error, chatId, userId });
            throw error;
        }
    }

    /**
     * List chats for a user
     * @param {number} userId - User ID
     * @param {number} page - Page number
     * @param {number} pageSize - Page size
     * @returns {Promise<{chats: Chat[], totalPages: number, currentPage: number}>}
     */
    async listChats(userId, page = 1, pageSize = 10) {
        try {
            const offset = (page - 1) * pageSize;

            const { count, rows: chats } = await Chat.findAndCountAll({
                where: {
                    user_id: userId,
                    status: 'active'
                },
                distinct: ['chat_id'],
                offset,
                limit: pageSize,
                order: [['created_at', 'DESC']]
            });

            const totalPages = Math.ceil(count / pageSize);

            return {
                chats,
                totalPages,
                currentPage: page
            };
        } catch (error) {
            logger.error('Error listing chats', { error, userId });
            throw error;
        }
    }

    /**
     * Delete a chat
     * @param {number} chatId - Chat ID
     * @param {number} userId - User ID
     * @returns {Promise<boolean>}
     */
    async deleteChat(chatId, userId) {
        try {
            const chat = await Chat.findOne({
                where: {
                    chat_id: chatId,
                    user_id: userId,
                    status: 'active'
                }
            });

            if (!chat) {
                throw new Error('Chat not found');
            }

            await chat.update({
                status: 'deleted',
                deleted_at: new Date()
            });

            logger.info('Chat deleted successfully', { chatId, userId });
            return true;
        } catch (error) {
            logger.error('Error deleting chat', { error, chatId, userId });
            throw error;
        }
    }

    /**
     * Add a message to a chat
     * @param {number} chatId - Chat ID
     * @param {string} message - Message content
     * @param {string} role - Message role (user or assistant)
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>}
     */
    async addMessage(chatId, message, role = 'user', metadata = {}) {
        try {
            const chat = await Chat.findOne({
                where: {
                    chat_id: chatId,
                    status: 'active'
                },
                order: [['created_at', 'DESC']],
            });

            if (!chat) {
                throw new Error('Chat not found');
            }

            // Get current messages or initialize empty array
            const messages = chat.messages || [];

            // Add new message
            const newMessage = {
                id: uuidv4(),
                content: message,
                role,
                timestamp: new Date().toISOString(),
                metadata
            };

            messages.push(newMessage);

            // Update chat with new messages
            await chat.update({ messages });

            logger.info('Message added to chat', { chatId, messageId: newMessage.id });
            return newMessage;
        } catch (error) {
            logger.error('Error adding message to chat', { error, chatId });
            throw error;
        }
    }

    /**
     * Query documents and get an answer
     * @param {string} query - User query
     * @param {number} userId - User ID
     * @param {number} chatId - Chat ID
     * @param {number} documentId - Document ID (optional)
     * @returns {Promise<Object>}
     */
    async queryDocuments(query, userId, chatId, documentId = null) {
        const transaction = await sequelize.transaction();

        try {
            // Create chat if not provided
            let chat;
            if (!chatId) {
                chat = await this.createChat(userId, query.substring(0, 50), [{ content: query }], 'user');
                chatId = chat.chat_id;
            } else {
                chat = await Chat.findOne({
                    where: {
                        chat_id: chatId,
                        user_id: userId,
                        status: 'active'
                    }
                });
                if (!chat) {
                    throw new Error('Chat not found');
                }
            }

            // Add user message to chat
            await this.addMessage(chatId, query, 'user', { documentId });

            // Create query embedding
            const queryEmbedding = await openaiService.createQueryEmbedding(query);

            // Search for similar content
            const searchOptions = {
                limit: 5
            };

            // If documentId is provided, filter by document
            if (documentId) {
                // Verify document exists and belongs to user
                const document = await Document.findOne({
                    where: {
                        id: documentId,
                        uploaded_by: userId,
                        status: 'active'
                    }
                });

                if (!document) {
                    throw new Error('Document not found');
                }

                searchOptions.documentId = documentId;
            }

            // Search in both document and JSON document classes
            const documentResults = await vectorStoreService.similaritySearch(
                queryEmbedding,
                { ...searchOptions, className: 'Document' }
            );

            const jsonResults = await vectorStoreService.similaritySearch(
                queryEmbedding,
                { ...searchOptions, className: 'JsonDocument' }
            );

            // Combine and sort results by distance
            const combinedResults = [...documentResults, ...jsonResults]
                .sort((a, b) => a._additional.distance - b._additional.distance)
                .slice(0, 5);

            // If no results found
            if (combinedResults.length === 0) {
                const noResultsResponse = "I couldn't find any relevant information in your documents to answer this question.";
                await this.addMessage(chatId, noResultsResponse, 'system', { sources: [] });

                await transaction.commit();

                return {
                    answer: noResultsResponse,
                    sources: [],
                    chatId
                };
            }

            // Generate answer using OpenAI
            const answer = await openaiService.query(query, combinedResults);

            // Prepare sources information
            const sources = combinedResults.map(result => {
                const metadata = JSON.parse(result.metadata || '{}');
                return {
                    text: result.text,
                    documentId: result.documentId || metadata.documentId,
                    pageNumber: result.pageNumber || metadata.pageNumber || 0,
                    distance: result._additional.distance
                };
            });

            // Add assistant message to chat
            await this.addMessage(chatId, answer, 'system', { sources });

            await transaction.commit();

            return {
                answer,
                sources,
                chatId
            };
        } catch (error) {
            await transaction.rollback();
            logger.error('Error querying documents', { error, userId, query });
            throw error;
        }
    }

    /**
     * Perform structured query on JSON documents
     * @param {Object} query - Query parameters
     * @param {number} userId - User ID
     * @param {number} documentId - Document ID
     * @returns {Promise<Object>}
     */
    async structuredQuery(query, userId, documentId) {
        try {
            // Verify document exists and belongs to user
            const document = await Document.findOne({
                where: {
                    id: documentId,
                    uploaded_by: userId,
                    status: 'active',
                    file_type: 'json'
                }
            });

            if (!document) {
                throw new Error('JSON document not found');
            }

            // Perform structured query
            const result = await vectorStoreService.structuredQuery({
                ...query,
                documentId
            });

            return result;
        } catch (error) {
            logger.error('Error performing structured query', { error, userId, documentId, query });
            throw error;
        }
    }
}

export default new ChatService();
