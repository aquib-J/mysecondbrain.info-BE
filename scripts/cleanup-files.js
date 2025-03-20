/**
 * Maintenance script to clean up old files from doc-store and output-store
 * Run weekly via cron to remove files that weren't properly cleaned up during processing
 */

import fs from 'fs';
import path from 'path';
import Logger from '../utils/Logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Configure cleanup parameters
const CLEANUP_CONFIG = {
    // Directories to clean up
    directories: [
        path.join(rootDir, 'doc-store'),
        path.join(rootDir, 'output-store')
    ],
    // Age threshold in milliseconds (7 days by default)
    maxAge: 7 * 24 * 60 * 60 * 1000,
    // File extensions to consider for cleanup (empty array means all files)
    fileExtensions: [],
    // Whether to delete empty directories
    removeEmptyDirs: true
};

const logger = new Logger();

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
 * Check if a file should be cleaned up based on age and extension
 * @param {string} filePath - Path to the file
 * @param {Object} stats - File stats
 * @returns {boolean} - Whether the file should be cleaned up
 */
function shouldCleanup(filePath, stats) {
    if (!stats) return false;

    // Check file age
    const fileAge = Date.now() - stats.mtimeMs;
    if (fileAge < CLEANUP_CONFIG.maxAge) return false;

    // Check file extension if extensions are specified
    if (CLEANUP_CONFIG.fileExtensions.length > 0) {
        const ext = path.extname(filePath).toLowerCase();
        if (!CLEANUP_CONFIG.fileExtensions.includes(ext)) return false;
    }

    return true;
}

/**
 * Delete a file with error handling
 * @param {string} filePath - Path to the file
 * @returns {boolean} - Whether the file was deleted successfully
 */
function deleteFile(filePath) {
    try {
        fs.unlinkSync(filePath);
        logger.info(`Deleted file: ${filePath}`);
        return true;
    } catch (error) {
        logger.error(`Error deleting file ${filePath}`, { error: error.message });
        return false;
    }
}

/**
 * Check if a directory is empty
 * @param {string} dirPath - Path to the directory
 * @returns {boolean} - Whether the directory is empty
 */
function isDirectoryEmpty(dirPath) {
    try {
        const files = fs.readdirSync(dirPath);
        return files.length === 0;
    } catch (error) {
        logger.warn(`Error checking if directory is empty: ${dirPath}`, { error: error.message });
        return false;
    }
}

/**
 * Delete an empty directory
 * @param {string} dirPath - Path to the directory
 * @returns {boolean} - Whether the directory was deleted successfully
 */
function deleteEmptyDirectory(dirPath) {
    try {
        fs.rmdirSync(dirPath);
        logger.info(`Deleted empty directory: ${dirPath}`);
        return true;
    } catch (error) {
        logger.warn(`Error deleting directory ${dirPath}`, { error: error.message });
        return false;
    }
}

/**
 * Clean up a directory recursively
 * @param {string} directory - Directory to clean up
 * @returns {Object} - Statistics about the cleanup operation
 */
function cleanupDirectory(directory) {
    const stats = {
        scanned: 0,
        deleted: 0,
        failed: 0,
        directoriesRemoved: 0
    };

    if (!fs.existsSync(directory)) {
        logger.warn(`Directory doesn't exist: ${directory}`);
        return stats;
    }

    // Get all files and directories
    const items = fs.readdirSync(directory);

    // Process each item
    for (const item of items) {
        const itemPath = path.join(directory, item);
        const itemStats = getFileStats(itemPath);

        if (!itemStats) continue;

        if (itemStats.isDirectory()) {
            // Recursively clean up subdirectory
            const subStats = cleanupDirectory(itemPath);

            // Merge stats
            stats.scanned += subStats.scanned;
            stats.deleted += subStats.deleted;
            stats.failed += subStats.failed;
            stats.directoriesRemoved += subStats.directoriesRemoved;

            // Remove empty directory if configured
            if (CLEANUP_CONFIG.removeEmptyDirs && isDirectoryEmpty(itemPath)) {
                if (deleteEmptyDirectory(itemPath)) {
                    stats.directoriesRemoved++;
                }
            }
        } else if (itemStats.isFile()) {
            stats.scanned++;

            // Check if file should be cleaned up
            if (shouldCleanup(itemPath, itemStats)) {
                if (deleteFile(itemPath)) {
                    stats.deleted++;
                } else {
                    stats.failed++;
                }
            }
        }
    }

    return stats;
}

/**
 * Main function to clean up all configured directories
 */
function runCleanup() {
    logger.info('Starting file cleanup task');

    const totalStats = {
        scanned: 0,
        deleted: 0,
        failed: 0,
        directoriesRemoved: 0
    };

    // Process each configured directory
    for (const directory of CLEANUP_CONFIG.directories) {
        logger.info(`Cleaning up directory: ${directory}`);

        try {
            const stats = cleanupDirectory(directory);

            // Update total stats
            totalStats.scanned += stats.scanned;
            totalStats.deleted += stats.deleted;
            totalStats.failed += stats.failed;
            totalStats.directoriesRemoved += stats.directoriesRemoved;

            logger.info(`Finished cleaning ${directory}`, {
                scanned: stats.scanned,
                deleted: stats.deleted,
                failed: stats.failed,
                directoriesRemoved: stats.directoriesRemoved
            });
        } catch (error) {
            logger.error(`Error cleaning up directory ${directory}`, { error: error.message });
        }
    }

    logger.info('File cleanup task completed', totalStats);
}

// Run the cleanup if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runCleanup();
}

export default runCleanup; 