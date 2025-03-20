# Environment Variables Configuration Guide

This document provides a comprehensive list of environment variables used in the MySecondBrain.info backend application.

## Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Application environment | `development` | No |
| `PORT` | Port to run the application | `3500` | No |
| `SERVICE_NAME` | Name of the service for logging | `mysecondbrain-backend` | No |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` | No |
| 

## Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_URI` | Database connection URI | N/A | **Yes** |

## Authentication

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret key for JWT tokens | N/A | **Yes** in production |
| `JWT_EXPIRES_IN` | JWT token expiration time | `24h` | No |
| `JWT_REFRESH_EXPIRES_IN` | JWT refresh token expiration | `7d` | No |
| `ARCJET_KEY` | API key for Arcjet rate limiting | N/A | No |

## OpenAI Integration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API key | N/A | **Yes** |
| `OPENAI_EMBEDDING_MODEL` | Model name for embeddings | N/A | **Yes** |
| `OPENAI_CHAT_MODEL` | Model name for chat completions | N/A | **Yes** |

## AWS S3 Configuration

The following AWS environment variables are **required** for file storage and log archiving functionality:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AWS_ACCESS_KEY_ID` | AWS access key | N/A | **Yes** |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | N/A | **Yes** |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) | N/A | **Yes** |
| `AWS_S3_BUCKET_NAME` | S3 bucket name for file uploads and log archives | N/A | **Yes** |

### S3 Storage Organization

Files in S3 are organized using the following structure:

- `/documents/{userId}/{uuid}.{extension}` - Uploaded documents
- `/logs/{date}/{logfile}` - Archived log files

### Log Archiving

Log files are automatically archived to S3 daily using the following configuration:

- Archive schedule: Daily at 1:00 AM UTC
- Archive age threshold: Files older than 24 hours
- Prefix in S3: `logs/{YYYY-MM-DD}/`
- Files aren't deleted locally after archiving by default

## Vector Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WEAVIATE_SCHEME` | Weaviate connection protocol | `http` | No |
| `WEAVIATE_HOST` | Weaviate host and port | `localhost:8080` | No |

## Redis Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` | No |
| `USE_REDIS` | Enable Redis caching | `true` in prod | No |

## Email Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EMAIL_HOST` | SMTP server host | N/A | No* |
| `EMAIL_PORT` | SMTP server port | N/A | No* |
| `EMAIL_USER` | SMTP username | N/A | No* |
| `EMAIL_PASSWORD` | SMTP password | N/A | **Yes** if sending emails |
| `EMAIL_FROM` | Sender email address | N/A | No* |
| `SEND_EMAILS` | Enable email sending | `false` | No |

\* Required if `SEND_EMAILS` is set to `true`

## Admin Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ADMIN_PASS` | Admin password | N/A | No |

## Setting Up for Log Archiving

To enable log archiving to AWS S3:

1. Create an S3 bucket in your AWS account
2. Create an IAM user with permissions to write to this bucket
3. Set the following environment variables:
   ```
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=your_region
   AWS_S3_BUCKET_NAME=your_bucket_name
   ```
4. Logs will be automatically archived daily at 1:00 AM UTC 