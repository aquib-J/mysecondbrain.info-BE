import { Router } from 'express';
import redisClient from '../databases/redis/redisConnect.js';
import authenticateMiddleware from '../middlewares/auth.middleware.js';
import { signup, login, logout } from './controllers/auth.controller.js';
import { uploadDocument, updateDocument, getDocumentStatus, deleteDocument, listDocuments, downloadDocument } from './controllers/document.controller.js';

import chatRoutes from './chat.routes.js';
import adminRoutes from './admin.routes.js';
import { signupValidation, loginValidation, logoutValidation } from '../middlewares/validation.middleware.js';
import { uploadDocumentValidation, updateDocumentValidation, getDocumentStatusValidation, deleteDocumentValidation } from '../middlewares/validation.middleware.js';
import sequelize from '../databases/mysql8/sequelizeConnect.js';
import weaviateClient from '../databases/weaviate/weaviate-client.js';
import { uploadRateLimiter } from '../middlewares/rate-limit.middleware.js';

const appRoute = Router();

// For Signup and Login with validation
appRoute.post('/api/v1/auth/signup', signupValidation, signup);
appRoute.post('/api/v1/auth/login', loginValidation, login);

// For Authenticated Routes
appRoute.use(authenticateMiddleware);

// Document routes with upload rate limiting
appRoute.post('/api/v1/documents/upload', uploadRateLimiter, uploadDocumentValidation, uploadDocument);
appRoute.post('/api/v1/documents/update/:documentId', updateDocumentValidation, updateDocument);
appRoute.get('/api/v1/documents/list', listDocuments);
appRoute.get('/api/v1/documents/download/:documentId', downloadDocument);
appRoute.get('/api/v1/documents/status/:documentId', getDocumentStatusValidation, getDocumentStatus);
appRoute.delete('/api/v1/documents/delete/:documentId', deleteDocumentValidation, deleteDocument);

appRoute.use('/api/v1/chats', chatRoutes);
appRoute.use('/api/v1/admin', adminRoutes);

// Logout route with validation
appRoute.get('/api/v1/auth/logout', logoutValidation, logout);

appRoute.get('/health', async (req, res) => {
    res.json({
        status: 'OK',
        redis: (await redisClient.ping()) === 'PONG' ? 'connected' : 'disconnected',
        db: (await sequelize.authenticate()) ? 'connected' : 'disconnected',
        weaviate: weaviateClient.healthCheck() ? 'available' : 'unavailable'
    });
});

export default appRoute;


