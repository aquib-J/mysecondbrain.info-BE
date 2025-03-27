import redisConnect from '../databases/redis/redisConnect.js';
import Logger from '../utils/Logger.js';
import emailService from './email.service.js';
import { NODE_ENV } from '../config/env.js';

const logger = new Logger();

/**
 * Email Queue Service that uses Redis to handle email sending asynchronously
 */
class EmailQueueService {
    constructor() {
        this.queueName = 'email:queue';
        this.processingQueueName = 'email:processing';
        this.deadLetterQueueName = 'email:deadletter';
        this.maxRetries = 3;
        this.processingTimeout = 60000; // 1 minute
        this.initialized = false;
        this.client = null;
        this.processing = false;
        this.processorInterval = null;
        this.recoveryInterval = null;

        // Initialize the service
        this.init();
    }

    /**
     * Initialize the email queue service
     */
    async init() {
        try {
            // Clear any existing processing state
            this.processing = false;

            // Stop any existing intervals
            if (this.processorInterval) {
                clearInterval(this.processorInterval);
                this.processorInterval = null;
            }

            if (this.recoveryInterval) {
                clearInterval(this.recoveryInterval);
                this.recoveryInterval = null;
            }

            // Get Redis client
            this.client = await redisConnect.getClient();

            if (!this.client) {
                logger.error('Failed to initialize email queue - Redis client not available');
                // Retry initialization after 5 seconds
                setTimeout(() => this.init(), 5000);
                return;
            }

            // Verify Redis connection
            const pingResult = await this.client.ping().catch(err => {
                logger.error('Redis ping failed during initialization', { error: err.message });
                return null;
            });

            if (pingResult !== 'PONG') {
                logger.error('Redis connection test failed - queue will not be processed', { ping: pingResult });
                // Retry initialization after 5 seconds
                setTimeout(() => this.init(), 5000);
                return;
            }

            this.initialized = true;
            logger.info('Email queue service initialized successfully');

            // Start processing queue in background with more reliable approach
            this.startQueueProcessor();

        } catch (error) {
            logger.error('Error initializing email queue service', { error: error.message });
            // Retry initialization after 5 seconds
            setTimeout(() => this.init(), 5000);
        }
    }

    /**
     * Add email job to the queue
     * @param {Object} emailJob - Email job to be processed
     * @param {string} emailJob.type - Type of email (welcome, notification, etc.)
     * @param {string} emailJob.to - Recipient email address
     * @param {string} emailJob.subject - Email subject
     * @param {string} emailJob.html - HTML content
     * @param {string} emailJob.text - Plain text content
     * @param {Object} emailJob.metadata - Additional metadata
     * @returns {Promise<boolean>} - Success or failure
     */
    async addToQueue(emailJob) {
        // Validate required fields
        if (!emailJob || !emailJob.type || !emailJob.to) {
            logger.error('Invalid email job - missing required fields', { emailJob });
            return false;
        }

        try {
            // Check if Redis is available
            if (!this.initialized || !await this.isRedisConnected()) {
                logger.warn('Redis not available for email queue, using direct send fallback', {
                    to: emailJob.to,
                    type: emailJob.type,
                    subject: emailJob.subject || '[No Subject]'
                });

                // Use direct email sending as fallback
                return await this.sendEmailDirectly(emailJob);
            }

            // Add job metadata
            const job = {
                ...emailJob,
                id: `email:${Date.now()}:${Math.random().toString(36).substring(2, 15)}`,
                createdAt: new Date().toISOString(),
                retries: 0,
                status: 'queued'
            };

            // Add to queue
            await this.client.rPush(this.queueName, JSON.stringify(job));

            logger.info('Email job added to queue', {
                id: job.id,
                type: job.type,
                to: job.to
            });

            // Trigger immediate processing if not already running
            if (!this.processing) {
                // Use setImmediate for better performance than setTimeout(0)
                setImmediate(() => this.processQueue());
            }

            return true;
        } catch (error) {
            logger.error('Error adding email to queue, trying direct send', {
                error: error.message,
                to: emailJob.to,
                type: emailJob.type
            });

            // Use direct email sending as fallback
            return await this.sendEmailDirectly(emailJob);
        }
    }

    /**
     * Send email directly when queue is unavailable
     * @param {Object} emailJob - Email job to be processed
     * @returns {Promise<boolean>} - Success or failure
     * @private
     */
    async sendEmailDirectly(emailJob) {
        try {
            logger.info('Sending email directly (bypassing queue)', {
                to: emailJob.to,
                type: emailJob.type,
                subject: emailJob.subject || '[No Subject]'
            });

            let success = false;

            // Add more detailed tracking
            const startTime = Date.now();
            const attemptId = `direct-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

            logger.debug(`Starting direct email send attempt ${attemptId}`, {
                to: emailJob.to,
                type: emailJob.type
            });

            switch (emailJob.type) {
                case 'welcome':
                    success = await emailService.sendWelcomeEmail(emailJob.to, emailJob.username);
                    break;

                case 'generic':
                default:
                    success = await emailService.sendEmail(
                        emailJob.to,
                        emailJob.subject,
                        emailJob.html,
                        emailJob.text
                    );
                    break;
            }

            const duration = Date.now() - startTime;

            if (success) {
                logger.info(`Email sent directly successfully (${duration}ms)`, {
                    to: emailJob.to,
                    type: emailJob.type,
                    attemptId,
                    duration
                });
            } else {
                logger.error(`Direct email sending failed after ${duration}ms`, {
                    to: emailJob.to,
                    type: emailJob.type,
                    attemptId,
                    duration
                });
            }

            return success;
        } catch (error) {
            logger.error('Error in direct email sending', {
                error: error.message,
                stack: error.stack,
                to: emailJob.to,
                type: emailJob.type
            });
            return false;
        }
    }

    /**
     * Check if Redis is connected
     * @returns {Promise<boolean>} - True if Redis is connected
     */
    async isRedisConnected() {
        try {
            // Check if the client exists and isOpen property is true
            if (!this.client) return false;

            // For newer Redis client versions, use ping to verify connection
            const pingResult = await this.client.ping().catch(() => null);
            return pingResult === 'PONG';
        } catch (error) {
            logger.error('Error checking Redis connection', { error: error.message });
            return false;
        }
    }

    /**
     * Start the queue processor in background
     */
    startQueueProcessor() {
        // Initial queue check - using try/catch for added safety
        try {
            this.processQueue().catch(err => {
                logger.error('Error in initial queue processing', { error: err.message });
            });
        } catch (error) {
            logger.error('Error starting initial queue processing', { error: error.message });
        }

        // Set up recurring processor on an interval (every 10 seconds)
        this.processorInterval = setInterval(() => {
            try {
                if (!this.processing) {
                    this.processQueue().catch(err => {
                        logger.error('Error in scheduled queue processing', { error: err.message });
                    });
                }
            } catch (error) {
                logger.error('Error in processor interval', { error: error.message });
            }
        }, 10000);

        // Set up interval to check for abandoned jobs in processing queue
        this.recoveryInterval = setInterval(() => {
            try {
                this.recoverAbandonedJobs().catch(err => {
                    logger.error('Error in abandoned job recovery', { error: err.message });
                });
            } catch (error) {
                logger.error('Error in recovery interval', { error: error.message });
            }
        }, 30000); // Every 30 seconds

        logger.info('Email queue processor started', {
            processorInterval: '10s',
            recoveryInterval: '30s'
        });
    }

    /**
     * Process emails in the queue
     */
    async processQueue() {
        // Guard against concurrent processing
        if (this.processing) return;

        // Check for Redis connection
        if (!await this.isRedisConnected()) {
            logger.warn('Skipping queue processing - Redis not connected');
            return;
        }

        this.processing = true;
        let processedCount = 0;

        try {
            logger.debug('Starting queue processing cycle');

            // Process up to 10 emails per cycle to avoid blocking too long
            const maxBatchSize = 10;

            for (let i = 0; i < maxBatchSize; i++) {
                const job = await this.client.lPop(this.queueName);
                if (!job) break; // No more jobs in queue

                try {
                    // Parse the job
                    const emailJob = JSON.parse(job);

                    // Move to processing queue with expiry
                    await this.client.setEx(
                        `${this.processingQueueName}:${emailJob.id}`,
                        Math.ceil(this.processingTimeout / 1000),
                        job
                    );

                    // Process the job - use await to process emails sequentially
                    await this.processEmailJob(emailJob);
                    processedCount++;
                } catch (parseError) {
                    logger.error('Error parsing job from queue', {
                        error: parseError.message,
                        job
                    });
                    // Bad job format - discard it
                    continue;
                }
            }

            if (processedCount > 0) {
                logger.info(`Processed ${processedCount} emails in this cycle`);
            }

        } catch (error) {
            logger.error('Error processing email queue', { error: error.message });
        } finally {
            this.processing = false;

            // Check if there are still items in the queue
            try {
                const queueLength = await this.client.lLen(this.queueName);
                if (queueLength > 0) {
                    logger.debug(`Still ${queueLength} emails in queue, scheduling next cycle`);

                    // Delay next batch by 1 second to avoid CPU overuse
                    setTimeout(() => this.processQueue(), 1000);
                }
            } catch (error) {
                logger.error('Error checking queue length', { error: error.message });
            }
        }
    }

    /**
     * Process a single email job
     * @param {Object} job - Email job to process
     */
    async processEmailJob(job) {
        try {
            logger.debug('Processing email job', { id: job.id, type: job.type });

            let success = false;

            // Enhanced validation of job data
            if (!job) {
                throw new Error('Job object is null or undefined');
            }

            if (!job.to) {
                throw new Error('Missing recipient email address (to)');
            }

            // Type-specific validation
            if (job.type === 'welcome') {
                if (!job.username) {
                    logger.warn('Welcome email missing username, using default', {
                        id: job.id,
                        to: job.to
                    });
                    job.username = 'User'; // Provide a default
                }
            } else if (job.type === 'generic') {
                if (!job.subject) {
                    throw new Error('Generic email missing subject');
                }

                if (!job.html && !job.text) {
                    throw new Error('Generic email missing both HTML and text content');
                }
            } else {
                throw new Error(`Unknown email type: ${job.type}`);
            }

            // Process the job with appropriate error handling
            switch (job.type) {
                case 'welcome':
                    logger.debug('Sending welcome email', {
                        id: job.id,
                        to: job.to,
                        username: job.username
                    });
                    success = await emailService.sendWelcomeEmail(job.to, job.username);
                    break;

                case 'generic':
                default:
                    logger.debug('Sending generic email', {
                        id: job.id,
                        to: job.to,
                        subject: job.subject,
                        hasHtml: !!job.html,
                        hasText: !!job.text
                    });
                    success = await emailService.sendEmail(job.to, job.subject, job.html, job.text);
                    break;
            }

            if (success) {
                logger.info('Email job processed successfully', {
                    id: job.id,
                    type: job.type,
                    to: job.to
                });

                // Remove from processing queue
                await this.client.del(`${this.processingQueueName}:${job.id}`);
            } else {
                throw new Error('Email sending failed');
            }

        } catch (error) {
            logger.error('Error processing email job', {
                id: job?.id || 'unknown',
                type: job?.type || 'unknown',
                to: job?.to || 'unknown',
                error: error.message,
                stack: error.stack
            });

            // Handle retries or move to dead letter queue
            await this.handleFailedJob(job, error);
        }
    }

    /**
     * Handle a failed job - retry or move to dead letter queue
     * @param {Object} job - The failed job
     * @param {Error} error - The error that occurred
     */
    async handleFailedJob(job, error) {
        try {
            job.retries = (job.retries || 0) + 1;
            job.lastError = error.message;
            job.lastAttempt = new Date().toISOString();

            // Remove from processing queue
            await this.client.del(`${this.processingQueueName}:${job.id}`);

            if (job.retries < this.maxRetries) {
                // Return to main queue for retry with exponential backoff
                const backoff = Math.min(Math.pow(2, job.retries) * 1000, 30000); // Max 30 seconds

                job.status = 'retry';
                job.nextAttempt = new Date(Date.now() + backoff).toISOString();

                logger.info('Email job scheduled for retry', {
                    id: job.id,
                    retries: job.retries,
                    backoff: `${backoff}ms`,
                    nextAttempt: job.nextAttempt
                });

                // Use reliable setTimeout approach with immediate Redis push
                await this.client.rPush(this.queueName, JSON.stringify(job));

            } else {
                // Move to dead letter queue
                job.status = 'failed';
                await this.client.rPush(this.deadLetterQueueName, JSON.stringify(job));

                logger.warn('Email job moved to dead letter queue', {
                    id: job.id,
                    retries: job.retries,
                    error: job.lastError
                });
            }
        } catch (handlingError) {
            logger.error('Error handling failed job', {
                jobId: job?.id,
                originalError: error?.message,
                handlingError: handlingError.message
            });
        }
    }

    /**
     * Check for and recover abandoned jobs in the processing queue
     */
    async recoverAbandonedJobs() {
        try {
            // Check for Redis connection
            if (!await this.isRedisConnected()) {
                logger.warn('Skipping abandoned job recovery - Redis not connected');
                return;
            }

            const processingJobs = await this.client.keys(`${this.processingQueueName}:*`);

            if (processingJobs.length === 0) return;

            logger.info('Checking for abandoned jobs', { count: processingJobs.length });

            let recoveredCount = 0;

            for (const jobKey of processingJobs) {
                try {
                    const jobData = await this.client.get(jobKey);

                    if (!jobData) {
                        // Key exists but no data - delete it
                        await this.client.del(jobKey);
                        continue;
                    }

                    const job = JSON.parse(jobData);
                    const jobAge = Date.now() - new Date(job.createdAt).getTime();

                    // If job has been processing too long (more than timeout period)
                    if (jobAge > this.processingTimeout) {
                        logger.warn('Recovering abandoned job', { id: job.id, age: `${jobAge}ms` });

                        // Handle as failed
                        job.lastError = 'Job processing timeout';
                        await this.handleFailedJob(job, new Error('Job processing timeout'));
                        recoveredCount++;
                    }
                } catch (jobError) {
                    logger.error('Error processing abandoned job', {
                        jobKey,
                        error: jobError.message
                    });

                    // Delete problematic key to avoid infinite recovery attempts
                    try {
                        await this.client.del(jobKey);
                    } catch (deleteError) {
                        logger.error('Failed to delete problem job key', {
                            jobKey,
                            error: deleteError.message
                        });
                    }
                }
            }

            if (recoveredCount > 0) {
                logger.info(`Recovered ${recoveredCount} abandoned jobs`);
            }

        } catch (error) {
            logger.error('Error recovering abandoned jobs', { error: error.message });
        }
    }

    /**
     * Retry a job from the dead letter queue
     * @param {string} jobId - ID of the job to retry
     * @returns {Promise<boolean>} - Success or failure
     */
    async retryDeadLetterJob(jobId) {
        try {
            // Check for Redis connection
            if (!await this.isRedisConnected()) {
                logger.error('Cannot retry dead letter job - Redis not connected');
                return false;
            }

            // Get all jobs from dead letter queue
            const jobs = await this.client.lRange(this.deadLetterQueueName, 0, -1);

            for (let i = 0; i < jobs.length; i++) {
                const job = JSON.parse(jobs[i]);

                if (job.id === jobId) {
                    // Reset retry count and status
                    job.retries = 0;
                    job.status = 'retry';
                    job.retriedAt = new Date().toISOString();
                    job.retrySource = 'admin';

                    // Add back to main queue
                    await this.client.rPush(this.queueName, JSON.stringify(job));

                    // Remove from dead letter queue
                    await this.client.lRem(this.deadLetterQueueName, 1, jobs[i]);

                    logger.info('Job moved from dead letter queue to main queue', { id: jobId });

                    // Trigger processing if not already running
                    if (!this.processing) {
                        setImmediate(() => this.processQueue());
                    }

                    return true;
                }
            }

            logger.warn('Job not found in dead letter queue', { id: jobId });
            return false;

        } catch (error) {
            logger.error('Error retrying job from dead letter queue', {
                error: error.message,
                jobId
            });
            return false;
        }
    }

    /**
     * Get all jobs in the dead letter queue
     * @returns {Promise<Array>} - Array of dead letter jobs
     */
    async getDeadLetterJobs() {
        try {
            // Check for Redis connection
            if (!await this.isRedisConnected()) {
                logger.error('Cannot get dead letter jobs - Redis not connected');
                return [];
            }

            const jobs = await this.client.lRange(this.deadLetterQueueName, 0, -1);
            return jobs.map(job => {
                try {
                    return JSON.parse(job);
                } catch (error) {
                    logger.error('Error parsing dead letter job', { job, error: error.message });
                    return { error: 'Invalid job format', raw: job };
                }
            });
        } catch (error) {
            logger.error('Error getting dead letter jobs', { error: error.message });
            return [];
        }
    }

    /**
     * Clear the dead letter queue
     * @returns {Promise<boolean>} - Success or failure
     */
    async clearDeadLetterQueue() {
        try {
            // Check for Redis connection
            if (!await this.isRedisConnected()) {
                logger.error('Cannot clear dead letter queue - Redis not connected');
                return false;
            }

            await this.client.del(this.deadLetterQueueName);
            logger.info('Dead letter queue cleared');
            return true;
        } catch (error) {
            logger.error('Error clearing dead letter queue', { error: error.message });
            return false;
        }
    }

    /**
     * Get queue statistics
     * @returns {Promise<Object>} - Queue statistics
     */
    async getQueueStats() {
        try {
            // Check for Redis connection
            if (!await this.isRedisConnected()) {
                logger.error('Cannot get queue stats - Redis not connected');
                return {
                    queued: 0,
                    processing: 0,
                    failed: 0,
                    total: 0,
                    error: 'Redis not connected',
                    timestamp: new Date().toISOString()
                };
            }

            const [queueLength, deadLetterLength] = await Promise.all([
                this.client.lLen(this.queueName),
                this.client.lLen(this.deadLetterQueueName)
            ]);

            const processingKeys = await this.client.keys(`${this.processingQueueName}:*`);

            return {
                queued: queueLength,
                processing: processingKeys.length,
                failed: deadLetterLength,
                total: queueLength + processingKeys.length + deadLetterLength,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Error getting queue statistics', { error: error.message });
            return {
                queued: 0,
                processing: 0,
                failed: 0,
                total: 0,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Graceful shutdown - clean up intervals
     */
    shutdown() {
        logger.info('Shutting down email queue service');

        // Clear intervals
        if (this.processorInterval) {
            clearInterval(this.processorInterval);
            this.processorInterval = null;
        }

        if (this.recoveryInterval) {
            clearInterval(this.recoveryInterval);
            this.recoveryInterval = null;
        }

        this.initialized = false;
        this.processing = false;
    }
}

// Export singleton instance
export default new EmailQueueService(); 