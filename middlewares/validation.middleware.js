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

// Export the validation middleware
export { signupValidation, loginValidation, logoutValidation };
