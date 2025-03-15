import { StatusCodes } from "http-status-codes";
import { isCelebrateError } from "celebrate";
import Logger from '../utils/Logger.js';

const logger = new Logger();

const errorMiddleware = (err, req, res, next) => {
    try {
        let error = { ...err };

        error.message = err.message;

        logger.error('Error retrieving document status', { error: err });


        /**
    * Handle some 401 || generic unauthorized due to middleware jwt/validation || bcrypt auth?
    */
        if (err.name === 'UnauthorizedError') {
            return Response.fail(res, err.message, err.status);
        }
        /**
         * Handle errors originating from celebrate/Joi
         */
        if (isCelebrateError(err)) {
            return Response.fail(res, err.message, StatusCodes.UNPROCESSABLE_ENTITY, StatusCodes.UNPROCESSABLE_ENTITY, {
                errors: err.details,
            });
        }
        // Handle multer error
        if (err.name === 'MulterError') {
            return Response.fail(res, err.message, StatusCodes.UNPROCESSABLE_ENTITY);
        }

        // Mongoose bad ObjectId
        if (err.name === 'CastError') {
            return Response.fail(res, 'Resouce not found', StatusCodes.NOT_FOUND)
        }

        // Mongoose duplicate key
        if (err.code === 11000) {
            return Response.fail(res, 'Duplicate field value entered', StatusCodes.BAD_REQUEST)
        }

        // Mongoose validation error
        if (err.name === 'ValidationError') {
            const message = Object.values(err.errors).map(val => val.message);
            return Response.fail(res, message.join(', '), StatusCodes.BAD_REQUEST);
        }

        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Server Error' });
    } catch (error) {
        next(error);
    }
};

export default errorMiddleware;