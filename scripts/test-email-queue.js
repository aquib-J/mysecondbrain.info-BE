#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import emailQueueService from '../services/email.queue.js';
import Logger from '../utils/Logger.js';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get environment from args
const args = process.argv.slice(2);
const env = args[0] || 'production';
const recipientEmail = args[1] || 'aquib.jansher@gmail.com';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) });

const logger = new Logger();

/**
 * Test various queue operations
 */
async function runQueueTest() {
    console.log(`\n========= TESTING EMAIL QUEUE SYSTEM (${env}) =========\n`);

    try {
        // Wait for service to initialize
        console.log('Initializing email queue service...');

        // Create test email jobs
        const testJobs = [
            {
                type: 'generic',
                to: recipientEmail,
                subject: 'Email Queue Test 1 - Simple',
                html: `
          <h1>Email Queue Test - Simple</h1>
          <p>This is a test email sent from the queue system.</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
          <p>Environment: ${env}</p>
        `,
                text: 'Email Queue Test - Simple. This is a test email sent from the queue system.',
                metadata: {
                    test: true,
                    testId: 'simple-test'
                }
            },
            {
                type: 'welcome',
                to: recipientEmail,
                username: 'Test User',
                metadata: {
                    test: true,
                    testId: 'welcome-test'
                }
            }
        ];

        // Add test jobs to queue
        console.log(`\nAdding ${testJobs.length} test jobs to queue...`);
        for (const job of testJobs) {
            const result = await emailQueueService.addToQueue(job);
            console.log(`Added ${job.type} job for ${job.to}: ${result ? 'Success' : 'Failed'}`);
        }

        // Check queue stats
        console.log('\nChecking queue stats...');
        const stats = await emailQueueService.getQueueStats();
        console.log('Queue statistics:', JSON.stringify(stats, null, 2));

        // Check if we should force-add a failed job for testing
        const testFailedJob = args.includes('--test-failure');
        if (testFailedJob) {
            console.log('\nCreating an intentionally bad job to test failure handling...');
            // Add a job with invalid data that will fail
            const badJob = {
                type: 'generic',
                to: 'invalid-email',  // Intentionally invalid email
                subject: 'This job should fail',
                html: '<p>Test failure case</p>',
                metadata: {
                    test: true,
                    shouldFail: true
                }
            };

            await emailQueueService.addToQueue(badJob);
            console.log('Added invalid job to test failure handling');
        }

        // Monitor queue for a short time
        console.log('\nMonitoring queue processing for 15 seconds...');

        // Check stats every 3 seconds for 15 seconds
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const currentStats = await emailQueueService.getQueueStats();
            console.log(`[${i + 1}/5] Current queue state:`, JSON.stringify(currentStats, null, 2));
        }

        // Check for failed jobs at the end
        console.log('\nChecking dead letter queue...');
        const deadLetterJobs = await emailQueueService.getDeadLetterJobs();

        if (deadLetterJobs.length > 0) {
            console.log(`Found ${deadLetterJobs.length} failed jobs:`);
            deadLetterJobs.forEach((job, index) => {
                console.log(`\nFailed Job #${index + 1}:`);
                console.log(`  ID: ${job.id}`);
                console.log(`  Type: ${job.type}`);
                console.log(`  To: ${job.to}`);
                console.log(`  Last Error: ${job.lastError}`);
                console.log(`  Retries: ${job.retries}`);
            });

            // Test retry functionality
            if (deadLetterJobs.length > 0 && args.includes('--test-retry')) {
                const jobToRetry = deadLetterJobs[0];
                console.log(`\nTesting retry functionality with job: ${jobToRetry.id}`);
                const retryResult = await emailQueueService.retryDeadLetterJob(jobToRetry.id);
                console.log(`Retry result: ${retryResult ? 'Success' : 'Failed'}`);
            }
        } else {
            console.log('No failed jobs found - all emails processed successfully!');
        }

        // Final stats
        const finalStats = await emailQueueService.getQueueStats();
        console.log('\nFinal queue statistics:', JSON.stringify(finalStats, null, 2));

        console.log('\nEmail queue test completed!');
    } catch (error) {
        console.error('Error running email queue test:', error);
    } finally {
        // Allow emails to be processed and gracefully shutdown
        await new Promise(resolve => setTimeout(resolve, 5000));
        emailQueueService.shutdown();
        console.log('\nEmail queue service shutdown. Exiting...');
        // Exit after a delay to allow logs to flush
        setTimeout(() => process.exit(0), 1000);
    }
}

// Run the test
runQueueTest(); 