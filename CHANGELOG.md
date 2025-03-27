# Changelog

## [1.2.0] - 2024-06-26

### Added
- Nginx container to act as a proxy for all ingress and TLS termination
- scripts to setup SSL certificates and for renewal using certbot/lets-encrypt in 
    - `nginx/init-letsencrypt.sh`
    - `nginx/renew-certs.sh`
- Removed mysql-8 from the docker-compose stack due to issues and replaced with AWS RDS
- Implemented Redis-based email queue system for non-blocking email sending
- Added automatic retry mechanism with exponential backoff for failed emails
- Created dead letter queue for persistently failed emails
- Added admin API endpoints for queue monitoring and management
- Created three diagnostic and testing scripts for email functionality:
  - `scripts/test-email-service.js` - Direct email testing tool
  - `scripts/test-email-queue.js` - Email queue system test
  - `scripts/email-queue-status.js` - Comprehensive queue monitoring tool
- Updated authentication controller to use the email queue for welcome emails
- Improved admin middleware with proper role verification
- Added comprehensive documentation in README.md
- MIS email cron for 2-hourly updates on user activity stats

### Fixed
- Redis timing out due to lack of proper retries, added aof and password protection for resilience and security.
- Resolved email timeout issues during signup by implementing asynchronous queue-based sending
- Fixed admin route protection for queue management endpoints
- Enhanced error reporting and logging for email-related operations

### Changed
- Blocked JSON file upload till the upload process is unified/cleaned up and Query logic  are tested well.
- Replaced direct email sending with queue-based approach
- Updated environment configuration to support Amazon RDS
- Improved deployment workflow with better error handling
- Enhanced Docker configuration to remove MySQL and use Amazon RDS 