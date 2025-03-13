import { Router } from 'express';
import authenticateMiddleware from '../middlewares/auth.middleware.js';
import { signup, login, logout } from './auth.routes.js';
// import userRoutes from './user.routes.js';
// import documentRoutes from './document.routes.js';
// import chatRoutes from './chat.routes.js';
import { signupValidation, loginValidation, logoutValidation } from '../middlewares/validation.middleware.js';

const appRoute = Router();

// For Signup and Login with validation
appRoute.post('/api/v1/auth/signup', signupValidation, signup);
appRoute.post('/api/v1/auth/login', loginValidation, login);

// For Authenticated Routes
appRoute.use(authenticateMiddleware);
// appRoute.use('/api/v1/users', userRoutes);
// appRoute.use('/api/v1/documents', documentRoutes);
// appRoute.use('/api/v1/chats', chatRoutes);

// Logout route with validation
appRoute.get('/api/v1/auth/logout', logoutValidation, logout);

export default appRoute;