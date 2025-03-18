import winston from 'winston';
import { SERVICE_NAME, LOG_LEVEL } from '../config/env.js';
import { AsyncLocalStorage } from 'async_hooks';

// Create async local storage to hold request context
export const requestContext = new AsyncLocalStorage();

let LoggerInstance = null;

export default class Logger {
    constructor() {
        if (!LoggerInstance) {
            this.init({ level: LOG_LEVEL });
        }
    }

    init({ transports = [], level = 'info', defaultMeta = {} } = {}) {
        const loggerLevels = {
            fatal: 0,
            alert: 1,
            error: 2,
            warning: 3,
            info: 4,
            debug: 5,
            trace: 6,
        };

        const loggerColors = {
            fatal: 'blue',
            alert: 'magenta',
            error: 'red',
            warning: 'yellow',
            info: 'green',
            debug: 'cyan',
            trace: 'white',
        };

        // Add default transports if none are provided
        if (transports.length === 0) {
            transports.push(
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple(),
                    ),
                }),
            );
        }

        // Set default metadata
        if (!defaultMeta.service) {
            defaultMeta.service = SERVICE_NAME;
        }

        // Add colors to winston
        winston.addColors(loggerColors);

        // Create the logger instance
        LoggerInstance = winston.createLogger({
            level: level,
            levels: loggerLevels,
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss',
                }),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                winston.format.json(),
                winston.format.printf(
                    (info) =>
                        `@${info.timestamp} - ${info.level}: ${info.message} ${this.stringifyExtraMessageProperties(info)}`,
                ),
            ),
            transports,
            defaultMeta,
        });

        return LoggerInstance;
    }

    // Get the current request ID from context
    getRequestId() {
        const store = requestContext.getStore();
        return store?.requestId;
    }

    // Add request context to log metadata
    addRequestContext(meta = {}) {
        const requestId = this.getRequestId();
        if (requestId && !meta.requestId) {
            meta.requestId = requestId;
        }
        return meta;
    }

    // Instance methods
    log(level, message, meta = {}) {
        if (!LoggerInstance) {
            this.init();
        }
        // Automatically add request context
        const enrichedMeta = this.addRequestContext(meta);
        LoggerInstance.log(level, message, enrichedMeta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    error(message, meta = {}) {
        // Handle direct Error instance
        if (meta instanceof Error) {
            message = meta.message;
            meta = { stack: meta.stack, name: meta.name };
        }
        // Handle error property in meta object
        else if (meta.error instanceof Error) {
            meta = {
                ...meta,
                error: {
                    message: meta.error.message,
                    stack: meta.error.stack,
                    name: meta.error.name
                }
            };
        }
        // Handle empty error object (which might cause TypeError on properties)
        else if (meta.error && Object.keys(meta.error).length === 0) {
            meta.error = { message: 'Empty error object' };
        }

        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warning', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    // Static methods
    static getInstance() {
        if (!LoggerInstance) {
            new Logger();
        }
        return LoggerInstance;
    }

    static getRequestId() {
        const store = requestContext.getStore();
        return store?.requestId;
    }

    static log(level, message, meta = {}) {
        if (typeof meta !== 'object') {
            meta = { meta };
        }

        // Get a logger instance and add request context
        const logger = new Logger();
        const enrichedMeta = logger.addRequestContext(meta);
        Logger.getInstance().log(level, message, enrichedMeta);
    }

    static info(message, meta = {}) {
        Logger.log('info', message, meta);
    }

    static error(message, meta = {}) {
        Logger.log('error', message, meta);
    }

    static warn(message, meta = {}) {
        Logger.log('warning', message, meta);
    }

    static debug(message, meta = {}) {
        Logger.log('debug', message, meta);
    }

    static stream() {
        return {
            write: (message) => Logger.getInstance().info(message.trim()),
        };
    }

    stringifyExtraMessageProperties(info) {
        const skippedProps = ['message', 'timestamp', 'level'];
        let response = '';
        for (const key in info) {
            const value = info[key];
            if (!skippedProps.includes(key) && value !== undefined && value !== null) {
                // Handle complex objects (like error objects with stack traces)
                if (typeof value === 'object') {
                    try {
                        const safeValue = JSON.stringify(value, (key, val) => {
                            // Prevent circular references
                            if (val !== null && typeof val === 'object' && Object.keys(val).length > 20) {
                                return '[Complex Object]';
                            }
                            return val;
                        });
                        response += `${key}=${safeValue} `;
                    } catch (e) {
                        // If JSON stringify fails, provide a simpler representation
                        response += `${key}=${Object.keys(value).join(',')} `;
                    }
                } else {
                    response += `${key}=${value} `;
                }
            }
        }
        return response.trim();
    }
}