import { StatusCodes } from 'http-status-codes';
import Response from '../../utils/Response.js';
import Logger from '../../utils/Logger.js';
import chatService from '../../services/chats.service.js';

const logger = new Logger();

/**
 * Create a new chat
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
// TODO: 
// it's created with the first query and then it's updated with the title(auto-added which can be edited by user later)
const createChat = async (req, res) => {
    try {
        const { title, messages } = req.body;
        const userId = req.user.id;

        const chat = await chatService.createChat(userId, title, messages);

        return Response.success(res, 'Chat created successfully', chat);
    } catch (error) {
        logger.error('Error creating chat', { error });
        return Response.fail(res, 'Failed to create chat', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

/**
 * Get a chat by ID
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
const getChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;
        const { page = 1, pageSize = 10 } = req.query;  
        const chat = await chatService.getChat(chatId, userId, parseInt(page), parseInt(pageSize));

        return Response.success(res, 'Chat retrieved successfully', chat);
    } catch (error) {
        logger.error('Error retrieving chat', { error });
        return Response.fail(res, 'Failed to retrieve chat', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

/**
 * List chats for a user
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
const listChats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, pageSize = 10 } = req.query;

        const result = await chatService.listChats(userId, parseInt(page), parseInt(pageSize));

        return Response.success(res, 'Chats retrieved successfully', result);
    } catch (error) {
        logger.error('Error listing chats', { error });
        return Response.fail(res, 'Failed to list chats', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

/**
 * Delete a chat
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
const deleteChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        await chatService.deleteChat(chatId, userId);

        return Response.success(res, 'Chat deleted successfully');
    } catch (error) {
        logger.error('Error deleting chat', { error });
        return Response.fail(res, 'Failed to delete chat', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

/**
 * Query documents and get an answer
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
const queryDocuments = async (req, res) => {
    try {
        const { query, chatId, documentId } = req.body;
        const userId = req.user.id;

        if (!query) {
            return Response.fail(res, 'Query is required', StatusCodes.BAD_REQUEST);
        }

        const result = await chatService.queryDocuments(query, userId, chatId, documentId);

        return Response.success(res, 'Query processed successfully', result);
    } catch (error) {
        logger.error('Error querying documents', { error });
        return Response.fail(res, 'Failed to process query', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

/**
 * Perform structured query on JSON documents
 * @param {Express.Request} req - Express request object
]* @param {Express.Response} res - Express response object
 * @returns {Promise<void>}
 */
const structuredQuery = async (req, res) => {
    try {
        const { operation, field, filter, documentId } = req.body;
        const userId = req.user.id;

        if (!operation || !field || !documentId) {
            return Response.fail(res, 'Operation, field, and documentId are required', StatusCodes.BAD_REQUEST);
        }

        const result = await chatService.structuredQuery({ operation, field, filter }, userId, documentId);

        return Response.success(res, 'Structured query processed successfully', result);
    } catch (error) {
        logger.error('Error performing structured query', { error });
        return Response.fail(res, 'Failed to process structured query', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

export {
    createChat,
    getChat,
    listChats,
    deleteChat,
    queryDocuments,
    structuredQuery
};
