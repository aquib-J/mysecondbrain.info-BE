import { Job, Document, Vector } from '../databases/mysql8/db-schemas.js';
import Logger from '../utils/Logger.js';
import sequelize from '../databases/mysql8/sequelizeConnect.js';
import S3 from '../utils/s3.utils.js';
import path from 'path';
import fs from 'fs';
import weaviateService from './weaviate/weaviate.service.js';
import { Op } from 'sequelize';
import vectorizationService from './vectorization.service.js';
import * as uuid from 'uuid';
import openaiService from '../services/openai.service.js';

const logger = new Logger();

class JobService {
    constructor() {
        this.docStore = path.join(process.cwd(), 'doc-store');
        // Ensure doc-store directory exists
        if (!fs.existsSync(this.docStore)) {
            fs.mkdirSync(this.docStore, { recursive: true });
        }
    }

    /**
     * Process pending jobs in batch
     * @returns {Promise<void>}
     */
    async processPendingJobs() {
        try {
            const pendingJobs = await this.getPendingJobs(10, 20); //TODO: chante to 5 later

            if (!pendingJobs || pendingJobs.length === 0) {
                logger.info('No pending jobs found');
                return;
            }

            logger.info(`Found ${pendingJobs.length} pending jobs to process`);

            for (const job of pendingJobs) {
                await this.processJob(job.id);
            }
        } catch (error) {
            logger.error('Error processing pending jobs', { error });
        }
    }

    /**
     * Process a specific job
     * @param {number} jobId - ID of the job to process
     * @returns {Promise<void>}
     */
    async processJob(jobId) {
        let transaction;
        let localFilePath;
        try {
            transaction = await sequelize.transaction();
            const job = await Job.findByPk(jobId, {
                include: [{
                    model: Document,
                    as: 'document'
                }]
            });

            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }

            if (job.status === 'success') {
                logger.info(`Job ${jobId} already completed`);
                return;
            }

            if (job.status === 'cancelled') {
                logger.info(`Job ${jobId} is cancelled`);
                return;
            }

            // Check if document is available
            if (!job.document) {
                throw new Error(`Document not found for job ${job.id}`);
            }

            // Validate document fields
            if (!job.document.s3_upload_url) {
                throw new Error(`S3 upload URL not found for document ${job.document.id}`);
            }

            await job.update({
                status: 'in_progress',
                started_at: new Date(),
                error_message: null // Clear any previous error message
            }, { transaction });
            await transaction.commit();
            transaction = null;

            // Get the metadata
            let metadata = {};
            try {
                metadata = job.metadata ? JSON.parse(job.metadata) : {};
            } catch (error) {
                logger.warn('Error parsing job metadata', { error, jobId });
                metadata = {};
            }

            // Extract userId from metadata or document
            const userId = metadata.userId || job.document.uploaded_by;
            if (!userId) {
                throw new Error('User ID not found in job metadata or document');
            }

            // Extract job type from metadata or job record or infer from file type
            const jobType = job.job_type || metadata.job_type || (job.document.file_type + '_processing');

            // Download document from S3
            const s3_key = S3.fetchKeyFromDbUrl(job.document.s3_upload_url);
            localFilePath = path.join(this.docStore, `${job.document.id}_${job.document.filename}`);

            await this._downloadFile(s3_key, localFilePath);

            logger.info(`Processing job ${job.id} with type ${jobType}`, {
                jobId: job.id,
                jobType,
                documentId: job.document.id,
                fileType: job.document.file_type
            });

            let processingResult;
            if (jobType === 'json_processing') {
                processingResult = await this._processJsonFile(job, localFilePath, userId);
            } else if (jobType === 'pdf_processing' || jobType === 'docx_processing' ||
                jobType === 'doc_processing' || jobType === 'txt_processing') {
                processingResult = await this._processDocumentFile(job, localFilePath, userId);
            } else {
                throw new Error(`Unsupported job type: ${jobType}`);
            }

            // Clean up
            try {
                await fs.promises.unlink(localFilePath);
                logger.info(`Cleaned up temporary file: ${localFilePath}`);
            } catch (cleanupError) {
                logger.warn('Error cleaning up temporary file', { error: cleanupError, path: localFilePath });
                // Non-fatal error, continue processing
            }

            transaction = await sequelize.transaction();
            await job.update({
                status: 'success',
                completed_at: new Date(),
                output: processingResult,
                error_message: null
            }, { transaction });

            await transaction.commit();
            logger.info(`Job ${jobId} completed successfully`);
        } catch (error) {
            logger.error('Error processing job', { jobId, error });
            console.error(error);

            // Clean up file if it exists
            if (localFilePath) {
                try {
                    await fs.promises.unlink(localFilePath);
                } catch (cleanupError) {
                    logger.warn('Error cleaning up temporary file after job failure', { error: cleanupError, path: localFilePath });
                }
            }

            if (transaction) {
                await transaction.rollback();
            }

            // Update job status with error
            transaction = await sequelize.transaction();
            try {
                const job = await Job.findByPk(jobId);
                if (job) {
                    await job.update({
                        status: 'failed',
                        error_message: error.message,
                        completed_at: new Date() // Add completion time even for failed jobs
                    }, { transaction });
                }
                await transaction.commit();
            } catch (updateError) {
                logger.error('Error updating job status after failure', { jobId, error: updateError });
                if (transaction) await transaction.rollback();
            }
        }
    }

    /**
     * Process a JSON file
     * @param {Job} job - Job record
     * @param {string} filePath - Path to the local file
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Processing result
     * @private
     */
    async _processJsonFile(job, filePath, userId) {
        const operationId = uuid.v4();
        logger.info('Processing JSON file', {
            operationId,
            jobId: job.id,
            documentId: job.document.id,
            userId
        });

        try {
            // Read and parse JSON file
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            let jsonData;
            try {
                jsonData = JSON.parse(fileContent);
            } catch (error) {
                logger.error('Error parsing JSON file', { error, path: filePath });
                throw new Error(`Invalid JSON file: ${error.message}`);
            }

            // Use vectorization service to process JSON data
            const result = await vectorizationService.processJsonData(
                jsonData,
                job.id,
                job.document.id,
                userId
            );

            return {
                success: true,
                vectorsCount: result.vectorsCount,
                fieldsCount: result.fieldsCount
            };
        } catch (error) {
            logger.error('Error processing JSON file', {
                operationId,
                error: error.message,
                jobId: job.id,
                documentId: job.document.id
            });
            throw error;
        }
    }


    /**
     * Process document file (PDF, DOCX, etc.)
     * @private
     * @param {Job} job - Job object
     * @param {string} filePath - Path to the local file
     * @param {number} userId - User ID
     * @returns {Promise<object>} - Processing result
     */
    async _processDocumentFile(job, filePath, userId) {
        const document = job.document;
        const fileType = document.file_type;

        try {
            logger.info(`Processing ${fileType} document for job ${job.id}`, {
                documentId: document.id,
                filePath
            });

            // Process document with vectorization service
            const metadata = {
                documentId: document.id,
                documentUserId: userId,
                documentName: document.filename
            };

            const result = await vectorizationService.processDocumentFile(
                filePath,
                fileType,
                job.id,
                metadata
            );

            return {
                vector_count: result.vector_count,
                weaviate_id: result.weaviate_id,
                page_count: document.pages || 1
            };
        } catch (error) {
            logger.error(`Error processing ${fileType} document`, { error, jobId: job.id });
            throw error;
        }
    }

    /**
     * Download file from S3
     * @private
     * @param {string} s3_key - S3 key to download from
     * @param {string} destination - Path to save the file
     * @returns {Promise<void>}
     */
    async _downloadFile(s3_key, destination) {
        try {
            const writeStream = fs.createWriteStream(destination);
            const s3Stream = await S3.download(s3_key);

            return new Promise((resolve, reject) => {
                // Pipe the S3 stream to the file write stream
                s3Stream.pipe(writeStream);

                // Handle stream events
                writeStream.on('finish', () => {
                    writeStream.end();
                    resolve();
                });

                writeStream.on('error', (error) => {
                    // Clean up the file if there's an error
                    fs.unlink(destination, () => {
                        reject(error);
                    });
                });

                s3Stream.on('error', (error) => {
                    // Clean up the file if there's an error
                    fs.unlink(destination, () => {
                        reject(error);
                    });
                });
            });
        } catch (error) {
            // Clean up the file if there's an error
            try {
                await fs.promises.unlink(destination);
            } catch (unlinkError) {
                logger.warn('Error cleaning up file after download failure', { error: unlinkError });
            }
            logger.error('Error downloading file', { error, s3_key });
            throw error;
        }
    }

    /**
     * Delete vectors for a job
     * @param {number} jobId - ID of the job
     * @param {Transaction} transaction - Sequelize transaction
     * @returns {Promise<void>}
     */
    async deleteVectors(jobId, transaction) {
        try {
            const job = await Job.findByPk(jobId, {
                include: [{
                    model: Document,
                    as: 'document'
                }]
            });

            if (!job) {
                throw new Error(`Job ${jobId} not found`);
            }

            await job.update({
                status: 'cancelled',
                cancelled_at: new Date()
            }, { transaction });

            await Vector.update({
                is_active: 0,
            }, {
                where: { job_id: jobId }
            }, { transaction });

            // Delete vectors from Weaviate
            await weaviateService.deleteJobVectors(jobId, job.document.uploaded_by);

            logger.info(`Vectors for job ${jobId} deleted`);
        } catch (error) {
            logger.error('Error deleting vectors for job', { jobId, error });
            throw error;
        }
    }

    /**
     * Create a new job
     * @param {number} docId - Document ID
     * @param {string} jobType - Type of job (e.g., 'pdf_processing', 'json_processing')
     * @param {Object} metadata - Additional metadata for the job
     * @param {Sequelize.Transaction} [transaction] - Optional transaction object
     * @returns {Promise<Job>}
     */
    async createJob(docId, jobType, metadata = {}, transaction = null) {
        try {
            const options = transaction ? { transaction } : {};

            const job = await Job.create({
                doc_id: docId,
                status: 'pending',
                job_type: jobType,
                metadata: JSON.stringify({
                    ...metadata,
                    job_type: jobType
                }),
                service: 'secondbrain',
                resource: 'document_processing'
            }, options);

            logger.info('Job created successfully', { jobId: job.id, docId });
            return job;
        } catch (error) {
            logger.error('Error creating job', { error, docId });
            throw error;
        }
    }

    /**
     * Get a job by Document ID
     * @param {number} docId - Document ID
     * @returns {Promise<Job>}
     */
    async getJobByDocId(docId) {
        try {
            const job = await Job.findOne({
                where: {
                    doc_id: docId,
                    status: {
                        [Op.notIn]: ['cancelled', 'pending']
                    }
                },
                order: [['created_at', 'DESC']]
            });

            if (!job) {
                logger.info('No job found', { docId });
                return null;
            }

            return job;
        } catch (error) {
            logger.error('Error getting job', { error, docId });
            throw error;
        }
    }

    /**
     * Cancel all pending jobs for a document
     * @param {number} docId - Document ID
     * @param {Sequelize.Transaction} [transaction] - Optional transaction object
     * @returns {Promise<number>} - Number of jobs cancelled
     */
    async cancelPendingJobs(docId, transaction = null) {
        try {
            const result = await Job.update(
                {
                    status: 'cancelled',
                    cancelled_at: new Date()
                },
                {
                    where: {
                        doc_id: docId,
                        status: 'pending'
                    },
                    transaction
                }
            );

            logger.info('Pending jobs cancelled', { docId, count: result[0] });
            return result[0]; // Number of rows affected
        } catch (error) {
            logger.error('Error cancelling pending jobs', { error, docId });
            throw error;
        }
    }

    /**
     * Clean up failed vectors older than specified days
     * @param {number} days - Number of days to keep failed vectors
     * @returns {Promise<number>} - Number of deleted vectors
     */
    async cleanFailedVectors(days = 7) {
        try {
            // Calculate cutoff time in UTC
            const now = new Date();
            const cutoff = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - days,
                now.getUTCHours(),
                now.getUTCMinutes(),
                now.getUTCSeconds()
            ));

            // Soft delete vectors by setting is_active to false
            const result = await Vector.update(
                { is_active: false },
                {
                    where: {
                        status: 'failed',
                        created_at: { [Op.lt]: cutoff }
                    }
                }
            );

            logger.info(`Cleaned up ${result[0]} failed vectors older than ${days} days`);
            return result[0];
        } catch (error) {
            logger.error('Error cleaning up failed vectors', { error });
            throw error;
        }
    }

    /**
     * Get pending jobs for processing
     * @param {number} limit - Maximum number of jobs to fetch
     * @param {number} cutoffMinutes - Number of minutes to fetch jobs created in the last cutoff minutes
     * @returns {Promise<Array<Job>>} - Array of pending jobs
     */
    async getPendingJobs(limit = 10, cutoffMinutes = 10) {
        try {
            // Calculate the cutoff time in UTC
            const cutoff = new Date();
            cutoff.setUTCMinutes(cutoff.getUTCMinutes() - cutoffMinutes);

            const pendingJobs = await Job.findAll({
                where: {
                    status: 'pending',
                    created_at: { [Op.gte]: cutoff }
                },
                include: [{
                    model: Document,
                    as: 'document'
                }],
                order: [['created_at', 'ASC']],
                limit
            });

            logger.info(`Found ${pendingJobs.length} pending jobs`);
            return pendingJobs;
        } catch (error) {
            logger.error('Error fetching pending jobs', { error });
            throw error;
        }
    }

    /**
     * Store vectors in MySQL database
     * @param {Array<Object>} vectors - Array of vector objects to store
     * @param {number} [jobId] - Optional job ID for logging
     * @returns {Promise<Array>} - Array of created vector records
     * @private
     */
    async _storeVectors(vectors, jobId) {
        const operationId = uuid.v4();
        logger.info('Storing vectors in MySQL', {
            operationId,
            vectorsCount: vectors.length,
            jobId
        });

        try {
            // Make sure all vectors have required fields
            const preparedVectors = vectors.map(vector => ({
                ...vector,
                embedding_id: vector.embedding_id || 1, // Default to OpenAI embedding
                status: vector.status || 'success',
                is_active: vector.is_active !== undefined ? vector.is_active : true
            }));

            // Use bulkCreate for efficiency
            const createdVectors = await Vector.bulkCreate(preparedVectors);

            logger.info('Vectors stored successfully in MySQL', {
                operationId,
                storedCount: createdVectors.length,
                jobId
            });

            return createdVectors;
        } catch (error) {
            logger.error('Error storing vectors in MySQL', {
                operationId,
                error: error.message,
                vectorsCount: vectors.length,
                jobId
            });
            throw error;
        }
    }
}

export default new JobService(); 