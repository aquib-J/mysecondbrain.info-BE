/**
 * Script to archive log files to AWS S3
 * Designed to run daily via cron to back up logs
 */

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import Logger from '../utils/Logger.js';
import { AWS_REGION, AWS_S3_BUCKET_NAME } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const LOG_DIR = path.join(rootDir, 'logs');

// S3 configuration
const S3_CONFIG = {
    bucketName: AWS_S3_BUCKET_NAME,
    logPrefix: 'logs/', // S3 prefix for logs
    region: AWS_REGION,
    // Age threshold for archiving (default: 1 day)
    archiveAge: 24 * 60 * 60 * 1000,
    // Whether to delete local logs after successful archiving
    deleteAfterArchive: false
};

const logger = new Logger();

// Initialize S3 client
const s3Client = new S3Client({
    region: S3_CONFIG.region
});

/**
 * Get yesterday's date in YYYY-MM-DD format
 * @returns {string} - Yesterday's date
 */
function getYesterdayDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
}

/**
 * Get file stats with error handling
 * @param {string} filePath - Path to the file
 * @returns {Object|null} - File stats or null if error
 */
function getFileStats(filePath) {
    try {
        return fs.statSync(filePath);
    } catch (error) {
        logger.warn(`Error getting file stats for ${filePath}`, { error: error.message });
        return null;
    }
}

/**
 * Check if a file should be archived based on age and pattern
 * @param {string} filePath - Path to the file
 * @param {Object} stats - File stats
 * @returns {boolean} - Whether the file should be archived
 */
function shouldArchive(filePath, stats) {
    if (!stats) return false;

    // Only archive log files
    if (!filePath.endsWith('.log') && !filePath.endsWith('.log.gz')) return false;

    // Check if file is old enough to archive
    const fileAge = Date.now() - stats.mtimeMs;
    return fileAge >= S3_CONFIG.archiveAge;
}

/**
 * Upload a file to S3
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - Whether the upload was successful
 */
async function uploadToS3(filePath) {
    const filename = path.basename(filePath);
    const yesterdayDate = getYesterdayDate();
    const s3Key = `${S3_CONFIG.logPrefix}${yesterdayDate}/${filename}`;

    try {
        const fileContent = fs.readFileSync(filePath);

        const params = {
            Bucket: S3_CONFIG.bucketName,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'application/octet-stream'
        };

        await s3Client.send(new PutObjectCommand(params));

        logger.info(`Uploaded ${filePath} to S3: ${s3Key}`);
        return true;
    } catch (error) {
        logger.error(`Error uploading ${filePath} to S3`, { error: error.message, stack: error.stack });
        return false;
    }
}

/**
 * Delete a local file after successful archiving
 * @param {string} filePath - Path to the file
 * @returns {boolean} - Whether the file was deleted successfully
 */
function deleteLocalFile(filePath) {
    try {
        fs.unlinkSync(filePath);
        logger.info(`Deleted local file after archiving: ${filePath}`);
        return true;
    } catch (error) {
        logger.error(`Error deleting local file ${filePath}`, { error: error.message });
        return false;
    }
}

/**
 * Archive log files to S3
 * @returns {Promise<Object>} - Statistics about the archival operation
 */
async function archiveLogs() {
    logger.info('Starting log archival task');

    const stats = {
        scanned: 0,
        archived: 0,
        failed: 0,
        deleted: 0
    };

    if (!fs.existsSync(LOG_DIR)) {
        logger.warn(`Log directory doesn't exist: ${LOG_DIR}`);
        return stats;
    }

    // Get log files
    const files = fs.readdirSync(LOG_DIR);

    // Process each file
    for (const file of files) {
        const filePath = path.join(LOG_DIR, file);
        const fileStats = getFileStats(filePath);

        if (!fileStats || !fileStats.isFile()) continue;

        stats.scanned++;

        if (shouldArchive(filePath, fileStats)) {
            // Upload to S3
            const uploaded = await uploadToS3(filePath);

            if (uploaded) {
                stats.archived++;

                // Delete local file if configured
                if (S3_CONFIG.deleteAfterArchive) {
                    if (deleteLocalFile(filePath)) {
                        stats.deleted++;
                    }
                }
            } else {
                stats.failed++;
            }
        }
    }

    logger.info('Log archival task completed', stats);
    return stats;
}

// Run the archival task if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    archiveLogs().catch(error => {
        logger.error('Error running log archival task', { error: error.message, stack: error.stack });
        process.exit(1);
    });
}

export default archiveLogs; 