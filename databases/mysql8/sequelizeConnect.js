import { Sequelize } from 'sequelize';
import { DB_URI } from '../../config/env.js';
import Logger from '../../utils/Logger.js';

const logger = new Logger();

const sequelize = new Sequelize(DB_URI, {
    dialect: 'mysql',
    dialectOptions: {
        // Add any MySQL-specific options here
        connectTimeout: 60000,
        // For handling timezone issues
        timezone: '+00:00'
    },
    logging: (msg) => logger.debug(msg),
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

export const initializeDatabase = async () => {
    try {
        await sequelize.authenticate();
        logger.info('Database connection has been established successfully.');
    } catch (error) {
        logger.error('Unable to connect to the database:', error);
        throw error;
    }
};

export default sequelize;
