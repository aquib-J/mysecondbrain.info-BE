import { Job, Document } from '../databases/mysql8/db-schemas.js';
import { getFileMetadata } from '../utils/s3.utils.js';
import Logger from '../utils/Logger.js';

const logger = new Logger();

class JobProcessorService {
    /**
     * Process pending jobs
     * @returns {Promise<void>}
     */
    async processPendingJobs() {
        try {
            const pendingJobs = await Job.findAll({
                where: {
                    status: 'pending',
                    dueAt: {
                        [Op.lte]: new Date()
                    }
                },
                include: [{
                    model: Document,
                    required: true
                }]
            });

            for (const job of pendingJobs) {
                await this.#processJob(job);
            }
        } catch (error) {
            logger.error('Error processing pending jobs', { error });
        }
    }

    /**
     * Process a single job
     * @private
     * @param {Object} job - The job to process
     * @returns {Promise<void>}
     */
    async #processJob(job) {
        try {
            // Update job status to processing
            await job.update({ status: 'processing' });

            // Get document metadata
            const metadata = await getFileMetadata(job.Document.s3Key);

            // Process based on job type
            switch (job.type) {
                case 'pdf_processing':
                    await this.#processPDF(job.Document);
                    break;
                case 'json_processing':
                    await this.#processJSON(job.Document);
                    break;
                case 'doc_processing':
                    await this.#processDOC(job.Document);
                    break;
                default:
                    await this.#processGeneric(job.Document);
            }

            // Update job and document status
            await job.update({ status: 'completed' });
            await job.Document.update({ status: 'processed' });

            logger.info('Job processed successfully', { jobId: job.id });
        } catch (error) {
            logger.error('Error processing job', { jobId: job.id, error });
            await job.update({ status: 'failed' });
            await job.Document.update({ status: 'failed' });
        }
    }

    /**
     * Process PDF document
     * @private
     * @param {Object} document - The document to process
     * @returns {Promise<void>}
     */
    async #processPDF(document) {
        // TODO: Implement PDF processing logic
        // 1. Download file from S3
        // 2. Extract text using pdf-parse
        // 3. Create vectors using OpenAI
        // 4. Store vectors in Weaviate
        throw new Error('PDF processing not implemented');
    }

    /**
     * Process JSON document
     * @private
     * @param {Object} document - The document to process
     * @returns {Promise<void>}
     */
    async #processJSON(document) {
        // TODO: Implement JSON processing logic
        // 1. Download file from S3
        // 2. Parse JSON
        // 3. Create vectors using OpenAI
        // 4. Store vectors in Weaviate
        throw new Error('JSON processing not implemented');
    }

    /**
     * Process DOC document
     * @private
     * @param {Object} document - The document to process
     * @returns {Promise<void>}
     */
    async #processDOC(document) {
        // TODO: Implement DOC processing logic
        // 1. Download file from S3
        // 2. Extract text using mammoth
        // 3. Create vectors using OpenAI
        // 4. Store vectors in Weaviate
        throw new Error('DOC processing not implemented');
    }

    /**
     * Process generic document
     * @private
     * @param {Object} document - The document to process
     * @returns {Promise<void>}
     */
    async #processGeneric(document) {
        // TODO: Implement generic processing logic
        // 1. Download file from S3
        // 2. Extract text based on content type
        // 3. Create vectors using OpenAI
        // 4. Store vectors in Weaviate
        throw new Error('Generic processing not implemented');
    }
}

export default new JobProcessorService(); 