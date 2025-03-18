
import Logger from '../utils/Logger.js';
import openaiService from './openai.service.js';
import weaviateService from './weaviate/weaviate.service.js';
import vectorizationService from './vectorization.service.js';
import { Chat, Document, User } from '../databases/mysql8/db-schemas.js';
import * as uuid from 'uuid';
import markdownUtils from '../utils/markdown.js';

const logger = new Logger();

class ChatService {
    /**
     * Create a new chat
     * @param {number} userId - User ID
     * @param {string} title - Chat title
     * @param {Array} messages - Chat messages
     * @param {string} type - Chat type (user or system)
     * @param {boolean} isForQuery - Whether the chat is for query purposes
     * @returns {Promise<Chat>}
     */
    async createChat(userId, title = 'New Chat', messages = [], type = 'user', isForQuery = false) {
        try {
            // If creating a chat for a query (not manually), verify documents exist
            if (isForQuery) {
                const documentsCount = await Document.count({
                    where: {
                        uploaded_by: userId,
                        status: 'active'
                    }
                });

                if (documentsCount === 0) {
                    logger.warn('User attempted to create chat with no documents', { userId });
                    throw new Error('No documents found. Please upload at least one document before creating a chat.');
                }
            }

            const chat = await Chat.create({
                user_id: userId,
                title,
                chat_id: uuid.v4(),
                type,
                metadata: {},
                messages,
                status: 'active'
            });

            logger.info('Chat created successfully', { chatId: chat.chat_id, userId });
            return chat;
        } catch (error) {
            logger.error('Error creating chat', { error, userId });
            throw error;
        }
    }

    /**
     * Get a chat by its chat_id
     * @param {string} chatId - Chat ID (UUID)
     * @param {number} userId - User ID
     * @param {number} page - Page number
     * @param {number} pageSize - Page size
     * @returns {Promise<Object>}
     */
    async getChat(chatId, userId, page = 1, pageSize = 10) {
        try {
            // Convert page and pageSize to integers
            page = parseInt(page) || 1;
            pageSize = parseInt(pageSize) || 10;

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

            if (chats.length === 0) {
                throw new Error('Chat not found');
            }

            // Process messages to deserialize markdown content
            for (const chat of chats) {
                if (chat.messages && Array.isArray(chat.messages)) {
                    chat.messages = chat.messages.map(message => {
                        if (message.content) {
                            message.content = markdownUtils.deserializeMarkdown(message.content);
                        }
                        return message;
                    });
                }
            }

            const totalPages = Math.ceil(count / pageSize);
            return {
                chats,
                totalPages,
                currentPage: page,
                pageSize
            };
        } catch (error) {
            logger.error('Error getting chat', { error, chatId, userId });
            throw error;
        }
    }

    /**
     * List distinct chats for a user
     * @param {number} userId - User ID
     * @param {number} page - Page number
     * @param {number} pageSize - Page size
     * @returns {Promise<Object>}
     */
    async listChats(userId, page = 1, pageSize = 10) {
        try {
            // Convert page and pageSize to integers
            page = parseInt(page) || 1;
            pageSize = parseInt(pageSize) || 10;

            const offset = (page - 1) * pageSize;

            // Use raw query to get the most recent chat for each chat_id
            const [distinctChats, metadata] = await sequelize.query(`
                SELECT c.*
                FROM chats c
                INNER JOIN (
                    SELECT chat_id, MAX(created_at) as max_created_at
                    FROM chats
                    WHERE user_id = :userId AND status = 'active'
                    GROUP BY chat_id
                ) latest ON c.chat_id = latest.chat_id AND c.created_at = latest.max_created_at
                WHERE c.user_id = :userId AND c.status = 'active'
                ORDER BY c.created_at DESC
                LIMIT :limit OFFSET :offset
            `, {
                replacements: {
                    userId,
                    limit: pageSize,
                    offset
                },
                type: sequelize.QueryTypes.SELECT
            });

            // Count total distinct chat_ids for pagination
            const [{ total_count }] = await sequelize.query(`
                SELECT COUNT(DISTINCT chat_id) as total_count
                FROM chats
                WHERE user_id = :userId AND status = 'active'
            `, {
                replacements: { userId },
                type: sequelize.QueryTypes.SELECT
            });

            const totalPages = Math.ceil(total_count / pageSize);

            return {
                chats: distinctChats,
                totalPages,
                currentPage: page,
                totalCount: total_count
            };
        } catch (error) {
            logger.error('Error listing chats', { error, userId });
            throw error;
        }
    }

    /**
     * Update the title of a chat
     * @param {string} chatId - Chat ID (UUID)
     * @param {number} userId - User ID
     * @param {string} title - New title
     * @returns {Promise<Object>}
     */
    async updateChatTitle(chatId, userId, title) {
        const transaction = await sequelize.transaction();

        try {
            // Find the latest chat with this chat_id
            const latestChat = await Chat.findOne({
                where: {
                    chat_id: chatId,
                    user_id: userId,
                    status: 'active'
                },
                order: [['created_at', 'DESC']],
                transaction
            });

            if (!latestChat) {
                throw new Error('Chat not found');
            }

            // Update all chats with this chat_id to have the new title
            await Chat.update(
                { title },
                {
                    where: {
                        chat_id: chatId,
                        user_id: userId,
                        status: 'active'
                    },
                    transaction
                }
            );

            await transaction.commit();

            return {
                chatId,
                title,
                message: 'Title updated successfully'
            };
        } catch (error) {
            await transaction.rollback();
            logger.error('Error updating chat title', { error, chatId, userId });
            throw error;
        }
    }

    /**
     * Delete a chat
     * @param {string} chatId - Chat ID (UUID)
     * @param {number} userId - User ID
     * @returns {Promise<boolean>}
     */
    async deleteChat(chatId, userId) {
        const transaction = await sequelize.transaction();

        try {
            // Find all chats with this chat_id
            const chats = await Chat.findAll({
                where: {
                    chat_id: chatId,
                    user_id: userId,
                    status: 'active'
                },
                transaction
            });

            if (chats.length === 0) {
                throw new Error('Chat not found');
            }

            // Update all chats with this chat_id to be deleted
            //TODO: need to test if this update works on all the rows fetched.
            const now = new Date();
            await Chat.update(
                {
                    status: 'deleted',
                    deleted_at: now
                },
                {
                    where: {
                        chat_id: chatId,
                        user_id: userId,
                        status: 'active'
                    },
                    transaction
                }
            );

            await transaction.commit();
            logger.info('Chat deleted successfully', { chatId, userId });
            return true;
        } catch (error) {
            await transaction.rollback();
            logger.error('Error deleting chat', { error, chatId, userId });
            throw error;
        }
    }

    /**
     * Add a message to a chat
     * @param {string} chatId - Chat ID (UUID)
     * @param {string} message - Message content
     * @param {string} role - Message role (user or system)
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>}
     */
    async addMessage(chatId, message, role = 'user', metadata = {}) {
        try {
            // Get the most recent chat with this chat_id
            const latestChat = await Chat.findOne({
                where: {
                    chat_id: chatId,
                    status: 'active'
                },
                order: [['created_at', 'DESC']],
            });

            if (!latestChat) {
                throw new Error('Chat not found');
            }

            // Prepare the message content - serialize markdown if needed
            const serializedMessage = role === 'system'
                ? markdownUtils.serializeMarkdown(message)
                : message;

            // Create a new chat entry with the same chat_id but with the new message
            // This maintains chat history while allowing unique messages per chat entry
            const newChat = await Chat.create({
                user_id: latestChat.user_id,
                chat_id: chatId,
                title: latestChat.title,
                type: role === 'user' ? 'user' : 'system',
                metadata: latestChat.metadata,
                messages: [{
                    id: uuid.v4(),
                    content: serializedMessage,
                    role,
                    timestamp: new Date().toISOString(),
                    metadata
                }],
                status: 'active'
            });

            logger.info('Message added to chat', { chatId, role });

            // Return the newly created message with deserialized content for immediate use
            const newMessage = {
                id: newChat.messages[0].id,
                content: role === 'system'
                    ? markdownUtils.deserializeMarkdown(serializedMessage)
                    : serializedMessage,
                role,
                timestamp: newChat.messages[0].timestamp,
                metadata: newChat.messages[0].metadata
            };

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
     * @param {string} chatId - Chat ID (UUID)
     * @param {number} documentId - Document ID (optional)
     * @returns {Promise<Object>}
     */
    async queryDocuments(query, userId, chatId, documentId = null) {
        const transaction = await sequelize.transaction();

        try {
            // Check if user has any documents
            const documentsCount = await Document.count({
                where: {
                    uploaded_by: userId,
                    status: 'active'
                },
                transaction
            });

            if (documentsCount === 0) {
                await transaction.rollback();
                logger.warn('User attempted to query with no documents', { userId });
                throw new Error('No documents found. Please upload at least one document before creating a chat.');
            }

            // Create chat if not provided
            let chat;
            if (!chatId) {
                // Create new chat with title derived from query
                chat = await this.createChat(userId, query.substring(0, 50), [], 'user');
                chatId = chat.chat_id;
                logger.info('Created new chat for query', { chatId, userId });
            } else {
                // Get the latest chat with this chat_id
                chat = await Chat.findOne({
                    where: {
                        chat_id: chatId,
                        user_id: userId,
                        status: 'active'
                    },
                    order: [['created_at', 'DESC']],
                    transaction
                });

                if (!chat) {
                    await transaction.rollback();
                    throw new Error('Chat not found');
                }
            }

            // Add user message to chat
            await this.addMessage(chatId, query, 'user', { documentId });
            logger.info('Added user message to chat', { chatId, userId });

            // Search for similar content
            const searchOptions = {
                limit: 5,
                userId
            };

            // If documentId is provided, filter by document
            if (documentId) {
                // Verify document exists and belongs to user
                const document = await Document.findOne({
                    where: {
                        id: documentId,
                        uploaded_by: userId,
                        status: 'active'
                    },
                    transaction
                });

                if (!document) {
                    await transaction.rollback();
                    throw new Error('Document not found');
                }

                searchOptions.documentId = documentId;
                logger.info('Searching within specific document', { documentId, chatId });
            } else {
                logger.info('Searching across all user documents', { chatId });
            }

            // Search in both document and JSON document classes using vectorizationService
            let documentResults = [];
            let jsonResults = [];

            try {
                documentResults = await vectorizationService.semanticSearch(
                    query,
                    { ...searchOptions, className: 'Document' }
                );
            } catch (error) {
                logger.warn('Error searching Document class', { error: error.message, chatId });
                // Continue with empty results
            }

            try {
                jsonResults = await vectorizationService.semanticSearch(
                    query,
                    { ...searchOptions, className: 'JsonDocument' }
                );
            } catch (error) {
                logger.warn('Error searching JsonDocument class', { error: error.message, chatId });
                // Continue with empty results
            }

            // Combine and sort results by distance
            const combinedResults = [...documentResults, ...jsonResults]
                .sort((a, b) => a._additional?.distance - b._additional?.distance)
                .slice(0, 5);

            // If no results found
            if (combinedResults.length === 0) {
                const noResultsResponse = "I couldn't find any relevant information in your documents to answer this question. This could be because the documents are still being processed or don't contain information related to your query.";
                await this.addMessage(chatId, noResultsResponse, 'system', { sources: [] });

                await transaction.commit();
                logger.info('No relevant documents found', { chatId });

                return {
                    answer: noResultsResponse,
                    sources: [],
                    chatId
                };
            }

            // Generate answer using OpenAI with markdown instruction
            const answer = await openaiService.queryWithContext(
                query,
                combinedResults,
                markdownUtils.getMarkdownInstructionPrompt()
            );

            // Prepare sources information
            const sources = combinedResults.map(result => {
                const metadata = typeof result.metadata === 'string'
                    ? JSON.parse(result.metadata || '{}')
                    : (result.metadata || {});

                return {
                    text: result.text_content || result.text,
                    documentId: result.documentId || metadata.documentId,
                    pageNumber: result.pageNumber || metadata.pageNumber || 0,
                    distance: result._additional?.distance
                };
            });

            // Add assistant message to chat
            await this.addMessage(chatId, answer, 'system', { sources });
            logger.info('Added system response to chat', { chatId, sourcesCount: sources.length });

            await transaction.commit();

            return {
                answer: markdownUtils.deserializeMarkdown(answer),
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
            // Validate query
            const { operation, field, filter, groupBy } = query;

            if (!operation || !field) {
                throw new Error('Operation and field are required');
            }

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

            // Enhance query with documentId
            const enhancedQuery = {
                operation,
                field,
                filter: filter || {},
                documentId,
                groupBy
            };

            // Perform structured query
            const result = await weaviateService.structuredQuery(enhancedQuery, userId);

            // Build a natural language response based on the result
            let naturalLanguageResponse;

            if (result.groupedResults) {
                // Handle grouped results
                const groups = Object.entries(result.groupedResults);
                if (groups.length === 0) {
                    naturalLanguageResponse = `No results found for the ${operation} of ${field}`;
                } else {
                    naturalLanguageResponse = `${operation.toUpperCase()} of ${field} grouped by ${groupBy}:\n`;
                    groups.forEach(([group, value]) => {
                        naturalLanguageResponse += `- ${group}: ${value}\n`;
                    });
                }
            } else {
                // Handle ungrouped results
                if (result.result === null) {
                    naturalLanguageResponse = `No results found for the ${operation} of ${field}`;
                } else {
                    const filterDescription = Object.keys(filter || {}).length > 0
                        ? ` with filters on ${Object.keys(filter).join(', ')}`
                        : '';

                    naturalLanguageResponse = `The ${operation} of ${field}${filterDescription} is ${result.result} (based on ${result.count} values)`;
                }
            }

            return {
                ...result,
                query: enhancedQuery,
                naturalLanguageResponse: markdownUtils.serializeMarkdown(naturalLanguageResponse)
            };
        } catch (error) {
            logger.error('Error performing structured query', { error, userId, documentId, query });
            throw error;
        }
    }

    /**
     * Search across all documents owned by a user
     * @param {string} query - Search query
     * @param {number} userId - User ID
     * @param {number} limit - Maximum number of results to return
     * @returns {Promise<Array>} - Search results
     */
    async searchDocuments(query, userId, limit = 10) {
        try {
            // Use vectorizationService for semantic search
            const options = {
                limit,
                userId
            };

            // Search in both document and JSON document classes
            const documentResults = await vectorizationService.semanticSearch(
                query,
                { ...options, className: 'Document' }
            );

            const jsonResults = await vectorizationService.semanticSearch(
                query,
                { ...options, className: 'JsonDocument' }
            );

            // Combine and sort results by distance
            const combinedResults = [...documentResults, ...jsonResults]
                .sort((a, b) => a._additional.distance - b._additional.distance)
                .slice(0, limit);

            // Format the results
            return combinedResults.map(result => {
                const metadata = JSON.parse(result.metadata || '{}');
                return {
                    text: result.text_content || result.text,
                    documentId: result.documentId || metadata.documentId,
                    pageNumber: result.pageNumber || metadata.pageNumber || 0,
                    distance: result._additional.distance
                };
            });
        } catch (error) {
            logger.error('Error searching documents', { error, userId });
            throw error;
        }
    }

    /**
     * Search within a specific document
     * @param {number} documentId - Document ID
     * @param {string} query - Search query
     * @param {number} userId - User ID
     * @param {number} limit - Maximum number of results to return
     * @returns {Promise<Array>} - Search results
     */
    async searchByDocumentId(documentId, query, userId, limit = 10) {
        try {
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

            // Options for search
            const options = {
                limit,
                documentId,
                userId
            };

            let results;

            // Use the appropriate class based on document type
            if (document.file_type === 'json') {
                results = await vectorizationService.semanticSearch(
                    query,
                    { ...options, className: 'JsonDocument' }
                );
            } else {
                results = await vectorizationService.semanticSearch(
                    query,
                    { ...options, className: 'Document' }
                );
            }

            // Format the results
            return results.map(result => {
                const metadata = JSON.parse(result.metadata || '{}');
                return {
                    text: result.text_content || result.text,
                    documentId: result.documentId || metadata.documentId,
                    pageNumber: result.pageNumber || metadata.pageNumber || 0,
                    distance: result._additional.distance
                };
            });
        } catch (error) {
            logger.error('Error searching document', { error, documentId, userId });
            throw error;
        }
    }
}

export default new ChatService();
