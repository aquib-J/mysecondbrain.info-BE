import Logger from '../utils/Logger.js';
import openaiService from './openai.service.js';
import weaviateService from './weaviate/weaviate.service.js';
import vectorizationService from './vectorization.service.js';
import { Chat, Document, User } from '../databases/mysql8/db-schemas.js';
import * as uuid from 'uuid';
import markdownUtils from '../utils/markdown.js';
import sequelize from '../databases/mysql8/sequelizeConnect.js';
import { Buffer } from 'buffer';

const logger = new Logger();

class ChatService {

    /**
     * Convert a UUID string to a Buffer
     * @param {string} uuidString - The UUID string to convert
     * @returns {Buffer} - The UUID as a Buffer
     */ //TODO: move this to a utility function along with convertBufferToUuidString
    convertUuidStringToBuffer(uuidString) {
        // Remove dashes and convert to Buffer
        return Buffer.from(uuidString.replace(/-/g, ''), 'hex');
    }

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

            // Add timestamp to messages if provided
            const processedMessages = messages.map(msg => ({
                ...msg,
                id: msg.id || uuid.v4(),
                timestamp: msg.timestamp || new Date().toISOString()
            }));

            const chat = await Chat.create({
                user_id: userId,
                title,
                chat_id: uuid.v4(),
                type,
                metadata: {},
                messages: processedMessages,
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
            // eslint-disable-next-line no-unused-vars
            const distinctChats = await sequelize.query(`
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
                type: sequelize.QueryTypes.SELECT,
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
                limit: 1,
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
            logger.error('Error adding message to chat', { error: error.message, chatId });
            throw error;
        }
    }

    /**
     * Query documents and get an answer
     * @param {number} userId - User ID
     * @param {string} query - User query
     * @param {string} chatId - Chat ID (UUID)
     * @param {number} documentId - Document ID (optional)
     * @returns {Promise<Object>}
     */
    async queryDocuments(query, userId, chatId, documentId = null) {
        const transaction = await sequelize.transaction();

        try {
            // Verify user has documents
            await this.verifyUserHasDocuments(userId, transaction);

            // Create or get the chat
            let chat;
            if (!chatId) {
                // Create new chat with user's query as first message
                chat = await this.createChat(userId, query.substring(0, 50), [{
                    content: query,
                    role: 'user',
                    metadata: { documentId }
                }], 'user');
                chatId = chat.chat_id;
                logger.info('Created new chat with initial message', { chatId, userId });
            } else {
                // Get existing chat and add user message
                chat = await this.getChatById(chatId, userId, transaction);
                await this.addMessage(chatId, query, 'user', { documentId });
                logger.info('Added user message to existing chat', { chatId, userId });
            }

            // Search for similar content
            const searchOptions = {
                limit: 5,
                userId
            };

            // If documentId is provided, filter by document
            if (documentId) {
                await this.verifyDocumentExists(documentId, userId, transaction);
                searchOptions.documentId = documentId;
                logger.info('Searching within specific document', { documentId, chatId });
            } else {
                logger.info('Searching across all user documents', { chatId });
            }

            // Get embedding for the query once and reuse it
            const queryEmbedding = await openaiService.createSingleEmbedding(query);
            logger.info('Created embedding for query', { chatId, queryLength: query.length });

            // Search in both document and JSON document classes using the same embedding
            let combinedResults = await this.performCombinedSearch(queryEmbedding, searchOptions);

            // If no results found
            if (combinedResults.length === 0) {
                return await this.handleNoResults(chatId, transaction);
            }

            // Enhance results with actual content from DB if needed
            combinedResults = await this.enhanceResultsWithContent(combinedResults, userId);

            // Generate answer using OpenAI (openaiService now handles markdown automatically)
            const answer = await openaiService.queryWithContext(query, combinedResults);

            // Prepare sources information
            const sources = this.prepareSources(combinedResults);

            // Add assistant message to chat (addMessage method now handles serialization)
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
            logger.error('Error querying documents', { error: error.message, userId, query });
            throw error;
        }
    }

    /**
     * Verify user has uploaded documents
     * @param {number} userId - User ID
     * @param {Transaction} transaction - Sequelize transaction
     * @private
     */
    async verifyUserHasDocuments(userId, transaction) {
        const documentsCount = await Document.count({
            where: {
                uploaded_by: userId,
                status: 'active'
            },
            transaction
        });

        if (documentsCount === 0) {
            logger.warn('User attempted to query with no documents', { userId });
            throw new Error('No documents found. Please upload at least one document before creating a chat.');
        }
    }

    /**
     * Verify document exists and belongs to user
     * @param {number} documentId - Document ID
     * @param {number} userId - User ID
     * @param {Transaction} transaction - Sequelize transaction
     * @private
     */
    async verifyDocumentExists(documentId, userId, transaction) {
        const document = await Document.findOne({
            where: {
                id: documentId,
                uploaded_by: userId,
                status: 'active'
            },
            transaction
        });

        if (!document) {
            throw new Error('Document not found');
        }

        return document;
    }

    /**
     * Get chat by ID
     * @param {string} chatId - Chat ID
     * @param {number} userId - User ID
     * @param {Transaction} transaction - Sequelize transaction
     * @private
     */
    async getChatById(chatId, userId, transaction) {
        const chat = await Chat.findOne({
            where: {
                chat_id: chatId,
                user_id: userId,
                status: 'active'
            },
            order: [['created_at', 'DESC']],
            transaction
        });

        if (!chat) {
            throw new Error('Chat not found');
        }

        return chat;
    }

    /**
     * Perform combined search across Document and JsonDocument classes
     * @param {Array} queryEmbedding - Query embedding vector
     * @param {Object} searchOptions - Search options
     * @returns {Promise<Array>} - Combined search results
     * @private
     */
    async performCombinedSearch(queryEmbedding, searchOptions) {
        let documentResults = [];
        let jsonResults = [];

        // Use the embedding directly for both searches to avoid creating it twice
        try {
            documentResults = await vectorizationService.semanticSearchWithEmbedding(
                queryEmbedding,
                { ...searchOptions, className: 'Document' }
            );
        } catch (error) {
            logger.warn('Error searching Document class', { error: error.message });
            // Continue with empty results
        }

        try {
            jsonResults = await vectorizationService.semanticSearchWithEmbedding(
                queryEmbedding,
                { ...searchOptions, className: 'JsonDocument' }
            );
        } catch (error) {
            logger.warn('Error searching JsonDocument class', { error: error.message });
            // Continue with empty results
        }

        // Combine and sort results by distance
        return [...documentResults, ...jsonResults]
            .sort((a, b) => a._additional?.distance - b._additional?.distance)
            .slice(0, 5);
    }

    /**
     * Handle the case when no results are found
     * @param {string} chatId - Chat ID
     * @param {Transaction} transaction - Sequelize transaction
     * @returns {Promise<Object>} - Response object
     * @private
     */
    async handleNoResults(chatId, transaction) {
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

    /**
     * Enhance search results with actual content from database if needed
     * @param {Array} results - Search results
     * @param {number} userId - User ID
     * @returns {Promise<Array>} - Enhanced results
     * @private
     */
    //TODO: prepare all the results in enhancedResults and then do a bulk query to get the text_content of the items.
    async enhanceResultsWithContent(results, userId) {
        const enhancedResults = [];

        for (const result of results) {
            let enhancedResult = { ...result };

            // If the text content is missing or placeholder, fetch from DB
            if (!result.text_content) {
                try {
                    const metadata = typeof result.metadata === 'string'
                        ? JSON.parse(result.metadata || '{}')
                        : (result.metadata || {});

                    const documentId = result.documentId || metadata.documentId;
                    let vectorId = result.vectorId || metadata.vectorId || result.id;

                    vectorId = this.convertUuidStringToBuffer(vectorId);

                    if (documentId && vectorId) {
                        const [{ text_content }] = await sequelize.query(`
                            SELECT v.text_content FROM vectors v
                                JOIN jobs j ON v.job_id = j.id
                                JOIN documents d ON j.doc_id = d.id
                             WHERE v.vector_id= :vectorId
                                AND v.is_active = true
                                AND v.status = 'success'
                                AND d.id = :documentId
                                AND d.uploaded_by = :userId
                                AND d.status = 'active'
                        `, {
                            type: sequelize.QueryTypes.SELECT,
                            replacements: { vectorId, documentId, userId }
                        });

                        if (text_content) {
                            enhancedResult.text_content = text_content;
                            logger.info('Enhanced result with vector content', { documentId, vectorId });
                        }
                    }
                } catch (error) {
                    logger.warn('Error enhancing result with vector content', { error: error.message });
                    // Keep the original result if enhancement fails
                }
            }

            enhancedResults.push(enhancedResult);
        }

        return enhancedResults;
    }

    /**
     * Prepare sources information from search results
     * @param {Array} results - Search results
     * @returns {Array} - Source information
     * @private
     */
    prepareSources(results) {
        return results.map(result => {
            const metadata = typeof result.metadata === 'string'
                ? JSON.parse(result.metadata || '{}')
                : (result.metadata || {});

            return {
                text: result.text_content || result.text, //TODO: apply markdown deserialize here
                documentId: result.documentId || metadata.documentId,
                pageNumber: result.pageNumber || metadata.pageNumber || 0,
                vectorId: result.vectorId || metadata.vectorId || result.id,
                distance: result._additional?.distance
            };
        });
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

    /**
     * Get messages for a chat (properly deserialized)
     * @param {string} chatId - Chat ID 
     * @param {string} userId - User ID
     * @returns {Promise<Array>} - Chat messages
     */
    async getMessages(chatId, userId) {
        try {
            // Find all chats with this chat_id, ordered by created_at
            const chats = await Chat.findAll({
                where: {
                    chat_id: chatId,
                    user_id: userId,
                    status: 'active'
                },
                order: [['created_at', 'ASC']]
            });

            if (chats.length === 0) {
                throw new Error('Chat not found');
            }

            // Extract and flatten all messages from all chat entries
            const allMessages = [];

            for (const chat of chats) {
                if (chat.messages && Array.isArray(chat.messages)) {
                    // Deserialize markdown content in messages
                    const deserializedMessages = chat.messages.map(msg => ({
                        id: msg.id,
                        content: msg.role === 'system'
                            ? markdownUtils.deserializeMarkdown(msg.content)
                            : msg.content,
                        raw_content: msg.content,
                        role: msg.role,
                        timestamp: msg.timestamp,
                        metadata: msg.metadata,
                        chat_created_at: chat.created_at
                    }));
                    allMessages.push(...deserializedMessages);
                }
            }

            // Sort messages by timestamp
            return allMessages.sort((a, b) =>
                new Date(a.timestamp) - new Date(b.timestamp)
            );
        } catch (error) {
            logger.error('Error getting chat messages', { chatId, userId, error: error.message });
            throw error;
        }
    }

    // /**
    //  * Process natural language query on JSON documents
    //  * @param {string} query - Natural language query string
    //  * @param {number} userId - User ID
    //  * @param {number} documentId - Document ID
    //  * @returns {Promise<Object>}
    //  */
    // async naturalLanguageJsonQuery(query, userId, documentId) {
    //     try {
    //         // Verify document exists and belongs to user
    //         const document = await Document.findOne({
    //             where: {
    //                 id: documentId,
    //                 uploaded_by: userId,
    //                 status: 'active',
    //                 file_type: 'json'
    //             }
    //         });

    //         if (!document) {
    //             throw new Error('JSON document not found');
    //         }

    //         // Step 1: Get document fields to understand the structure
    //         const documentFields = await weaviateService.getJsonDocumentFields(documentId, userId);

    //         // Step 2: Parse natural language into structured query intent
    //         const queryIntent = await this.#parseQueryIntent(query, documentFields);

    //         // Step 3: If it's an aggregation query, execute as structured query
    //         if (queryIntent.type === 'aggregation') {
    //             const structuredQueryParams = {
    //                 operation: queryIntent.operation,
    //                 field: queryIntent.field,
    //                 filter: queryIntent.filter,
    //                 groupBy: queryIntent.groupBy
    //             };

    //             return await this.structuredQuery(structuredQueryParams, userId, documentId);
    //         }

    //         // Step 4: If it's a search query, perform semantic search
    //         const searchResults = await weaviateService.semanticJsonSearch(
    //             query,
    //             documentId,
    //             userId,
    //             queryIntent.filter
    //         );

    //         // Step 5: Format response
    //         return {
    //             results: searchResults.results,
    //             count: searchResults.count,
    //             query: {
    //                 original: query,
    //                 intent: queryIntent
    //             },
    //             naturalLanguageResponse: markdownUtils.serializeMarkdown(
    //                 this.#generateNLResponse(searchResults, query, queryIntent)
    //             )
    //         };
    //     } catch (error) {
    //         logger.error('Error processing natural language JSON query', { error, userId, documentId, query });
    //         throw error;
    //     }
    // }

//     /**
//      * Parse natural language query into structured intent
//      * @param {string} query - The natural language query
//      * @param {Array} documentFields - Available fields in the document
//      * @returns {Object} - Query intent
//      * @private
//      */
//     async #parseQueryIntent(query, documentFields) {
//         // Request LLM to parse the natural language query
//         const prompt = `
// Parse the following natural language query about a JSON document into a structured intent.
// Available fields in the document: ${documentFields.map(f => f.path).join(', ')}

// Query: "${query}"

// Respond with a JSON object containing the query intent in this format:
// {
//   "type": "aggregation" | "search",
//   "operation": "max" | "min" | "avg" | "sum" | "count" | null,
//   "field": "field_name" | null,
//   "filter": { field: value } | null,
//   "groupBy": "field_name" | null
// }
// `;

//         try {
//             // Call your preferred LLM service
//             const llmResponse = await aiService.generateText(prompt, {
//                 temperature: 0.1,
//                 max_tokens: 500
//             });

//             // Extract JSON from the response
//             const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
//             if (!jsonMatch) {
//                 throw new Error('Failed to parse LLM response');
//             }

//             const intent = JSON.parse(jsonMatch[0]);

//             // Validate the parsed intent
//             if (!['aggregation', 'search'].includes(intent.type)) {
//                 throw new Error('Invalid intent type');
//             }

//             if (intent.type === 'aggregation') {
//                 if (!['max', 'min', 'avg', 'sum', 'count'].includes(intent.operation)) {
//                     throw new Error('Invalid aggregation operation');
//                 }

//                 if (!intent.field) {
//                     throw new Error('Field is required for aggregation');
//                 }
//             }

//             return intent;
//         } catch (error) {
//             logger.error('Error parsing query intent', { error, query });
//             // Fallback to simple search intent
//             return {
//                 type: 'search',
//                 operation: null,
//                 field: null,
//                 filter: null,
//                 groupBy: null
//             };
//         }
//     }

    // /**
    //  * Generate natural language response for search results
    //  * @param {Object} searchResults - Results from semantic search
    //  * @param {string} query - Original query
    //  * @param {Object} queryIntent - Parsed query intent
    //  * @returns {string} - Natural language response
    //  * @private
    //  */
    // #generateNLResponse(searchResults, query, queryIntent) {
    //     const { results, count } = searchResults;

    //     if (count === 0) {
    //         return `No results found for: "${query}"`;
    //     }

    //     let response = `I found ${count} ${count === 1 ? 'result' : 'results'} for: "${query}"\n\n`;

    //     if (queryIntent.type === 'search') {
    //         // Format first few results
    //         const topResults = results.slice(0, 3);
    //         topResults.forEach((result, i) => {
    //             response += `${i + 1}. `;

    //             // Add key information from the result
    //             const keyInfo = Object.entries(result)
    //                 .filter(([key]) => !['id', '_additional'].includes(key))
    //                 .slice(0, 5) // Limit to first 5 fields
    //                 .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    //                 .join(', ');

    //             response += keyInfo + '\n';
    //         });

    //         if (count > 3) {
    //             response += `\n...and ${count - 3} more results.`;
    //         }
    //     }

    //     return response;
    // }

    /**
     * Process unified JSON query - handles both natural language and structured queries
     * @param {Object} params - Query parameters
     * @param {string|Object} params.query - Natural language query string or structured query object
     * @param {number} params.userId - User ID
     * @param {number} params.documentId - Document ID
     * @returns {Promise<Object>} - Query results with natural language response
     */
    async unifiedJsonQuery(params) {
        try {
            const { query, userId, documentId } = params;

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

            // Use the enhanced unified query endpoint in Weaviate service
            const result = await weaviateService.unifiedJsonQuery({
                query,
                documentId,
                userId
            });

            // Process result to ensure markdown is properly formatted
            if (result.naturalLanguageResponse) {
                result.naturalLanguageResponse = markdownUtils.serializeMarkdown(result.naturalLanguageResponse);
            }

            return result;
        } catch (error) {
            logger.error('Error processing unified JSON query', { error, userId, documentId });
            throw error;
        }
    }
}

export default new ChatService();
