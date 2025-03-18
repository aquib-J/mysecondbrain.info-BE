import cron from 'node-cron';
import jobProcessorService from '../services/job.processor.service.js';
import jobService from '../services/job.service.js';
import Logger from '../utils/Logger.js';
import * as uuid from 'uuid';

const logger = new Logger();

const CleanUpDaysThreshold = 7;

// Process pending jobs every 5 minutes
const jobProcessorSchedule = '*/5 * * * *';

// Clean up old failed vectors daily at midnight
const cleanupSchedule = '0 0 * * *';

// Initialize job processor cron job
const jobProcessorCron = cron.schedule(jobProcessorSchedule, async () => {
    const processId = uuid.v4();
    try {
        logger.info('Starting job processor cron job', {
            processId,
            schedule: jobProcessorSchedule,
            timestamp: new Date().toISOString()
        });

        await jobProcessorService.processPendingJobs();

        logger.info('Completed job processor cron job', {
            processId,
            completedAt: new Date().toISOString(),
            status: 'success'
        });
    } catch (error) {
        logger.error('Error in job processor cron job', {
            processId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
});

// Initialize cleanup cron job
const cleanupCron = cron.schedule(cleanupSchedule, async () => {
    const cleanupId = uuid.v4();
    try {
        logger.info('Starting failed vectors cleanup job', {
            cleanupId,
            threshold: CleanUpDaysThreshold,
            timestamp: new Date().toISOString()
        });

        const deletedCount = await jobService.cleanFailedVectors(CleanUpDaysThreshold);

        logger.info('Completed failed vectors cleanup job', {
            cleanupId,
            deletedVectorsCount: deletedCount,
            completedAt: new Date().toISOString(),
            status: 'success'
        });
    } catch (error) {
        logger.error('Error in cleanup cron job', {
            cleanupId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
});

// Start the cron jobs
jobProcessorCron.start();
cleanupCron.start();

logger.info('Job processor cron job initialized', {
    schedule: jobProcessorSchedule,
    type: 'job-processor',
    timestamp: new Date().toISOString()
});

logger.info('Cleanup cron job initialized', {
    schedule: cleanupSchedule,
    type: 'cleanup',
    threshold: `${CleanUpDaysThreshold} days`,
    timestamp: new Date().toISOString()
});

export { jobProcessorCron, cleanupCron };
export default jobProcessorCron; 