import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, RefreshToken } from '../../databases/mysql8/db-schemas.js';
import Response from '../../utils/Response.js';
import Logger from '../../utils/Logger.js';
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, NODE_ENV } from '../../config/env.js';
import sequelize from '../../databases/mysql8/sequelizeConnect.js'; // Import sequelize for transactions

const logger = new Logger();
const SALT_ROUNDS = 10; // Number of rounds for bcrypt hashing


const JWT_REFRESH_EXPIRY = 604800; //7 days in seconds

// Signup route
const signup = async (req, res) => {
    const { email, username, password } = req.body;

    const transaction = await sequelize.transaction();

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } }, { transaction });
        if (existingUser) {
            return Response.fail(res, 'User with this email already exists', StatusCodes.CONFLICT);
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // TODO: Add metadata to the user & aslo ip address and user location
        const newUser = await User.create({
            email,
            username,
            password_hash: hashedPassword
        }, { transaction });

        // Create refresh token
        const refreshToken = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        await RefreshToken.create({
            user_id: newUser.id,
            refresh_token: refreshToken,
            expires_at: new Date(Date.now() + JWT_REFRESH_EXPIRY * 1000) // Convert seconds to milliseconds
        }, { transaction });

        // Commit the transaction
        await transaction.commit();

        // Create access token
        const accessToken = jwt.sign({ username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Set refresh token as a secure cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === "production", // HTTPS only in production
            sameSite: 'Strict'
        });

        return Response.success(res, 'User created successfully', { accessToken });
    } catch (error) {
        await transaction.rollback(); // Rollback the transaction on error
        logger.error('Error during signup', { error });
        return Response.fail(res, 'Signup failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

// Login route
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return Response.fail(res, 'Invalid email or password', StatusCodes.UNAUTHORIZED);
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return Response.fail(res, 'Invalid email or password', StatusCodes.UNAUTHORIZED);
        }

        // Create access token
        const accessToken = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Create refresh token
        const refreshToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        await RefreshToken.create({
            user_id: user.id,
            refresh_token: refreshToken,
            expires_at: new Date(Date.now() + JWT_REFRESH_EXPIRY * 1000) // Convert seconds to milliseconds
        });

        // Set refresh token as a secure cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === "production", // HTTPS only in production
            sameSite: 'Strict'
        });

        return Response.success(res, 'Login successful', { user: { username: user.username, email: user.email }, accessToken });

    } catch (error) {
        logger.error('Error during login', { error });
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

        return Response.success(res, 'Logout successful');
    } catch (error) {
        logger.error('Error during logout', { error });
        return Response.fail(res, 'Logout failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

export { signup, login, logout };

