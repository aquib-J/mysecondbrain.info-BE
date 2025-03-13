import { config } from "dotenv";

const environment = process.env.NODE_ENV || 'development';
const envFile = `.env.${environment}`;

config({ path: envFile });

// Export environment variables with defaults for all required variables
export const {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN,
    NODE_ENV = 'development',
    PORT = 3000,
    ARCJET_KEY,
    SERVICE_NAME = 'mysecondbrain-backend',
    LOG_LEVEL = 'info',
    DB_URI
} = process.env;