import { celebrate, Joi, Segments } from 'celebrate';

// Validation for signup
const signupValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        email: Joi.string().email().required().messages({
            'string.email': 'Email must be a valid email address',
            'any.required': 'Email is required'
        }),
        username: Joi.string().alphanum().min(3).max(30).required().messages({
            'string.alphanum': 'Username must be alphanumeric',
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
        filetype: Joi.string().valid(
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/json',
        ).required().messages({
            'any.required': 'File type is required',
            'any.only': 'File type must be one of the following: pdf, doc, docx, json'
        }),
    }),
});

// Validation for document update
const updateDocumentValidation = celebrate({
    [Segments.BODY]: Joi.object().keys({
        filename: Joi.string().optional()
    }),
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.string().required().messages({
            'any.required': 'Document ID is required'
        }).required()
    })
});

// Validation for getting document status
const getDocumentStatusValidation = celebrate({
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.string().required().messages({
            'any.required': 'Document ID is required'
        })
    })
});

// Validation for deleting document
const deleteDocumentValidation = celebrate({
    [Segments.PARAMS]: Joi.object().keys({
        documentId: Joi.string().required().messages({
            'any.required': 'Document ID is required'
        })
    })
});

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
