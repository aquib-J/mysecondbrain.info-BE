import { celebrate, Joi, Segments } from 'celebrate';
import Response from '../utils/Response.js';

const VALID_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json',
    'text/plain'
];

// Validation for signup
const signupValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        email: Joi.string().email().required().messages({
            'string.email': 'Email must be a valid email address',
            'any.required': 'Email is required'
        }),
        username: Joi.string().min(3).max(30).required().messages({
            'string.min': 'Username must be at least 3 characters long',
            'string.max': 'Username must be at most 30 characters long',
            'any.required': 'Username is required'
        }),
        password: Joi.string().min(6).required().messages({
            'string.min': 'Password must be at least 6 characters long',
            'any.required': 'Password is required'
        })
    })
});

// Validation for login
const loginValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        email: Joi.string().email().required().messages({
            'string.email': 'Email must be a valid email address',
            'any.required': 'Email is required'
        }),
        password: Joi.string().required().messages({
            'any.required': 'Password is required'
        })
    })
});

// Validation for logout
const logoutValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        // TODO: Add body validation for logout if required later
    })
});

// Validation for document upload
const uploadDocumentValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        filename: Joi.string().required().messages({
            'any.required': 'Filename is required'
        }),
        filetype: Joi.string().valid(...VALID_FILE_TYPES).required().messages({
            'any.required': 'File type is required',
            'any.only': `File type must be one of the following: ${VALID_FILE_TYPES.join(', ')}`,
        }),
    }),
});

// Validation for document update
const updateDocumentValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        filename: Joi.string().optional()
    }),
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.number().integer().min(1).required().messages({
            'any.required': 'Document ID is required'
        })
    })
});

// Validation for getting document status
const getDocumentStatusValidation = celebrate({
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.number().integer().min(1).required().messages({
            'any.required': 'Document ID is required'
        })
    })
});

// Validation for deleting document
const deleteDocumentValidation = celebrate({
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.number().integer().min(1).required().messages({
            'any.required': 'Document ID is required'
        })
    })
});

// Validation for chat creation
export const createChatValidation = (req, res, next) => {
    try {
        const { title, query, documentId } = req.body;

        // Query is required to create a chat
        if (!query || typeof query !== 'string' || query.trim().length < 1) {
            return Response.fail(res, 'Query is required and must be a non-empty string', 400);
        }

        // Title is optional but if provided, must be a string
        if (title !== undefined && (typeof title !== 'string' || title.trim().length < 1)) {
            return Response.fail(res, 'Title must be a non-empty string', 400);
        }

        // DocumentId is optional, but if provided, validate it
        if (documentId !== undefined) {
            if (isNaN(parseInt(documentId))) {
                return Response.fail(res, 'Document ID must be a valid number', 400);
            }
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Validation for getting a chat
export const getChatValidation = (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { page, pageSize } = req.query;

        if (!chatId) {
            return Response.fail(res, 'Chat ID is required', 400);
        }

        // Validate page and pageSize if provided
        if (page !== undefined) {
            const pageNum = parseInt(page);
            if (isNaN(pageNum) || pageNum < 1) {
                return Response.fail(res, 'Page must be a positive number', 400);
            }
        }

        if (pageSize !== undefined) {
            const pageSizeNum = parseInt(pageSize);
            if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
                return Response.fail(res, 'Page size must be between 1 and 100', 400);
            }
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Validation for listing chats
export const listChatsValidation = (req, res, next) => {
    try {
        const { page, pageSize } = req.query;

        // Validate page and pageSize if provided
        if (page !== undefined) {
            const pageNum = parseInt(page);
            if (isNaN(pageNum) || pageNum < 1) {
                return Response.fail(res, 'Page must be a positive number', 400);
            }
        }

        if (pageSize !== undefined) {
            const pageSizeNum = parseInt(pageSize);
            if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
                return Response.fail(res, 'Page size must be between 1 and 100', 400);
            }
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Validation for deleting a chat
export const deleteChatValidation = (req, res, next) => {
    try {
        const { chatId } = req.params;

        if (!chatId) {
            return Response.fail(res, 'Chat ID is required', 400);
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Validation for querying documents
export const queryDocumentsValidation = (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { query, documentId } = req.body;

        if (!chatId) {
            return Response.fail(res, 'Chat ID is required', 400);
        }

        if (!query || typeof query !== 'string' || query.trim().length < 1) {
            return Response.fail(res, 'Query is required', 400);
        }

        // Validate documentId if provided
        if (documentId !== undefined) {
            if (isNaN(parseInt(documentId))) {
                return Response.fail(res, 'Document ID must be a valid number', 400);
            }
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Validation for structured query
export const structuredQueryValidation = (req, res, next) => {
    try {
        const { query, documentId } = req.body;

        if (!query || typeof query !== 'object') {
            return Response.fail(res, 'Query object is required', 400);
        }

        const { operation, field } = query;
        if (!operation || !field) {
            return Response.fail(res, 'Query must contain operation and field', 400);
        }

        const validOperations = ['sum', 'avg', 'min', 'max', 'count'];
        if (!validOperations.includes(operation)) {
            return Response.fail(res, `Operation must be one of: ${validOperations.join(', ')}`, 400);
        }

        if (typeof field !== 'string' || field.trim().length < 1) {
            return Response.fail(res, 'Field must be a non-empty string', 400);
        }

        if (!documentId || isNaN(parseInt(documentId))) {
            return Response.fail(res, 'Document ID is required and must be a valid number', 400);
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Validation for document search
const searchDocumentValidation = celebrate({
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.number().integer().required().messages({
            'any.required': 'Document ID is required',
            'number.base': 'Document ID must be a number',
            'number.integer': 'Document ID must be an integer'
        })
    }),
    [Segments.QUERY]: Joi.object().keys({
        query: Joi.string().required().messages({
            'any.required': 'Search query is required'
        }),
        limit: Joi.number().integer().min(1).max(100).default(10).messages({
            'number.base': 'Limit must be a number',
            'number.integer': 'Limit must be an integer',
            'number.min': 'Limit must be at least 1',
            'number.max': 'Limit cannot exceed 100'
        })
    })
});

/**
 * Validate update chat title request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const updateChatTitleValidation = (req, res, next) => {
    try {
        const { chatId } = req.params;
        const { title } = req.body;

        if (!chatId) {
            return Response.fail(res, 'Chat ID is required', 400);
        }

        if (!title || typeof title !== 'string' || title.trim().length < 1) {
            return Response.fail(res, 'Valid title is required', 400);
        }

        next();
    } catch (error) {
        return Response.fail(res, 'Invalid request parameters', 400);
    }
};

// Export the validation middleware
export {
    signupValidation,
    loginValidation,
    logoutValidation,
    uploadDocumentValidation,
    updateDocumentValidation,
    getDocumentStatusValidation,
    deleteDocumentValidation
};
