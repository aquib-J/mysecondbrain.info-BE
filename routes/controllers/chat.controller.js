import { StatusCodes } from 'http-status-codes';
import Logger from '../../utils/Logger.js';
import chatService from '../../services/chats.service.js';
import Response from '../../utils/Response.js';
import { Document } from '../../databases/mysql8/db-schemas.js';

const logger = new Logger();

/**
 * Check if user has uploaded any documents
 * @param {number} userId - User ID to check
 * @returns {Promise<boolean>} - True if user has documents, false otherwise
 */
const hasUserUploadedDocuments = async (userId) => {
    const documentsCount = await Document.count({
        where: {
            uploaded_by: userId,
            status: 'active'
        }
    });
    return documentsCount > 0;
};

/**
 * Verify user has documents before proceeding with an operation
 * @param {number} userId - User ID to check
 * @param {Express.Response} res - Express response object
 * @param {string} operation - Operation name for logging
 * @returns {Promise<boolean>} - True if user has documents, false if validation failed
 */
const verifyUserHasDocuments = async (userId, res, operation) => {
    const hasDocuments = await hasUserUploadedDocuments(userId);

    if (!hasDocuments) {
        logger.warn(`User attempted ${operation} with no documents`, { userId });
        Response.fail(
            res,
            'No documents found. Please upload at least one document before proceeding.',
            StatusCodes.BAD_REQUEST
        );
        return false;
    }

    return true;
};

/**
 * Create a new chat
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const createChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, query, documentId } = req.body;

        // A query is required when creating a chat 
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return Response.fail(res, 'A query is required to create a chat', StatusCodes.BAD_REQUEST);
        }

        // Verify user has documents before proceeding
        if (!await verifyUserHasDocuments(userId, res, 'chat creation')) {
            return; // Response already sent
        }

        // Query documents and create chat with the result
        try {
            const result = await chatService.queryDocuments(query, userId, null, documentId);

            // If a custom title was provided, update the auto-generated title
            if (title && title.trim() !== '') {
                await chatService.updateChatTitle(result.chatId, userId, title);
                result.title = title;
            }

            return Response.success(res, 'Chat created and documents queried successfully', result);
        } catch (error) {
            // Handle specific errors with better messages
            if (error.message.includes('No documents found')) {
                return Response.fail(res, 'Please upload at least one document before creating a chat', StatusCodes.BAD_REQUEST);
            } else if (error.message.includes('Document not found')) {
                return Response.fail(res, 'The specified document could not be found', StatusCodes.NOT_FOUND);
            } else {
                logger.error('Error creating chat', { error: error.message, stack: error.stack });
                return Response.fail(res, 'An error occurred while creating the chat. Your documents might still be processing.', StatusCodes.INTERNAL_SERVER_ERROR);
            }
        }
    } catch (error) {
        logger.error('Error creating chat', { error: error.message, stack: error.stack });
        return Response.fail(res, error.message);
    }
};

/**
 * Get a chat by ID
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const getChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;
        const { page, pageSize } = req.query;

        const result = await chatService.getChat(chatId, userId, page, pageSize);
        return Response.success(res, 'Chat retrieved successfully', result);
    } catch (error) {
        return Response.fail(res, error.message);
    }
};

/**
 * List chats for a user
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const listChats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page, pageSize } = req.query;

        const result = await chatService.listChats(userId, page, pageSize);
        return Response.success(res, 'Chats retrieved successfully', result);
    } catch (error) {
        return Response.fail(res, error.message);
    }
};

/**
 * Delete a chat
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const deleteChat = async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;

        await chatService.deleteChat(chatId, userId);
        return Response.success(res, 'Chat deleted successfully');
    } catch (error) {
        return Response.fail(res, error.message);
    }
};

/**
 * Query documents for a chat
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const queryDocuments = async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;
        const { query, documentId } = req.body;

        // Verify user has documents before proceeding
        if (!await verifyUserHasDocuments(userId, res, 'document querying')) {
            return; // Response already sent
        }

        const result = await chatService.queryDocuments(query, userId, chatId, documentId);
        return Response.success(res, 'Documents queried successfully', result);
    } catch (error) {
        logger.error('Error querying documents', { error });
        return Response.fail(res, error.message);
    }
};

/**
 * Execute a structured query
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const structuredQuery = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query, filters } = req.body;

        // Verify user has documents before proceeding
        if (!await verifyUserHasDocuments(userId, res, 'structured querying')) {
            return; // Response already sent
        }

        const result = await chatService.structuredQuery(query, userId, filters);
        return Response.success(res, 'Structured query executed successfully', result);
    } catch (error) {
        logger.error('Error executing structured query', { error });
        return Response.fail(res, error.message);
    }
};

/**
 * Update chat title
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
export const updateChatTitle = async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;
        const { title } = req.body;

        const result = await chatService.updateChatTitle(chatId, userId, title);
        return Response.success(res, 'Chat title updated successfully', result);
    } catch (error) {
        return Response.fail(res, error.message);
    }
};

