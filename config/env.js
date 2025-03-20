/* eslint-disable no-undef */
import { config } from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const environment = process.env.NODE_ENV || 'development';
const envFile = environment === 'development' ? '.env.development' : '.env.production';
config({ path: path.join(__dirname, '..', envFile) });

// Define defaults for JWT expiration
const DEFAULT_JWT_EXPIRES_IN = '24h'; // 1 day for access token
const DEFAULT_JWT_REFRESH_EXPIRES_IN = '7d'; // 7 days for refresh token

// Export environment variables with defaults for all required variables
export const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_S3_BUCKET_NAME,
    JWT_SECRET,
    JWT_EXPIRES_IN = DEFAULT_JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN = DEFAULT_JWT_REFRESH_EXPIRES_IN,
    NODE_ENV = 'development',
    PORT = 3500,
    ARCJET_KEY,
    SERVICE_NAME = 'mysecondbrain-backend',
    LOG_LEVEL = 'info',
    DB_URI,
    OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL,
    OPENAI_CHAT_MODEL,
    WEAVIATE_SCHEME = 'http',
    WEAVIATE_HOST = 'localhost:8080',
    WEAVIATE_API_KEY,
    REDIS_URL = 'redis://localhost:6379',
    USE_REDIS = NODE_ENV === 'production',
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_USER,
    EMAIL_PASSWORD,
    EMAIL_FROM,
    SEND_EMAILS,
    ADMIN_PASS
} = process.env;

// Ensure JWT expiration values are valid
console.log(`Access token expiry: ${JWT_EXPIRES_IN}, Refresh token expiry: ${JWT_REFRESH_EXPIRES_IN}`);

// Add validation
if (!DB_URI) throw new Error('DB_URI environment variable is required');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY environment variable is required');
if (!OPENAI_EMBEDDING_MODEL) throw new Error('OPENAI_EMBEDDING_MODEL environment variable is required');
if (!OPENAI_CHAT_MODEL) throw new Error('OPENAI_CHAT_MODEL environment variable is required');
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_S3_BUCKET_NAME) {
    throw new Error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET_NAME) are required');
}

// Required environment variables check for production
const requiredEnvVars = [
    'DB_URI',
    'JWT_SECRET',
    'OPENAI_API_KEY',
    'OPENAI_EMBEDDING_MODEL',
    'OPENAI_CHAT_MODEL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET_NAME',
    'WEAVIATE_SCHEME',
    'WEAVIATE_HOST'
];

// Add email password to required env vars for production if sending emails
if (NODE_ENV === 'production' && SEND_EMAILS === 'true') {
    requiredEnvVars.push('EMAIL_PASSWORD');
}

// Check required env vars in production
if (NODE_ENV === 'production') {
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length) {
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
}
