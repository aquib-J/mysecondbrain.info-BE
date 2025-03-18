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

- Node.js (v16+)
- MySQL 8
- Weaviate
- AWS S3 bucket
- OpenAI API key
- Python 3.8+ (for document processing script)

### Environment Variables

Create a `.env.development` file with the variables specified in the `.env.sample` file.

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

## License

This project is licensed under the AGPL-3.0 License - see the LICENSE file for details.
