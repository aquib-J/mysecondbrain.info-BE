import express from 'express';
import bodyParser from 'body-parser';
import { StatusCodes } from 'http-status-codes';
import { PORT } from './config/env.js';
import cookieParser from 'cookie-parser';
import errorMiddleware from './middlewares/error.middleware.js'
// import arcjetMiddleware from './middlewares/arcjet.middleware.js'
import { errors } from 'celebrate';
import Response from './utils/Response.js';
import Logger from './utils/Logger.js';
import appRoute from './routes/app.routes.js';
import { initializeDatabase } from './databases/mysql8/sequelizeConnect.js';

const logger = new Logger();

const app = express();

app.get('/status', (req, res) => {
    logger.info('Checking application status');
    Response.success(res, 'Application is running', { status: true });
});

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// app.use(arcjetMiddleware);

// TODO: add AccessLog filter validation here

app.use(appRoute);

// Handle celebrate/validation errors
app.use(errors());

app.use(errorMiddleware);

// Catch-all error block
app.use((err, req, res, next) => {
    logger.error('Unhandled error occurred', { error: err });
    Response.fail(res, err.message, err.status || StatusCodes.INTERNAL_SERVER_ERROR, err.code, err);
});

// Initialize database connection
await initializeDatabase();

app.listen(PORT, () => {
    logger.info(`Application running on PORT ${PORT}`);
});

export default app;