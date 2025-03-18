CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, -- Unique user identifier
    email VARCHAR(255) NOT NULL UNIQUE,            -- User email (unique and mandatory)
    username VARCHAR(50) NOT NULL UNIQUE,          -- Username (unique and mandatory)
    password_hash CHAR(64) NOT NULL,               -- Hashed password (mandatory)
    metadata JSON,                                 -- Additional user metadata
    signup_ip_address VARCHAR(45),                 -- IP address during signup
    signup_user_location VARCHAR(45),             -- Location of the user during signup
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of creation
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    is_active TINYINT(1) NOT NULL DEFAULT 1           -- User status (1 for active, 0 for inactive)
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
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    -- Timestamp of upload
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    deleted_at TIMESTAMP NULL DEFAULT NULL,             -- Timestamp of deletion (nullable)
    status ENUM('active', 'deleted') DEFAULT 'active',  -- Document status
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE -- Relationship to users table
);

CREATE TABLE jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique job identifier
    doc_id INT UNSIGNED NOT NULL,                       -- Reference to documents table
    service VARCHAR(16) DEFAULT 'secondbrain',          -- Service name
    -- namespace VARCHAR(32) NOT NULL,                     -- Namespace for the job
    resource VARCHAR(255) NOT NULL,                      -- Resource identifier (e.g., S3 URL)
    status ENUM('pending', 'in_progress', 'success', 'failed') NOT NULL DEFAULT 'pending', -- Job status
    metadata JSON,                                      -- Additional metadata for the job
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,        -- Timestamp of creation
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    UNIQUE KEY (service, doc_id),                       -- Unique constraint on service and doc_id
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE -- Relationship to documents table
);

CREATE TABLE vectors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique vector identifier
    job_id INT UNSIGNED NOT NULL,                       -- Reference to jobs table
    vector_id BINARY(16) NOT NULL,                      -- Binary UUID for the vector
    embedding_id INT UNSIGNED NOT NULL,                 -- Reference to embedding provider
    text_content TEXT,                                  -- Text content for the vector
    is_active TINYINT(1) NOT NULL DEFAULT 1,            -- Active status (1 for active, 0 for inactive)
    status ENUM('in_progress', 'success', 'failed') NOT NULL DEFAULT 'in_progress', -- Vector status
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,        -- Timestamp of creation
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE -- Relationship to jobs table
);

CREATE TABLE ai_providers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique provider identifier
    provider VARCHAR(20) NOT NULL,                      -- Name of the AI provider (e.g., OpenAI)
    task VARCHAR(20) NOT NULL,                          -- Task performed by the provider (e.g., embedding)
    model VARCHAR(36) NOT NULL,                         -- Model used by the provider (e.g., text-embedding-ada-002)
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,        -- Timestamp of creation
    UNIQUE KEY (provider, model)                        -- Unique constraint on provider and model
);

-- Insert sample data for AI providers
INSERT INTO ai_providers (provider, task, model) 
VALUES ('OpenAI', 'embedding', 'text-embedding-ada-002');

ALTER TABLE jobs
ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE jobs MODIFY status ENUM('pending', 'in_progress', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'pending';

ALTER TABLE documents ADD COLUMN file_type ENUM('pdf', 'doc', 'docx', 'json') NOT NULL;

ALTER TABLE jobs CHANGE COLUMN created created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE jobs CHANGE COLUMN modified modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE vectors CHANGE COLUMN created created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE vectors CHANGE COLUMN modified modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE ai_providers CHANGE COLUMN created created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;


-- To update the UNIQUE constraint on the jobs table
-- Step 1: Find the name of the existing UNIQUE constraint
SELECT CONSTRAINT_NAME INTO @constraint_name
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_NAME = 'jobs' AND CONSTRAINT_TYPE = 'UNIQUE';

-- Step 2: Drop the existing UNIQUE constraint
SET @drop_constraint_query = CONCAT('ALTER TABLE jobs DROP INDEX ', @constraint_name);
PREPARE drop_stmt FROM @drop_constraint_query;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

-- Step 3: Add the new UNIQUE constraint
ALTER TABLE jobs ADD UNIQUE KEY unique_job (id, doc_id, status);

-- Step 4: Verify the changes
SHOW CREATE TABLE jobs;

-- Create Chat table
CREATE TABLE chats (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,         -- Unique chat identifier
    user_id INT UNSIGNED NOT NULL,                      -- Reference to users table
    chat_id VARCHAR(36) NOT NULL UNIQUE,                -- UUID for the chat
    title VARCHAR(100) NOT NULL,                        -- Chat title
    messages JSON DEFAULT (JSON_ARRAY()),               -- Chat messages stored as JSON
    status ENUM('active', 'deleted') DEFAULT 'active',  -- Chat status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,     -- Timestamp of creation
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Timestamp of last update
    deleted_at TIMESTAMP NULL DEFAULT NULL,             -- Timestamp of deletion (nullable)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- Relationship to users table
);

ALTER TABLE chats ADD COLUMN type ENUM('user', 'system') NOT NULL DEFAULT 'user';
ALTER TABLE chats ADD COLUMN metadata JSON;

-- Create index on chat_id for faster lookups
CREATE INDEX idx_chat_id ON chats(chat_id);

-- Create index on user_id for faster user-specific queries
CREATE INDEX idx_user_id ON chats(user_id);


ALTER TABLE documents MODIFY COLUMN file_type ENUM('pdf', 'doc', 'docx', 'json','txt') NOT NULL;

ALTER TABLE jobs ADD COLUMN job_type VARCHAR(50) AFTER doc_id;


ALTER TABLE jobs ADD COLUMN started_at TIMESTAMP NULL DEFAULT NULL AFTER metadata;

ALTER TABLE jobs ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER started_at;

ALTER TABLE jobs ADD COLUMN output JSON DEFAULT NULL AFTER completed_at;

ALTER TABLE jobs ADD COLUMN error_message TEXT DEFAULT NULL AFTER output;

ALTER TABLE vectors ADD COLUMN embedding JSON NOT NULL AFTER text_content;

ALTER TABLE vectors ADD COLUMN metadata JSON DEFAULT NULL AFTER embedding;

-- Drop unique constraint on Users.username

SELECT CONSTRAINT_NAME INTO @constraint_name
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_NAME = 'users' AND CONSTRAINT_TYPE = 'username';

-- Step 2: Drop the existing UNIQUE constraint
SET @drop_constraint_query = CONCAT('ALTER TABLE users DROP INDEX ', @constraint_name);
PREPARE drop_stmt FROM @drop_constraint_query;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;