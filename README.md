# MySecondBrain.info Backend

A Retrieval Augmented Generation (RAG) system that leverages Weaviate as its vector database to efficiently retrieve answers from uploaded documents in various formats.

## Features

- **Document Ingestion & Embedding Generation**
  - Supported Formats: PDF, DOCX, JSON, TXT
  - Automated pipeline for processing documents and generating embeddings
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
- **Document Processing**: Langchain, PDF.js, Mammoth (for DOCX)

## Project Structure

```
mysecondbrain.info-BE/
├── config/                 # Configuration files
├── cron/                   # Cron jobs
├── databases/              # Database connections and schemas
│   ├── mysql8/             # MySQL database
│   └── weaviate/           # Weaviate vector database
├── doc-store/              # Temporary document storage
├── middlewares/            # Express middlewares
├── routes/                 # API routes
│   └── controllers/        # Route controllers
├── services/               # Business logic
└── utils/                  # Utility functions
```

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

## Setup and Installation

### Prerequisites

- Node.js (v16+)
- MySQL 8
- Weaviate
- AWS S3 bucket
- OpenAI API key

### Environment Variables

Create a `.env.development` file with the following variables:

```
# Server Configuration
PORT=3000
NODE_ENV=development
SERVICE_NAME=mysecondbrain-backend
LOG_LEVEL=debug

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Database Configuration
DB_URI=mysql://username:password@localhost:3306/mysecondbrain

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=mysecondbrain.info

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Weaviate Configuration
WEAVIATE_SCHEME=http
WEAVIATE_HOST=localhost:8080
```

### Installation

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

4. Start the development server:
   ```
   npm run start:dev
   ```

## License

This project is licensed under the AGPL-3.0 License - see the LICENSE file for details.
