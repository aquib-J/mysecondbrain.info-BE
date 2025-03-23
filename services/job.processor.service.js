import Logger from '../utils/Logger.js';
import jobService from './job.service.js';

const logger = new Logger();

class JobProcessorService {
    /**
     * Process pending jobs by delegating to the JobService
     * @returns {Promise<void>}
     */
    async processPendingJobs() {
        try {
            logger.info('Starting job processor cron job');
            await jobService.processPendingJobs();
            logger.info('Completed job processor cron job');
        } catch (error) {
            logger.error('Error in job processor service', { error });
        }
    }

    /**
     * Process a single job by ID
     * @param {number} jobId - ID of the job to process
     * @returns {Promise<void>}
     */
    async processJob(jobId) {
        try {
            logger.info(`Starting to process job ${jobId}`);
            await jobService.processJob(jobId);
            logger.info(`Completed processing job ${jobId}`);
        } catch (error) {
            logger.error('Error processing single job', { jobId, error });
            throw error; // Rethrow to allow proper error handling at higher levels
        }
    }
}

export default new JobProcessorService(); 