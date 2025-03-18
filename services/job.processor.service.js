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
}

export default new JobProcessorService(); 