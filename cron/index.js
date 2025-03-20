/**
 * Centralized cron job manager
 * Imports and exports all application cron jobs for unified management
 */
import { jobProcessorCron, cleanupCron } from './job.processor.cron.js';
import { logArchiveCron, tempFileCleanupCron } from './maintenance.cron.js';
import Logger from '../utils/Logger.js';

const logger = new Logger();

// List of all cron jobs
const cronJobs = {
    // Job processing crons
    jobProcessor: jobProcessorCron,
    vectorCleanup: cleanupCron,

    // Maintenance crons
    logArchival: logArchiveCron,
    tempFileCleanup: tempFileCleanupCron
};

/**
 * Stop all cron jobs
 */
function stopAllCronJobs() {
    logger.info('Stopping all cron jobs');

    for (const [name, cronJob] of Object.entries(cronJobs)) {
        try {
            cronJob.stop();
            logger.info(`Stopped cron job: ${name}`);
        } catch (error) {
            logger.error(`Error stopping cron job: ${name}`, { error: error.message });
        }
    }

    logger.info('All cron jobs stopped');
}

/**
 * Start all cron jobs
 */
function startAllCronJobs() {
    logger.info('Starting all cron jobs');

    for (const [name, cronJob] of Object.entries(cronJobs)) {
        try {
            cronJob.start();
            logger.info(`Started cron job: ${name}`);
        } catch (error) {
            logger.error(`Error starting cron job: ${name}`, { error: error.message });
        }
    }

    logger.info('All cron jobs started');
}

/**
 * Get status of all cron jobs
 */
function getCronStatus() {
    const status = {};

    for (const [name, cronJob] of Object.entries(cronJobs)) {
        status[name] = {
            running: !cronJob.getStatus.includes('stop'),
            schedule: cronJob.getExpression()
        };
    }

    return status;
}

// Export all cron jobs and management functions
export { cronJobs, startAllCronJobs, stopAllCronJobs, getCronStatus };
export default { cronJobs, startAllCronJobs, stopAllCronJobs, getCronStatus }; 