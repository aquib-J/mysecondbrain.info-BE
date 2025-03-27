#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import emailQueueService from '../services/email.queue.js';
import redisConnect from '../databases/redis/redisConnect.js';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get environment from args
const args = process.argv.slice(2);
const env = args[0] || 'production';
const action = args[1] || 'status';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) });

/**
 * Display status of the email queue system
 */
async function showQueueStatus() {
    console.log(`\n========= EMAIL QUEUE STATUS (${env}) =========\n`);

    try {
        // Check Redis connection
        console.log('Checking Redis connection...');
        const client = await redisConnect.getClient();
        if (!client) {
            console.error('❌ ERROR: Redis client not available');
            process.exit(1);
        }

        try {
            const pingResult = await client.ping();
            console.log(`Redis ping: ${pingResult === 'PONG' ? '✅ Connected' : '❌ Connection issue'}`);
        } catch (error) {
            console.error('❌ ERROR: Redis ping failed:', error.message);
            process.exit(1);
        }

        // Get queue statistics
        console.log('\nFetching queue statistics...');
        const stats = await emailQueueService.getQueueStats();
        console.log('\nCurrent Queue Status:');
        console.log('-------------------');
        console.log(`Queue length: ${stats.queued}`);
        console.log(`Currently processing: ${stats.processing}`);
        console.log(`Failed jobs: ${stats.failed}`);
        console.log(`Total jobs: ${stats.total}`);
        console.log(`Timestamp: ${stats.timestamp}`);

        // Check for dead letter queue content
        if (stats.failed > 0) {
            console.log('\nRetrieving failed jobs...');
            const deadLetterJobs = await emailQueueService.getDeadLetterJobs();

            console.log('\nFailed Jobs:');
            console.log('-----------');

            deadLetterJobs.forEach((job, index) => {
                console.log(`\n#${index + 1}: ${job.id || 'Unknown ID'}`);
                console.log(`  Type: ${job.type || 'Unknown'}`);
                console.log(`  To: ${job.to || 'Unknown recipient'}`);
                console.log(`  Created: ${job.createdAt || 'Unknown'}`);
                console.log(`  Last error: ${job.lastError || 'Unknown error'}`);
                console.log(`  Attempts: ${job.retries || 0}`);
            });
        }

        // Additional debugging info
        if (action === 'debug') {
            try {
                console.log('\nChecking queue key contents...');
                // List of all queue-related keys
                const keys = await client.keys('email:*');
                console.log(`Found ${keys.length} email queue-related keys in Redis`);

                if (keys.length > 0) {
                    console.log('\nDetailed key information:');
                    for (const key of keys) {
                        const type = await client.type(key);
                        console.log(`\nKey: ${key}`);
                        console.log(`Type: ${type}`);

                        if (type === 'list') {
                            const length = await client.lLen(key);
                            console.log(`Length: ${length}`);

                            if (length > 0 && length < 5) {
                                // Show sample items for small lists
                                const items = await client.lRange(key, 0, -1);
                                console.log('Items:');
                                items.forEach((item, i) => {
                                    try {
                                        const parsed = JSON.parse(item);
                                        console.log(`  #${i + 1}: ${parsed.id} - ${parsed.type} to ${parsed.to}`);
                                    } catch (e) {
                                        console.log(`  #${i + 1}: (parsing error) ${item.substring(0, 50)}...`);
                                    }
                                });
                            }
                        } else if (type === 'string') {
                            const ttl = await client.ttl(key);
                            console.log(`TTL: ${ttl} seconds`);

                            // If this is a processing queue item, show details
                            if (key.startsWith(`${emailQueueService.processingQueueName}:`)) {
                                const value = await client.get(key);
                                try {
                                    const parsed = JSON.parse(value);
                                    console.log(`Details: ${parsed.id} - ${parsed.type} to ${parsed.to}`);
                                    console.log(`Status: Processing since ${parsed.createdAt}`);
                                } catch (e) {
                                    console.log(`Value: ${value.substring(0, 100)}...`);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error in debug mode:', error);
            }
        }
    } catch (error) {
        console.error('Error checking queue status:', error);
    } finally {
        // Shutdown services
        console.log('\nShutting down services...');
        emailQueueService.shutdown();
        await redisConnect.close();

        console.log('Done!');
        // Allow time for processes to clean up
        setTimeout(() => process.exit(0), 500);
    }
}

/**
 * Retry a specific failed job or all failed jobs
 */
async function retryFailedJobs(jobId = null) {
    console.log(`\n========= RETRY FAILED EMAIL JOBS (${env}) =========\n`);

    try {
        // Get failed jobs
        const deadLetterJobs = await emailQueueService.getDeadLetterJobs();

        if (deadLetterJobs.length === 0) {
            console.log('No failed jobs to retry.');
            return;
        }

        console.log(`Found ${deadLetterJobs.length} failed jobs.`);

        if (jobId) {
            // Retry specific job
            console.log(`Attempting to retry job: ${jobId}`);

            const job = deadLetterJobs.find(j => j.id === jobId);
            if (!job) {
                console.error(`Job with ID ${jobId} not found in dead letter queue.`);
                return;
            }

            const result = await emailQueueService.retryDeadLetterJob(jobId);
            console.log(`Retry result: ${result ? '✅ Success' : '❌ Failed'}`);

        } else {
            // Retry all jobs
            console.log('Retrying all failed jobs...');

            let successCount = 0;
            let failCount = 0;

            for (const job of deadLetterJobs) {
                const result = await emailQueueService.retryDeadLetterJob(job.id);
                if (result) {
                    successCount++;
                    console.log(`✅ Successfully requeued: ${job.id} (${job.type} to ${job.to})`);
                } else {
                    failCount++;
                    console.log(`❌ Failed to requeue: ${job.id}`);
                }
            }

            console.log(`\nRetry summary: ${successCount} successful, ${failCount} failed`);
        }

        // Show updated stats
        const stats = await emailQueueService.getQueueStats();
        console.log('\nUpdated Queue Status:');
        console.log(`Queue length: ${stats.queued}`);
        console.log(`Failed jobs: ${stats.failed}`);

    } catch (error) {
        console.error('Error retrying failed jobs:', error);
    } finally {
        // Shutdown services
        emailQueueService.shutdown();
        await redisConnect.quit();

        // Allow time for processes to clean up
        setTimeout(() => process.exit(0), 500);
    }
}

/**
 * Clear the dead letter queue
 */
async function clearDeadLetterQueue() {
    console.log(`\n========= CLEAR FAILED EMAIL JOBS (${env}) =========\n`);

    try {
        // Get stats before clearing
        const beforeStats = await emailQueueService.getQueueStats();
        console.log(`Current failed jobs: ${beforeStats.failed}`);

        if (beforeStats.failed === 0) {
            console.log('No failed jobs to clear.');
            return;
        }

        // Confirmation prompt
        console.log('\n⚠️  WARNING: This will permanently delete all failed jobs!');
        console.log('Press Ctrl+C to abort or wait 5 seconds to continue...');

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Clear the queue
        const result = await emailQueueService.clearDeadLetterQueue();

        if (result) {
            console.log('✅ Successfully cleared dead letter queue.');
        } else {
            console.log('❌ Failed to clear dead letter queue.');
        }

        // Get stats after clearing
        const afterStats = await emailQueueService.getQueueStats();
        console.log(`Failed jobs after clearing: ${afterStats.failed}`);

    } catch (error) {
        console.error('Error clearing dead letter queue:', error);
    } finally {
        // Shutdown services
        emailQueueService.shutdown();
        await redisConnect.quit();

        // Allow time for processes to clean up
        setTimeout(() => process.exit(0), 500);
    }
}

// Main function
async function main() {
    switch (action) {
        case 'status':
            await showQueueStatus();
            break;

        case 'debug':
            await showQueueStatus(); // Debug flag is handled within the function
            break;

        case 'retry':
            // Check if a specific job ID was provided
            const jobId = args[2];
            await retryFailedJobs(jobId);
            break;

        case 'retry-all':
            await retryFailedJobs();
            break;

        case 'clear':
            await clearDeadLetterQueue();
            break;

        default:
            console.log(`
Unknown action: ${action}

Available commands:
  node email-queue-status.js [env] status    - Show queue status
  node email-queue-status.js [env] debug     - Show detailed debugging information
  node email-queue-status.js [env] retry [id] - Retry a specific failed job
  node email-queue-status.js [env] retry-all  - Retry all failed jobs
  node email-queue-status.js [env] clear      - Clear all failed jobs

Examples:
  node email-queue-status.js production status
  node email-queue-status.js development retry-all
      `);
            process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
}); 