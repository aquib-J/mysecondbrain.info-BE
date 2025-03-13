import winston from 'winston';
import { SERVICE_NAME, LOG_LEVEL } from '../config/env.js';

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

    // Instance methods
    log(level, message, meta = {}) {
        if (!LoggerInstance) {
            this.init();
        }
        LoggerInstance.log(level, message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    error(message, meta = {}) {
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

    static log(level, message, meta = {}) {
        if (typeof meta !== 'object') {
            meta = { meta };
        }
        Logger.getInstance().log(level, message, meta);
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
                response += `${key}=${value} `;
            }
        }
        return response.trim();
    }
}