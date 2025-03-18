import { Router } from 'express';
import {
    createChat,
    getChat,
    listChats,
    deleteChat,
    queryDocuments,
    structuredQuery,
    updateChatTitle
} from './controllers/chat.controller.js';
import {
    createChatValidation,
    getChatValidation,
    listChatsValidation,
    deleteChatValidation,
    queryDocumentsValidation,
    structuredQueryValidation,
    updateChatTitleValidation
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
chatRoutes.post('/structured-query', queryRateLimiter, structuredQueryValidation, structuredQuery);

export default chatRoutes;
