import { config } from "dotenv";

const environment = process.env.NODE_ENV || 'development';
const envFile = `.env.${environment}`;

config({ path: envFile });

// Export environment variables with defaults for all required variables
export const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_S3_BUCKET_NAME,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN,
    NODE_ENV = 'development',
    PORT = 3000,
    ARCJET_KEY,
    SERVICE_NAME = 'mysecondbrain-backend',
    LOG_LEVEL = 'info',
    DB_URI,
    OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL,
    OPENAI_CHAT_MODEL,
    WEAVIATE_SCHEME = 'http',
    WEAVIATE_HOST = 'localhost:8080'
} = process.env;
