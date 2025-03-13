

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

