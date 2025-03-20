import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/env.js'
import { User } from '../databases/mysql8/db-schemas.js'
import Response from '../utils/Response.js';
import { StatusCodes } from 'http-status-codes';
import { ADMIN_PASS } from '../config/env.js';
import Logger from '../utils/Logger.js';

const logger = new Logger();

const authorize = async (req, res, next) => {
    try {
        let token;

        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            logger.debug('Token extracted from Authorization header', { requestId: req.requestId });
        }

        // If no token in header, check cookies
        if (!token && req.cookies && req.cookies.accessToken) {
            token = req.cookies.accessToken;
            logger.debug('Token extracted from cookies', { requestId: req.requestId });
        }

        if (!token) {
            logger.warn('Authorization failed: No token provided', {
                requestId: req.requestId,
                ip: req.ip,
                path: req.path
            });
            return Response.fail(res, 'Unauthorized - No token provided', StatusCodes.UNAUTHORIZED);
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            logger.debug('Token verified successfully', {
                requestId: req.requestId,
                userId: decoded.userId,
                email: decoded.email
            });

            const user = await User.findOne({ where: { id: decoded.userId, email: decoded.email } });

            if (!user) {
                logger.warn('Authorization failed: User not found', {
                    requestId: req.requestId,
                    decodedUserId: decoded.userId,
                    decodedEmail: decoded.email
                });
                return Response.fail(res, 'Unauthorized - Invalid user', StatusCodes.UNAUTHORIZED);
            }

            if (user.username === 'admin' && user.password_hash !== ADMIN_PASS) {
                logger.warn('Admin authentication failed: Invalid admin credentials', {
                    requestId: req.requestId,
                    userId: user.id
                });
                return Response.fail(res, 'Unauthorized - Invalid admin credentials', StatusCodes.UNAUTHORIZED);
            }

            req.user = user;

            // For debugging token expiration issues
            const tokenExp = new Date(decoded.exp * 1000);
            const now = new Date();
            const timeUntilExpiry = (tokenExp - now) / 1000 / 60; // minutes

            logger.debug('Token expiration details', {
                requestId: req.requestId,
                userId: user.id,
                tokenExpiresAt: tokenExp.toISOString(),
                currentTime: now.toISOString(),
                minutesUntilExpiry: timeUntilExpiry.toFixed(2)
            });

            next();
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                logger.info('Token expired', {
                    requestId: req.requestId,
                    error: jwtError.message,
                    expiredAt: jwtError.expiredAt
                });
                return Response.fail(res, 'Unauthorized - Token expired', StatusCodes.UNAUTHORIZED);
            }

            logger.warn('JWT verification failed', {
                requestId: req.requestId,
                error: jwtError.message,
                name: jwtError.name
            });
            return Response.fail(res, 'Unauthorized - Invalid token', StatusCodes.UNAUTHORIZED);
        }
    } catch (error) {
        logger.error('Error in authorization middleware', {
            requestId: req.requestId,
            error: error.message,
            stack: error.stack
        });
        return Response.fail(res, 'Unauthorized - Server error', StatusCodes.UNAUTHORIZED);
    }
}

export default authorize;