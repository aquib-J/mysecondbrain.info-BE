import { Router } from 'express';
import {
    createChat,
    getChat,
    listChats,
    deleteChat,
    queryDocuments,
    updateChatTitle,
    jsonQuery
} from './controllers/chat.controller.js';
import {
    createChatValidation,
    getChatValidation,
    listChatsValidation,
    deleteChatValidation,
    queryDocumentsValidation,
    updateChatTitleValidation,
    jsonQueryValidation
} from '../middlewares/validation.middleware.js';
import { queryRateLimiter } from '../middlewares/rate-limit.middleware.js';
const chatRoutes = Router();

// Chat routes - organized per requirements
chatRoutes.post('/', queryRateLimiter, createChatValidation, createChat);
chatRoutes.get('/:chatId', getChatValidation, getChat);
chatRoutes.get('/', listChatsValidation, listChats);
chatRoutes.delete('/:chatId', deleteChatValidation, deleteChat);
chatRoutes.post('/:chatId/query', queryRateLimiter, queryDocumentsValidation, queryDocuments);
chatRoutes.put('/:chatId/title', updateChatTitleValidation, updateChatTitle);
// chatRoutes.post('/structured-query', queryRateLimiter, structuredQueryValidation, structuredQuery);
chatRoutes.post('/json-query', queryRateLimiter, jsonQueryValidation, jsonQuery);

export default chatRoutes;
