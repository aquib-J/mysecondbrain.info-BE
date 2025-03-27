import { Router } from 'express';
import jobProcessorService from '../services/job.processor.service.js';
import Response from '../utils/Response.js';
import Logger from '../utils/Logger.js';
import authenticateMiddleware, { requireAdmin } from '../middlewares/auth.middleware.js';
import { StatusCodes } from 'http-status-codes';
import emailQueueService from '../services/email.queue.js';

const logger = new Logger();
const router = Router();

/**
 * @route POST /api/v1/admin/process-jobs
 * @description Manually trigger job processing (admin use only)
 * @access Private/Admin
 */
router.post('/process-jobs', requireAdmin, async (req, res) => {
    try {
        logger.info('Manual job processing triggered by admin', {
            userId: req.user.id,
            username: req.user.username
        });

        // Start job processing
        await jobProcessorService.processPendingJobs();

        return Response.success(res, 'Job processing started successfully');
    } catch (error) {
        logger.error('Error during manual job processing', { error });
        return Response.fail(res, 'Failed to process jobs', StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

/**
 * @route GET /api/v1/admin/email/queue/stats
 * @desc Get email queue statistics
 * @access Admin only
 */
router.get('/email/queue/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await emailQueueService.getQueueStats();
        return Response.success(res, 'Email queue statistics retrieved', stats);
    } catch (error) {
        return Response.fail(res, 'Failed to retrieve email queue statistics', StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

/**
 * @route GET /api/v1/admin/email/queue/dead
 * @desc Get all jobs in the dead letter queue
 * @access Admin only
 */
router.get('/email/queue/dead', requireAdmin, async (req, res) => {
    try {
        const jobs = await emailQueueService.getDeadLetterJobs();
        return Response.success(res, 'Dead letter jobs retrieved', { jobs });
    } catch (error) {
        return Response.fail(res, 'Failed to retrieve dead letter jobs', StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

/**
 * @route POST /api/v1/admin/email/queue/retry/:jobId
 * @desc Retry a job from the dead letter queue
 * @access Admin only
 */
router.post('/email/queue/retry/:jobId', requireAdmin, async (req, res) => {
    try {
        const { jobId } = req.params;
        const success = await emailQueueService.retryDeadLetterJob(jobId);

        if (success) {
            return Response.success(res, 'Job moved to main queue for retry');
        } else {
            return Response.fail(res, 'Job not found in dead letter queue', StatusCodes.NOT_FOUND);
        }
    } catch (error) {
        return Response.fail(res, 'Failed to retry job', StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

/**
 * @route DELETE /api/v1/admin/email/queue/dead
 * @desc Clear the dead letter queue
 * @access Admin only
 */
router.delete('/email/queue/dead', requireAdmin, async (req, res) => {
    try {
        await emailQueueService.clearDeadLetterQueue();
        return Response.success(res, 'Dead letter queue cleared');
    } catch (error) {
        return Response.fail(res, 'Failed to clear dead letter queue', StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

export default router; 