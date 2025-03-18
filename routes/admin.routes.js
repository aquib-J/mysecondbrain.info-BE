import { Router } from 'express';
import jobProcessorService from '../services/job.processor.service.js';
import Response from '../utils/Response.js';
import Logger from '../utils/Logger.js';
import authenticateMiddleware from '../middlewares/auth.middleware.js';
import { StatusCodes } from 'http-status-codes';

const logger = new Logger();
const router = Router();

/**
 * @route POST /api/v1/admin/process-jobs
 * @description Manually trigger job processing (admin use only)
 * @access Private
 */
router.post('/process-jobs', authenticateMiddleware, async (req, res) => {
    try {
        logger.info('Manual job processing triggered by user', { userId: req.user.id });

        // Start job processing
        await jobProcessorService.processPendingJobs();

        return Response.success(res, 'Job processing started successfully');
    } catch (error) {
        logger.error('Error during manual job processing', { error });
        return Response.fail(res, 'Failed to process jobs', StatusCodes.INTERNAL_SERVER_ERROR);
    }
});

export default router; 