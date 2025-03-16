import langchainService from './langchain.service.js';
import openaiService from './openai.service.js';
import weaviateService from './weaviate.service.js';
import Logger from '../utils/Logger.js';
import path from 'path';
import fs from 'fs';
import jobService from './Jobs.js';
import s3Utils from '../utils/s3.utils.js';

const logger = new Logger();

class JobProcessorService {
    constructor() {
        this.docStore = path.join(process.cwd(), 'doc-store');
        // Ensure doc-store directory exists
        if (!fs.existsSync(this.docStore)) {
            fs.mkdirSync(this.docStore, { recursive: true });
        }
    }

    /**
     * Process pending jobs
     * @returns {Promise<void>}
     */
    async processPendingJobs() {
        try {
            const pendingJobs = await jobService.getPendingJobs(10);

            if (!pendingJobs) {
                logger.info('No pending jobs found');
                return;
            }

            logger.info(`Found ${pendingJobs.length} pending jobs to process`);

            for (const job of pendingJobs) {
                await this._processJob(job);
            }
        } catch (error) {
            logger.error('Error processing pending jobs', { error });
        }
    }

    /**
     * Process a single job
     * @private
     * @param {{id: number, Document: {id: number, filename: string, file_type: string, s3_upload_url: string}}}    job - The job to process
     * @returns {Promise<void>}
     */
    async _processJob(job) {
        try {
            // Update job status to in_progress
            await job.update({ status: 'in_progress' });

            // Download document from S3
            const s3_key = s3Utils.fetchKeyFromDbUrl(job.Document.s3_upload_url);
            const localFilePath = path.join(this.docStore, `${job.Document.id}_${job.Document.filename}`);

            await this._downloadFile(s3_key, localFilePath);
            // Process document with Langchain
            const chunks = await langchainService.processDocument(localFilePath, job.Document.file_type);

            //TODO: very important: 
            //Create a vector table entry for each chunk in DB for each job with status 'in_progress'
            // and use the vector.id to store in the weaviate vector table
            // const vectorTableEntries = await jobService.createVectorTableEntries(job.id, chunks);


            // Create embeddings with OpenAI
            const vectors = await openaiService.createEmbeddings(chunks, job.id);

            // Store vectors in Weaviate
            await weaviateService.storeVectors(vectors);

            // Update job status to success
            await job.update({ status: 'success' });
            // Clean up
            await langchainService.cleanup(localFilePath);

            logger.info('Job processed successfully', { jobId: job.id });
        } catch (error) {
            logger.error('Error processing job', { jobId: job.id, error });
            await job.update({ status: 'failed' });
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
            const writer = fs.createWriteStream(destination);
            const fileBuffer = await s3Utils.downloadFromS3(s3_key);
            writer.write(fileBuffer);
            writer.end();

            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

        } catch (error) {
            logger.error('Error downloading file', { error });
            throw error;
        }
    }
}

export default new JobProcessorService(); 