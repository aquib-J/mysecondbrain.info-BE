import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../utils/Logger.js';
import runCleanup from '../scripts/cleanup-files.js';
import archiveLogs from '../scripts/archive-logs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Ensure scripts directory exists
const scriptsDir = path.join(rootDir, 'scripts');
if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
}

const logger = new Logger();

// Daily log archival - runs at 1:00 AM UTC
const logArchiveSchedule = '0 1 * * *';

// Weekly temp file cleanup - runs at 2:00 AM UTC every Sunday
const tempFileCleanupSchedule = '0 2 * * 0';

// Initialize log archival cron job
const logArchiveCron = cron.schedule(logArchiveSchedule, async () => {
    const operationId = Date.now().toString();
    try {
        logger.info('Starting scheduled log archival task', {
            operationId,
            schedule: logArchiveSchedule,
            timestamp: new Date().toISOString()
        });

        await archiveLogs();

        logger.info('Completed log archival task', {
            operationId,
            completedAt: new Date().toISOString(),
            status: 'success'
        });
    } catch (error) {
        logger.error('Error in log archival cron job', {
            operationId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}, {
    scheduled: false // Don't start automatically - will be managed by index.js
});

// Initialize temp file cleanup cron job
const tempFileCleanupCron = cron.schedule(tempFileCleanupSchedule, () => {
    const operationId = Date.now().toString();
    try {
        logger.info('Starting scheduled temp file cleanup task', {
            operationId,
            schedule: tempFileCleanupSchedule,
            timestamp: new Date().toISOString()
        });

        runCleanup();

        logger.info('Completed temp file cleanup task', {
            operationId,
            completedAt: new Date().toISOString(),
            status: 'success'
        });
    } catch (error) {
        logger.error('Error in temp file cleanup cron job', {
            operationId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}, {
    scheduled: false // Don't start automatically - will be managed by index.js
});

// Log configuration but don't start jobs (they'll be started by the index)
logger.info('Log archival cron job configured', {
    schedule: logArchiveSchedule,
    type: 'log-archival',
    timestamp: new Date().toISOString()
});

logger.info('Temp file cleanup cron job configured', {
    schedule: tempFileCleanupSchedule,
    type: 'temp-file-cleanup',
    timestamp: new Date().toISOString()
});

export { logArchiveCron, tempFileCleanupCron };
export default { logArchiveCron, tempFileCleanupCron }; 