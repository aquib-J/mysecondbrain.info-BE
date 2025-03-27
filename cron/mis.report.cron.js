/**
 * MIS Report Cron Job
 * Collects system metrics and sends a report every 2 hours
 */
import cron from 'node-cron';
import { Op } from 'sequelize';
import * as uuid from 'uuid';
import sequelize from '../databases/mysql8/sequelizeConnect.js';
import { User, Document, Job, Vector, Chat } from '../databases/mysql8/db-schemas.js';
import Logger from '../utils/Logger.js';
import emailQueueService from '../services/email.queue.js';
import { misReportEmailTemplate } from '../utils/email.templates.js';
import { EMAIL_FROM, NODE_ENV } from '../config/env.js';

// Configure recipient email (you can set this in your .env file)
const MIS_REPORT_RECIPIENT = 'aquib.jansher@gmail.com'; // Update with your email

const logger = new Logger();

// Run every 2 hours
const misReportSchedule = '0 */2 * * *';

/**
 * Get data for new user signups within the specified time range
 * @param {Date} fromTime - Start time
 * @param {Date} toTime - End time
 * @returns {Promise<Array>} - Array of user objects
 */
async function getNewUsers(fromTime, toTime) {
    try {
        const users = await User.findAll({
            where: {
                created_at: {
                    [Op.between]: [fromTime, toTime]
                },
                is_active: true
            },
            attributes: ['id', 'username', 'email', 'metadata', 'signup_ip_address', 'signup_user_location', 'created_at'],
            raw: true
        });

        // Process metadata to ensure IP address and location are available
        return users.map(user => {
            // Initialize metadata if it doesn't exist
            const metadata = user.metadata || {};

            // If IP address isn't in metadata but exists in the root, move it to metadata
            if (!metadata.ipAddress && user.signup_ip_address) {
                metadata.ipAddress = user.signup_ip_address;
            }

            // If location isn't in metadata but exists in the root, move it to metadata
            if (!metadata.location && user.signup_user_location) {
                metadata.location = user.signup_user_location;
            }

            return {
                ...user,
                metadata
            };
        });
    } catch (error) {
        logger.error('Error fetching new users for MIS report', { error });
        return [];
    }
}

/**
 * Get data for new documents uploaded within the specified time range
 * @param {Date} fromTime - Start time
 * @param {Date} toTime - End time
 * @returns {Promise<Array>} - Array of document objects
 */
async function getNewDocuments(fromTime, toTime) {
    try {
        const documents = await Document.findAll({
            where: {
                uploaded_at: {
                    [Op.between]: [fromTime, toTime]
                },
                status: 'active'
            },
            include: [
                {
                    model: User,
                    attributes: ['username'],
                    as: 'User'
                }
            ],
            raw: true,
            nest: true
        });

        return documents.map(doc => ({
            ...doc,
            username: doc.User?.username || `User #${doc.uploaded_by}`
        }));
    } catch (error) {
        logger.error('Error fetching new documents for MIS report', { error });
        return [];
    }
}

/**
 * Get data for jobs created within the specified time range
 * @param {Date} fromTime - Start time
 * @param {Date} toTime - End time
 * @returns {Promise<Array>} - Array of job objects
 */
async function getNewJobs(fromTime, toTime) {
    try {
        return await Job.findAll({
            where: {
                created_at: {
                    [Op.between]: [fromTime, toTime]
                }
            },
            include: [
                {
                    model: Document,
                    attributes: ['filename', 'filesize', 'file_type'],
                    as: 'document'
                }
            ],
            raw: true,
            nest: true
        });
    } catch (error) {
        logger.error('Error fetching new jobs for MIS report', { error });
        return [];
    }
}

/**
 * Get vector statistics within the specified time range
 * @param {Date} fromTime - Start time
 * @param {Date} toTime - End time
 * @returns {Promise<Object>} - Object with vector statistics
 */
async function getVectorStats(fromTime, toTime) {
    try {
        const counts = await Vector.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                created_at: {
                    [Op.between]: [fromTime, toTime]
                }
            },
            group: ['status'],
            raw: true
        });

        const totalCount = counts.reduce((sum, row) => sum + parseInt(row.count), 0);
        const successCount = counts.find(row => row.status === 'success')?.count || 0;
        const inProgressCount = counts.find(row => row.status === 'in_progress')?.count || 0;
        const failedCount = counts.find(row => row.status === 'failed')?.count || 0;

        return {
            totalCount,
            successCount,
            inProgressCount,
            failedCount
        };
    } catch (error) {
        logger.error('Error fetching vector statistics for MIS report', { error });
        return {
            totalCount: 0,
            successCount: 0,
            inProgressCount: 0,
            failedCount: 0
        };
    }
}

/**
 * Get chat statistics within the specified time range
 * @param {Date} fromTime - Start time
 * @param {Date} toTime - End time
 * @returns {Promise<Object>} - Object with chat statistics
 */
async function getChatStats(fromTime, toTime) {
    try {
        // Get chats grouped by title
        const chatsByTitle = await Chat.findAll({
            attributes: [
                'title',
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                created_at: {
                    [Op.between]: [fromTime, toTime]
                }
            },
            group: ['title', 'status'],
            raw: true
        });

        // Get chats grouped by user
        const chatsByUser = await sequelize.query(`
            SELECT u.username, 
                   SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as activeCount,
                   SUM(CASE WHEN c.status = 'deleted' THEN 1 ELSE 0 END) as deletedCount,
                   COUNT(*) as totalCount
            FROM chats c
            JOIN users u ON c.user_id = u.id
            WHERE c.created_at BETWEEN :fromTime AND :toTime
            GROUP BY u.username
        `, {
            replacements: { fromTime, toTime },
            type: sequelize.QueryTypes.SELECT
        });

        // Get total count
        const totalCount = await Chat.count({
            where: {
                created_at: {
                    [Op.between]: [fromTime, toTime]
                }
            }
        });

        return {
            totalCount,
            byTitle: chatsByTitle,
            byUser: chatsByUser
        };
    } catch (error) {
        logger.error('Error fetching chat statistics for MIS report', { error });
        return {
            totalCount: 0,
            byTitle: [],
            byUser: []
        };
    }
}

/**
 * Send MIS report via email
 * @param {Object} reportData - Collected report data
 * @returns {Promise<boolean>} - Success or failure
 */
async function sendMISReport(reportData) {
    try {
        if (NODE_ENV !== 'production') {
            logger.info('MIS report would be sent in production mode', {
                recipient: MIS_REPORT_RECIPIENT,
                reportSummary: {
                    newUsers: reportData.newUsers.length,
                    newDocuments: reportData.newDocuments.length,
                    newJobs: reportData.jobs.length
                }
            });
            return true;
        }

        // Generate the HTML content from the template
        const htmlContent = misReportEmailTemplate(reportData);

        // Prepare the email job
        const emailJob = {
            type: 'generic',
            to: MIS_REPORT_RECIPIENT,
            subject: `MySecondBrain.info - MIS Report ${new Date().toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            })}`,
            html: htmlContent,
            text: `MIS Report for period ${reportData.timeRange.from.toISOString()} to ${reportData.timeRange.to.toISOString()}`,
            metadata: {
                reportType: 'mis',
                reportPeriod: `${reportData.timeRange.from.toISOString()} - ${reportData.timeRange.to.toISOString()}`
            }
        };

        // Add to email queue
        const result = await emailQueueService.addToQueue(emailJob);

        if (result) {
            logger.info('MIS report email added to queue successfully', {
                recipient: MIS_REPORT_RECIPIENT,
                reportPeriod: `${reportData.timeRange.from.toISOString()} - ${reportData.timeRange.to.toISOString()}`
            });
        } else {
            logger.error('Failed to add MIS report email to queue', {
                recipient: MIS_REPORT_RECIPIENT
            });
        }

        return result;
    } catch (error) {
        logger.error('Error sending MIS report email', { error });
        return false;
    }
}

// Initialize MIS report cron job
const misReportCron = cron.schedule(misReportSchedule, async () => {
    const reportId = uuid.v4();
    try {
        // Calculate time range for the report (past 2 hours)
        const toTime = new Date();
        const fromTime = new Date(toTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours ago

        logger.info('Starting MIS report generation', {
            reportId,
            schedule: misReportSchedule,
            fromTime: fromTime.toISOString(),
            toTime: toTime.toISOString()
        });

        // Collect report data
        const [newUsers, newDocuments, jobs, vectors, chats] = await Promise.all([
            getNewUsers(fromTime, toTime),
            getNewDocuments(fromTime, toTime),
            getNewJobs(fromTime, toTime),
            getVectorStats(fromTime, toTime),
            getChatStats(fromTime, toTime)
        ]);

        // Create report data object
        const reportData = {
            timeRange: {
                from: fromTime,
                to: toTime
            },
            newUsers,
            newDocuments,
            jobs,
            vectors,
            chats
        };

        // Send report via email
        await sendMISReport(reportData);

        logger.info('Completed MIS report generation', {
            reportId,
            completedAt: new Date().toISOString(),
            status: 'success',
            metrics: {
                newUsers: newUsers.length,
                newDocuments: newDocuments.length,
                jobs: jobs.length,
                vectors: vectors.totalCount,
                chats: chats.totalCount
            }
        });
    } catch (error) {
        logger.error('Error in MIS report cron job', {
            reportId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}, {
    scheduled: false // Don't start automatically - will be managed by index.js
});

// Log configuration but don't start job (it will be started by the index)
logger.info('MIS report cron job configured', {
    schedule: misReportSchedule,
    type: 'mis-report',
    recipient: MIS_REPORT_RECIPIENT,
    timestamp: new Date().toISOString()
});

export { misReportCron };
export default misReportCron;
