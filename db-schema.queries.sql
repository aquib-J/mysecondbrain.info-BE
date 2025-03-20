CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, -- Unique user identifier
    email VARCHAR(255) NOT NULL UNIQUE,            -- User email (unique and mandatory)
    username VARCHAR(50) NOT NULL,                 -- Username (mandatory, no longer unique)
    password_hash CHAR(64) NOT NULL,               -- Hashed password (mandatory)
    metadata JSON,                                 -- Additional user metadata
    signup_ip_address VARCHAR(45),                 -- IP address during signup
    signup_user_location VARCHAR(45),              -- Location of the user during signup
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of creation
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    is_active TINYINT(1) NOT NULL DEFAULT 1        -- User status (1 for active, 0 for inactive)
);

CREATE TABLE refresh_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique token identifier
    user_id INT UNSIGNED NOT NULL,                      -- Reference to users table
    refresh_token VARCHAR(512) NOT NULL,                -- Refresh token value
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,     -- Timestamp of token creation
    expires_at TIMESTAMP NOT NULL,                      -- Timestamp of token expiration
    is_active TINYINT(1) NOT NULL DEFAULT 1,            -- Token status (1 for active, 0 for inactive)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- Relationship to users table
);

CREATE TABLE documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, -- Unique document identifier
    filename VARCHAR(255) NOT NULL,                     -- Name of the uploaded file
    filesize BIGINT UNSIGNED NOT NULL,                  -- Size of the file in bytes
    pages INT UNSIGNED,                                 -- Number of pages in the document
    uploaded_by INT UNSIGNED NOT NULL,                  -- User who uploaded the document
    s3_upload_url VARCHAR(512) NOT NULL,                -- S3 URL for the document
    file_type ENUM('pdf', 'doc', 'docx', 'json', 'txt') NOT NULL, -- Type of file
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    -- Timestamp of upload
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    deleted_at TIMESTAMP NULL DEFAULT NULL,             -- Timestamp of deletion (nullable)
    status ENUM('active', 'deleted') DEFAULT 'active',  -- Document status
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE -- Relationship to users table
);

CREATE TABLE jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique job identifier
    doc_id INT UNSIGNED NOT NULL,                       -- Reference to documents table
    job_type VARCHAR(50),                               -- Type of job
    service VARCHAR(16) DEFAULT 'secondbrain',          -- Service name
    resource VARCHAR(255) NOT NULL,                     -- Resource identifier (e.g., S3 URL)
    status ENUM('pending', 'in_progress', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'pending', -- Job status
    metadata JSON,                                      -- Additional metadata for the job
    started_at TIMESTAMP NULL DEFAULT NULL,             -- Timestamp when job started
    completed_at TIMESTAMP NULL DEFAULT NULL,           -- Timestamp when job completed
    output JSON DEFAULT NULL,                           -- Job output
    error_message TEXT DEFAULT NULL,                    -- Error message if job failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,     -- Timestamp of creation
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    cancelled_at TIMESTAMP NULL DEFAULT NULL,           -- Timestamp when job was cancelled
    UNIQUE KEY unique_job (id, doc_id, status),         -- Unique constraint
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE -- Relationship to documents table
);

CREATE TABLE vectors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique vector identifier
    job_id INT UNSIGNED NOT NULL,                       -- Reference to jobs table
    vector_id BINARY(16) NOT NULL,                      -- Binary UUID for the vector
    embedding_id INT UNSIGNED NOT NULL,                 -- Reference to embedding provider
    text_content TEXT,                                  -- Text content for the vector
    embedding JSON NOT NULL,                            -- Vector embedding data
    metadata JSON DEFAULT NULL,                         -- Additional metadata
    is_active TINYINT(1) NOT NULL DEFAULT 1,            -- Active status (1 for active, 0 for inactive)
    status ENUM('in_progress', 'success', 'failed') NOT NULL DEFAULT 'in_progress', -- Vector status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,     -- Timestamp of creation
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE -- Relationship to jobs table
);

CREATE TABLE ai_providers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique provider identifier
    provider VARCHAR(20) NOT NULL,                      -- Name of the AI provider (e.g., OpenAI)
    task VARCHAR(20) NOT NULL,                          -- Task performed by the provider (e.g., embedding)
    model VARCHAR(36) NOT NULL,                         -- Model used by the provider (e.g., text-embedding-ada-002)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,     -- Timestamp of creation
    UNIQUE KEY (provider, model)                        -- Unique constraint on provider and model
);

CREATE TABLE chats (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique chat identifier
    user_id INT UNSIGNED NOT NULL,                      -- Reference to users table
    chat_id VARCHAR(36) NOT NULL,                       -- UUID for the chat (no longer unique)
    title VARCHAR(100) NOT NULL,                        -- Chat title
    messages JSON DEFAULT (JSON_ARRAY()),               -- Chat messages stored as JSON
    type ENUM('user', 'system') NOT NULL DEFAULT 'user', -- Type of chat
    metadata JSON,                                      -- Additional metadata
    status ENUM('active', 'deleted') DEFAULT 'active',  -- Chat status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,     -- Timestamp of creation
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    deleted_at TIMESTAMP NULL DEFAULT NULL,             -- Timestamp of deletion (nullable)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- Relationship to users table
);

-- Create indexes for chats table
CREATE INDEX idx_chat_id ON chats(chat_id);
CREATE INDEX idx_user_id ON chats(user_id);

-- Insert sample data for AI providers
INSERT INTO ai_providers (provider, task, model) 
VALUES ('OpenAI', 'embedding', 'text-embedding-ada-002');