import { Router } from 'express';
import {
    createChat,
    getChat,
    listChats,
    deleteChat,
    queryDocuments,
    structuredQuery
} from './controllers/chat.controller.js';
import {
    createChatValidation,
    getChatValidation,
    listChatsValidation,
    deleteChatValidation,
    queryDocumentsValidation,
    structuredQueryValidation
} from '../middlewares/validation.middleware.js';

const chatRoutes = Router();

// Routes
chatRoutes.post('/', createChatValidation, createChat); // might not be required as queryDocuments will create a chat if it doesn't exist
chatRoutes.get('/:chatId', getChatValidation, getChat);
chatRoutes.get('/', listChatsValidation, listChats); // List of all distinct chats for a user
chatRoutes.delete('/:chatId', deleteChatValidation, deleteChat);
chatRoutes.post('/query', queryDocumentsValidation, queryDocuments);
chatRoutes.post('/structured-query', structuredQueryValidation, structuredQuery);

export default chatRoutes;
