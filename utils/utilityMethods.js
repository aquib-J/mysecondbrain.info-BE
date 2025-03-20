import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } from "../config/env.js";

export class UtilityMethods {

    static cleanAndJoinString(str) {
    if (typeof str !== 'string') {
        throw new Error('Input must be a string');
    }

    // Remove leading and trailing spaces, split by spaces, filter out empty parts, and join with '_'
    return str.trim().split(/\s+/).filter(Boolean).join('_');
    }

     /**
     * Create a JWT token
     * @param {Object} data - The data to be encoded in the token
     * @param {string} type - The type of token to create ('access' or 'refresh')
     * @returns {string} The created signed token
     */
    static createToken (data, type) {
        return jwt.sign(data, JWT_SECRET, { expiresIn: type === 'access' ? JWT_EXPIRES_IN : JWT_REFRESH_EXPIRES_IN })
    }
    
}
