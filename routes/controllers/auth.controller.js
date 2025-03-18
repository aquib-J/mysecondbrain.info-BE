import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, RefreshToken } from '../../databases/mysql8/db-schemas.js';
import Response from '../../utils/Response.js';
import Logger from '../../utils/Logger.js';
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, NODE_ENV, SEND_EMAILS } from '../../config/env.js';
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
        transaction = await sequelize.transaction();
        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } }, { transaction });
        if (existingUser) {
            await transaction.rollback();
            logger.warn('Signup attempt with existing email', {
                requestId: req.requestId,
                email
            });
            return Response.fail(res, 'User with this email already exists', StatusCodes.CONFLICT);
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
        const refreshToken = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        await RefreshToken.create({
            user_id: newUser.id,
            refresh_token: refreshToken,
            expires_at: new Date(Date.now() + JWT_REFRESH_EXPIRY * 1000)
        }, { transaction });

        // Commit the transaction
        await transaction.commit();

        // Create access token
        const accessToken = jwt.sign({ username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Set refresh token as a secure cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === "production",
            sameSite: 'Strict'
        });

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
        const user = await User.findOne({ where: { email } });

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
        const accessToken = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Create refresh token
        const refreshToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        await RefreshToken.create({
            user_id: user.id,
            refresh_token: refreshToken,
            expires_at: new Date(Date.now() + JWT_REFRESH_EXPIRY * 1000)
        });

        // Set refresh token as a secure cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === "production",
            sameSite: 'Strict'
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

        await sequelize.query(
            `UPDATE refresh_tokens rt
             JOIN users u ON rt.user_id = u.id
             SET rt.is_active = false
             WHERE u.email = :email AND rt.is_active = true`,
            {
                replacements: { email: user.email },
                type: sequelize.QueryTypes.UPDATE
            }
        );

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

