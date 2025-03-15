import cron from 'node-cron';
import jobProcessorService from '../services/job.processor.service.js';
import Logger from '../utils/Logger.js';

const logger = new Logger();

// Run every 5 minutes
const schedule = '*/5 * * * *';

// Initialize cron job
const jobProcessorCron = cron.schedule(schedule, async () => {
    try {
        logger.info('Starting job processor cron job');
        await jobProcessorService.processPendingJobs();
        logger.info('Completed job processor cron job');
    } catch (error) {
        logger.error('Error in job processor cron job', { error });
    }
});

// Start the cron job
jobProcessorCron.start();

logger.info('Job processor cron job initialized', { schedule });

export default jobProcessorCron; 