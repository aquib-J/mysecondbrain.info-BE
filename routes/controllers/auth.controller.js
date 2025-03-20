import { StatusCodes } from 'http-status-codes';
import bcrypt from 'bcryptjs';
import { User, RefreshToken } from '../../databases/mysql8/db-schemas.js';
import Response from '../../utils/Response.js';
import Logger from '../../utils/Logger.js';
import { UtilityMethods as util } from '../../utils/utilityMethods.js';
import { NODE_ENV, SEND_EMAILS } from '../../config/env.js';
import sequelize from '../../databases/mysql8/sequelizeConnect.js'; // Import sequelize for transactions
import emailService from '../../services/email.service.js';

const logger = new Logger();
const SALT_ROUNDS = 10; // Number of rounds for bcrypt hashing


const JWT_REFRESH_EXPIRY = 604800; //7 days in seconds

// Signup route
const signup = async (req, res) => {
    const { email, username, password } = req.body;
    let transaction;
    try {
        if (NODE_ENV == 'production' && username == 'admin') return Response.fail(res, 'Admin account creation is not allowed in production environment', StatusCodes.FORBIDDEN);

        transaction = await sequelize.transaction();
        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } }, { transaction });
        if (existingUser) {
            await transaction.rollback();
            logger.warn('Signup attempt with existing email', {
                requestId: req.requestId,
                email
            });
            return Response.fail(res, 'Account exists for this email, please log-in or ask for a password reset', StatusCodes.CONFLICT);
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user with metadata
        const newUser = await User.create({
            email,
            username,
            password_hash: hashedPassword,
            metadata: {
                signup_ip: req.ip,
                signup_user_agent: req.headers['user-agent']
            }
        }, { transaction });

        // Create refresh token
        const refreshToken = util.createToken({ userId: newUser.id, username: newUser.username, email: newUser.email }, 'refresh');
        await RefreshToken.create({
            user_id: newUser.id,
            refresh_token: refreshToken,
            expires_at: new Date(Date.now() + JWT_REFRESH_EXPIRY * 1000)
        }, { transaction });

        // Commit the transaction
        await transaction.commit();

        // Create access token
        const accessToken = util.createToken({ userId: newUser.id, username: newUser.username, email: newUser.email }, 'access');

        // Set refresh & access tokens as secure cookies
        Object.entries({ accessToken, refreshToken }).forEach(([tokenName, token]) => {
            res.cookie(tokenName, token, {
                httpOnly: true,
                secure: NODE_ENV === "production",
                sameSite: 'Strict',
            });
        })

        logger.info('User signup successful', {
            requestId: req.requestId,
            userId: newUser.id,
            email: newUser.email
        });

        // Send welcome email
        if (SEND_EMAILS === 'true') {
            try {
                await emailService.sendWelcomeEmail(email, username);
                logger.info('Welcome email sent to new user', {
                    requestId: req.requestId,
                    userId: newUser.id,
                    email: newUser.email
                });
            } catch (emailError) {
                // Log error but don't fail the signup process
                logger.error('Failed to send welcome email', {
                    requestId: req.requestId,
                    userId: newUser.id,
                    error: emailError.message
                });
            }
        }

        // Return user object without sensitive information
        const userResponse = {
            id: newUser.id,
            email: newUser.email,
            username: newUser.username,
            created_at: newUser.created_at,
            metadata: newUser.metadata
        };

        return Response.success(res, 'User created successfully', {
            user: userResponse,
            accessToken
        });
    } catch (error) {
        await transaction?.rollback();
        logger.error('Error during signup', {
            requestId: req.requestId,
            error: error.message,
            stack: error.stack
        });
        return Response.fail(res, 'Signup failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

// Login route
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await sequelize.query(`
                select u.id,u.username,u.email,
                r.id as refresh_token_id,
                u.password_hash, r.refresh_token,
                r.created_at as refresh_token_created_at,
                r.is_active as refresh_token_is_active  
                from users u left join refresh_tokens r on u.id=r.user_id 
                where r.is_active=1 and u.email=:email order by r.created_at
                desc limit 1; `,
            {
                replacements: { email },
                type: sequelize.QueryTypes.SELECT
            });

        if (!user) {
            logger.warn('Login attempt with non-existent email', {
                requestId: req.requestId,
                email
            });
            return Response.fail(res, 'Invalid email or password', StatusCodes.UNAUTHORIZED);
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            logger.warn('Login attempt with invalid password', {
                requestId: req.requestId,
                userId: user.id
            });
            return Response.fail(res, 'Invalid email or password', StatusCodes.UNAUTHORIZED);
        }

        // Create access token
        const accessToken = util.createToken({ userId: user.id, username: user.username, email: user.email }, 'access');

        // Check if refresh token is still valid (within 7 days)
        // Get the current time in UTC
        const currentTimeUtc = new Date();

        // Check if the token is active and not expired (created less than 7 days ago)
        let validRefreshToken = user.refresh_token_is_active &&
            new Date(user.refresh_token_created_at).getTime() > (currentTimeUtc.getTime() - JWT_REFRESH_EXPIRY * 1000);

        // Log the validation details for debugging
        logger.debug('Refresh token validation check', {
            userId: user.id,
            isActive: user.refresh_token_is_active,
            tokenCreatedAt: user.refresh_token_created_at,
            currentTime: currentTimeUtc,
            expiryThreshold: new Date(currentTimeUtc.getTime() - JWT_REFRESH_EXPIRY * 1000),
            isValid: validRefreshToken
        });

        // Create a new refresh token if the current one is invalid
        const refreshToken = validRefreshToken ? user.refresh_token : util.createToken({ userId: user.id, username: user.username, email: user.email }, 'refresh');

        if (!validRefreshToken) {
            logger.info('Creating new refresh token', {
                userId: user.id,
                requestId: req.requestId,
                reason: 'Previous token expired or inactive'
            });

            await Promise.all([
                RefreshToken.update({
                    is_active: 0
                }, {
                    where: {
                        id: user.refresh_token_id
                    }
                }),
                RefreshToken.create({
                    user_id: user.id,
                    refresh_token: refreshToken,
                    expires_at: new Date(Date.now() + JWT_REFRESH_EXPIRY * 1000)
                })
            ]);
        }

        // Set refresh & access tokens as secure cookies
        Object.entries({ accessToken, refreshToken }).forEach(([tokenName, token]) => {
            res.cookie(tokenName, token, {
                httpOnly: true,
                secure: NODE_ENV === "production",
                sameSite: 'Strict',
            });
        });

        logger.info('User login successful', {
            requestId: req.requestId,
            userId: user.id
        });

        // Return user object without sensitive information
        const userResponse = {
            id: user.id,
            email: user.email,
            username: user.username,
            created_at: user.created_at,
            metadata: user.metadata
        };

        return Response.success(res, 'Login successful', {
            user: userResponse,
            accessToken
        });

    } catch (error) {
        logger.error('Error during login', {
            requestId: req.requestId,
            error: error.message,
            stack: error.stack
        });
        return Response.fail(res, 'Login failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

// Logout route
const logout = async (req, res) => {
    try {
        const { user } = req;

        // Clear cookies
        res.clearCookie('refreshToken');
        res.clearCookie('accessToken');

        logger.info('User logout successful', {
            requestId: req.requestId,
            userId: user.id
        });

        return Response.success(res, 'Logout successful');
    } catch (error) {
        logger.error('Error during logout', {
            requestId: req.requestId,
            error: error.message,
            stack: error.stack
        });
        return Response.fail(res, 'Logout failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }


};

export { signup, login, logout };

