[![Deploy to DigitalOcean](https://github.com/aquib-J/mysecondbrain.info-BE/actions/workflows/deploy.yml/badge.svg)](https://github.com/aquib-J/mysecondbrain.info-BE/actions/workflows/deploy.yml)

[![DigitalOcean Referral Badge](https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%203.svg)](https://www.digitalocean.com/?refcode=c51852fd64c7&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge)

# MySecondBrain.info

A Retrieval Augmented Generation (RAG) system hosted at [https://mysecondbrain.info](https://mysecondbrain.info) that leverages Weaviate as its vector database to efficiently retrieve answers from uploaded documents in various formats.

## About

MySecondBrain.info is inspired by the concept of a "second brain" - the idea of offloading information storage to an external system while maintaining easy retrieval of that information when needed. This project aims to create a fun and effective way to store, process, and retrieve information from various document formats using modern AI techniques.

**Note:** This project is a work in progress, with additional features and improvements planned for the roadmap. Future updates will include enhanced document processing, more sophisticated querying capabilities, and improved UI/UX.

## Features

- **Document Ingestion & Embedding Generation**
  - Supported Formats: PDF, DOCX, JSON, TXT, HTML
  - Dual processing pipeline (Python script or native JS parsers)
  - Automated fallback mechanism for resilient document processing
  - Storage of embeddings in Weaviate

- **Question-Answer API**
  - Query documents and get relevant answers
  - Support for both semantic search and structured queries (for JSON documents)

- **JSON Data RAG Extension**
  - Support for structured queries on JSON data
  - Aggregation operations (max, min, sum, avg)

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL 8 (for relational data), Weaviate (for vector storage)
- **Storage**: AWS S3 (for document storage)
- **AI**: OpenAI API (for embeddings and completions)
- **Document Processing**: 
  - Python script for primary processing
  - Native JS parsers as backup (PDF.js, Mammoth for DOCX)
  - Factory pattern for extensible document parsing

## Project Structure

```
mysecondbrain.info-BE/
├── config/                 # Configuration files
├── cron/                   # Cron jobs
├── databases/              # Database connections and schemas
│   ├── mysql8/             # MySQL database
│   ├── redis/              # Redis connection for caching and rate limiting
│   └── weaviate/           # Weaviate vector database
├── doc-store/              # Temporary document storage
├── docs/                   # System documentation
├── middlewares/            # Express middlewares
├── routes/                 # API routes
│   └── controllers/        # Route controllers
├── scripts/                # Python scripts for document processing
├── services/               # Business logic
│   ├── document.parser.factory.js    # Factory for document parsers
│   ├── document.processor.service.js # Document processing orchestration
│   ├── json.parser.service.js        # JSON specific parsing
│   ├── pdf.service.js                # PDF specific parsing
│   ├── vectorization.service.js      # Vector creation and storage
│   └── weaviate.service.js           # Vector database interactions
└── utils/                  # Utility functions
```

## API Documentation

API specifications are available via Swagger UI at: `http://localhost:3500/api-docs`

The JSON collection for the API documentation is accessible at: `http://localhost:3500/api-docs.json`

## API Endpoints

### Authentication

- `POST /api/v1/auth/signup` - Create a new user account
- `POST /api/v1/auth/login` - Login to an existing account
- `GET /api/v1/auth/logout` - Logout from the current session

### Documents

- `POST /api/v1/documents/upload` - Upload a new document
- `POST /api/v1/documents/update/:documentId` - Update an existing document
- `GET /api/v1/documents/list` - List all documents for the current user
- `GET /api/v1/documents/download/:documentId` - Get a download URL for a document
- `GET /api/v1/documents/status/:documentId` - Check the processing status of a document
- `DELETE /api/v1/documents/delete/:documentId` - Delete a document

### Chats

- `POST /api/v1/chats` - Create a new chat
- `GET /api/v1/chats/:chatId` - Get a specific chat
- `GET /api/v1/chats` - List all chats for the current user
- `DELETE /api/v1/chats/:chatId` - Delete a chat
- `POST /api/v1/chats/query` - Query documents and get an answer
- `POST /api/v1/chats/structured-query` - Perform structured query on JSON documents

## Document Processing Architecture

MySecondBrain uses a dual-pipeline approach for document processing:

1. **Primary Pipeline**: Python-based processor for PDF, TXT, and JSON files
   - Handles chunking, metadata extraction, and structure preservation
   - Outputs standardized JSON format for vectorization

2. **Secondary Pipeline**: Native JavaScript parsers
   - Factory pattern implementation with `DocumentParserFactory`
   - Support for PDF, DOCX, TXT, JSON, and HTML formats
   - Automatic fallback if Python processor fails

The system can be configured to prefer either pipeline through the `documentProcessorService.setUseNativeParser()` method.

### Adding New Document Types

To add support for a new document type:

1. Implement a parser method in `document.parser.factory.js`
2. Update the `isSupported` method to include the new file type
3. Add a case in the `parseDocument` switch statement

## Weaviate Service Architecture

The Weaviate service has been refactored to improve maintainability and testability. The original monolithic service has been split into several specialized modules with clear responsibilities:

1. `weaviate-client.js` - HTTP client for Weaviate API
2. `weaviate-schema.js` - Schema and tenant management
3. `weaviate-query.js` - GraphQL query builder
4. `weaviate.service.js` - Business logic for vector operations

### Benefits

- **Improved Separation of Concerns**: Each module now has a clear, focused responsibility
- **Better Testability**: Modules can be tested independently
- **More Robust Error Handling**: Consistent error handling patterns across modules
- **Easier Maintenance**: Smaller, more focused files are easier to understand and modify
- **No Library Dependency**: Direct HTTP calls instead of relying on the problematic client library

### Module Descriptions

#### weaviate-client.js

This module provides a low-level HTTP client for communicating with the Weaviate API. It handles:

- HTTP requests to the Weaviate API
- Authentication and headers
- Basic error handling
- Response formatting

#### weaviate-schema.js

This module handles schema and tenant management:

- Class definitions for Document and JsonDocument
- Class initialization and updates
- Tenant creation and validation

#### weaviate-query.js

This module builds GraphQL queries for different operations:

- Similarity search queries
- Structured queries for numeric operations
- Group by queries
- Delete mutations

#### weaviate.service.js

This is the main business logic layer that uses the other modules:

- Vector storage and retrieval
- JSON document processing
- Similarity search
- Structured queries
- Data deletion

## Setup and Installation

### Prerequisites

- Node.js *(lts/hydrogen -> v18.20.7)*
- MySQL 8
- Weaviate [docker container deployed locally]
- AWS S3 bucket
- OpenAI API key
- Python 3.8+ (for document processing script)

### Environment Variables

Create a `.env.development` file with the variables specified in the example:

```bash
cp .env.development.example .env.development
# Edit the file with your actual configuration
```

For a complete list of all environment variables and their configurations, see [Environment Variables Documentation](./docs/env-variables.md).

### Manual Installation

1. Clone the repository:
   ```
   git clone https://github.com/aquib-J/mysecondbrain.info-BE.git
   cd mysecondbrain.info-BE
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up the database:
   ```
   # Run the SQL queries in db-schema.queries.sql
   ```

4. Set up the Python script:
   ```
   # Make the Python script executable
   chmod +x scripts/pdf_processor.py
   
   # Install Python dependencies
   pip install -r scripts/requirements.txt
   ```

5. Start the development server:
   ```
   npm run start:dev
   ```

### Docker Installation (Recommended)

For a faster and more consistent setup, use Docker:

1. Ensure Docker and Docker Compose are installed on your system
2. Set up environment variables:
   ```bash
   cp .env.development.example .env.development
   # Edit the file with your actual configuration
   ```
3. Start the application stack:
   ```bash
   docker compose up -d
   ```
4. To check the application logs:
   ```bash
   docker compose logs -f api
   ```
5. To stop all services:
   ```bash
   docker compose down
   ```
For detailed instructions on deployment, scaling, and maintenance using Docker, see our comprehensive [Deployment Guide](./docs/deployment.md).

## Production Deployment with SSL

For production deployment with HTTPS support, we've integrated Certbot with Nginx to provide automatic SSL certificate generation and renewal.

### Prerequisites

- A registered domain name pointing to your server IP address
- Ports 80 and 443 accessible from the internet
- Docker and Docker Compose installed

### Environment Variables

You can customize the SSL setup using these environment variables:

- `DOMAIN`: Your domain name (default: api.mysecondbrain.info)
- `EMAIL`: Email for Let's Encrypt registration (default: aquib.jansher@gmail.com)
- `STAGING`: Set to 1 for testing (avoid rate limits) or 0 for production

### SSL Setup

1. **Initialize SSL certificates**:

   ```bash
   # Optional: Set custom domain and email
   export DOMAIN=your-domain.com
   export EMAIL=your-email@example.com
   
   # Run the initialization script
   ./nginx/init-letsencrypt.sh
   ```

   This script will:
   - Create temporary self-signed certificates
   - Start Nginx with these certificates
   - Use Certbot to request proper Let's Encrypt certificates
   - Reload Nginx to use the new certificates
   - Create a `.env.ssl` file for future use

2. **Start the application with SSL**:

   ```bash
   # Using the environment file created during initialization
   docker compose --env-file .env.ssl -f docker-compose.production.yml up -d
   ```

3. **Certificate renewal**:

   Certificates are automatically renewed by the Certbot container every 12 hours.
   For manual renewal:

   ```bash
   ./nginx/renew-certs.sh
   ```

### SSL Architecture

The SSL implementation consists of:

1. **Nginx Container**:
   - Terminates TLS connections
   - Serves as a reverse proxy to the API
   - Handles HTTP to HTTPS redirection
   - Exposes paths needed for certificate validation

2. **Certbot Container**:
   - Obtains and renews SSL certificates
   - Uses the webroot plugin for domain validation
   - Stores certificates in a Docker volume shared with Nginx

3. **Configuration Files**:
   - `nginx/templates/nginx.conf.template`: Template for Nginx configuration with environment variable substitution
   - `nginx/init-letsencrypt.sh`: Script for initial certificate setup
   - `nginx/renew-certs.sh`: Script for manual certificate renewal

### Security Features

Our SSL implementation includes:

- TLS 1.2/1.3 only (older protocols disabled)
- Strong cipher suite configuration
- HTTP Strict Transport Security (HSTS)
- OCSP stapling for certificate validation
- Modern security headers (X-Frame-Options, Content-Security-Policy, etc.)
- Automatic redirection from HTTP to HTTPS

## System Maintenance

If you're setting up or managing the system, start with:

1. Review the environment variables documentation to ensure proper configuration
2. Set up log archiving for production deployments to ensure data retention

## Detailed Documentation Files

| Document | Description |
|----------|-------------|
| [Environment Variables](./docs/env-variables.md) | Complete list of all environment variables used by the system, their defaults, and which ones are required. |
| [Log Archiving](./docs/log-archiving.md) | Detailed guide on the log archiving system, including AWS S3 configuration, scheduling, and monitoring. |



# MySecondBrain.info API

This is the backend API for MySecondBrain.info, a comprehensive knowledge management and note-taking application.

## Features

- User authentication with JWT
- Redis-based email queue system
- Amazon RDS MySQL database integration
- Weaviate vector database for semantic search
- Automated SSL certificate management with Let's Encrypt
- GitHub Actions-based CI/CD pipeline

## Email Queue System

The application includes a robust, Redis-based email queue system designed to handle email sending in a non-blocking, fault-tolerant manner.

### Key Features

- **Non-blocking operation**: Email sending happens asynchronously via a queue
- **Automatic retries**: Failed emails are automatically retried with exponential backoff
- **Dead letter queue**: Persistently failed emails are stored for inspection and manual retry
- **Admin API endpoints**: Monitor and manage the email queue via admin endpoints
- **Email service health monitoring**: Status checks and diagnostics available through scripts

### Queue Architecture

The email queue system consists of three primary queues:

1. **Main Queue** (`email:queue`): New email jobs are added here for processing
2. **Processing Queue** (`email:processing:*`): Temporary storage for emails being processed
3. **Dead Letter Queue** (`email:deadletter`): Storage for emails that failed after multiple retry attempts

### Admin API Endpoints

The following endpoints are available for queue management (admin only):

- `GET /api/v1/admin/email/queue/stats` - Get queue statistics
- `GET /api/v1/admin/email/queue/dead` - List failed emails
- `POST /api/v1/admin/email/queue/retry/:jobId` - Retry a specific failed email
- `DELETE /api/v1/admin/email/queue/dead` - Clear the dead letter queue

### Testing and Monitoring

Testing scripts are available in the `scripts` directory:

- `scripts/test-email-service.js` - Send a direct test email using the email service
- `scripts/test-email-queue.js` - Test the email queue system with sample emails
- `scripts/email-queue-status.js` - Comprehensive tool for queue monitoring and management

#### Example Usage

```bash
# Test direct email sending
node scripts/test-email-service.js production

# Test the email queue system with sample emails
node scripts/test-email-queue.js production

# Check email queue status
node scripts/email-queue-status.js production status

# Get detailed debugging info about the email queue
node scripts/email-queue-status.js production debug

# Retry all failed emails
node scripts/email-queue-status.js production retry-all

# Clear the dead letter queue
node scripts/email-queue-status.js production clear
```

## Environment Configuration

The application supports multiple environments through `.env.*` files:

- `.env.development` - Development environment settings
- `.env.test` - Test environment settings
- `.env.production` - Production environment settings

### Required Variables

Key environment variables for proper operation include:

```
# Core settings
PORT=3000
NODE_ENV=production || development
SERVICE_NAME=mysecondbrain-api
LOG_LEVEL=info
ENABLE_CRON_JOBS=true

# Database settings (Amazon RDS)
DB_HOST=your-rds-instance.region.rds.amazonaws.com
DB_PORT=3306
DB_NAME=mysecondbrain
DB_USER=dbuser
DB_PASSWORD=dbpassword

# Redis settings
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Email settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=no-reply@mysecondbrain.info
SEND_EMAILS=true

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=3600
ADMIN_PASS=admin-password-hash

# Domain configuration
DOMAIN=api.mysecondbrain.info
```

## Deployment

The application is deployed using Docker Compose and a GitHub Actions workflow. The deployment process includes:

1. Amazon RDS connection testing
2. Redis connection verification
3. SSL certificate management with Let's Encrypt
4. Docker container deployment and orchestration

### Docker Services

- Node.js Express application
- Redis for caching and queue management
- Weaviate vector database
- Nginx for reverse proxy and SSL termination

## Development

### Prerequisites

- Node.js 18+ (lts/hydrogen)
- Docker and Docker Compose
- MySQL (local development) or Amazon RDS connection

### Setup

1. Clone the repository
2. Create appropriate `.env.*` files
3. Install dependencies: `npm install`
4. Start development server: `npm run dev`

### Testing

- Run unit tests: `npm test`
- Test email service: `node scripts/test-email-service.js development`
- Test email queue: `node scripts/test-email-queue.js development`




## Contributing to Documentation

When adding new features to the system, please update the main README.md file and add detailed documentation here as needed.

Documentation should be written in Markdown format and follow these guidelines:

- Use clear, concise language
- Include code examples when relevant
- Provide troubleshooting tips where appropriate
- Link to related documentation when applicable 

## License

This project is licensed under the AGPL-3.0 License - see the LICENSE file for details.
