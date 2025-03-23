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
import Logger from '../utils/Logger.js';
import { StatusCodes } from 'http-status-codes';
import { User } from '../databases/mysql8/db-schemas.js';
import { JWT_SECRET } from '../config/env.js';
import jwt from 'jsonwebtoken';
import Response from '../utils/Response.js';

let logger = new Logger();

const appRoute = Router();

// For Signup and Login with validation
appRoute.post('/api/v1/auth/signup', signupValidation, signup);
appRoute.post('/api/v1/auth/login', loginValidation, login);



// Private route to fetch user info by validating the token
appRoute.get('/api/v1/auth/me', async (req, res) => {
    try {
        logger.log('warn', 'Verifying access Token validity to provide user credentials', { requestId: req.requestId });
        if (req.cookies && req.cookies.accessToken) {
            let token = req.cookies.accessToken;
            let decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findOne({ where: { id: decoded.userId, email: decoded.email} });

            if (!user) {
                logger.warn('Authorization failed: User not found', {
                    requestId: req.requestId,
                    decodedUserId: decoded.userId,
                    decodedEmail: decoded.email
                });
                return Response.fail(res, 'Unauthorized - Invalid user', StatusCodes.UNAUTHORIZED);
            }
            return Response.success(res, 'User verified and details fetched successfully', { user: { id: user.id, email: user.email, username: user.username } });

        }
        return Response.fail(res, 'Unauthorized - Access Token missing in cookie', StatusCodes.UNAUTHORIZED);
    } catch (error) {
        logger.error(error.message, error);
        return Response.fail(res, 'Authentication failed, INVALID JWT', StatusCodes.UNAUTHORIZED);
    }
});

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


