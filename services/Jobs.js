import { Job, Document, Vector } from '../databases/mysql8/db-schemas.js';
import { Op } from 'sequelize';
import Logger from '../utils/Logger.js';
import sequelize from '../databases/mysql8/sequelizeConnect.js';

const logger = new Logger();

class JobService {
    /**
     * Create a new job
     * @param {number} docId - Document ID
     * @param {string} jobType - Type of job (e.g., 'pdf_processing', 'json_processing')
     * @param {Object} metadata - Additional metadata for the job
     * @param {Sequelize.Transaction} [transaction] - Optional transaction object
     * @returns {Promise<Job>}
     */
    async createJob(docId, jobType, metadata = {}, transaction = null) {
        try {
            const job = await Job.create({
                doc_id: docId,
                status: 'pending',
                metadata: {
                    ...metadata,
                    job_type: jobType
                },
                service: 'secondbrain',
                resource: 'document_processing'
            }, { transaction });
            logger.info('Job created successfully', { jobId: job.id, docId });
            return job;
        } catch (error) {
            logger.error('Error creating job', { error, docId });
            throw error;
        }
    }

    /**
     * Get a job by Document ID
     * @param {number} docId - Document ID
     * @returns {Promise<Job>}
     */
    async getJobByDocId(docId) {
        try {
            const job = await Job.findOne({
                where: { doc_id: docId },
                status: { [Op.notIn]: ['cancelled', 'pending'] },
                order: [['created_at', 'DESC']]
            });

            if (!job) {
                logger.info('No job found', { docId });
                return null;
            }
            logger.info('Job found', { job });

            return job;
        } catch (error) {
            logger.error('Error getting job', { error, docId });
            throw error;
        }
    }

    /**
     * Update job status
     * @param {number} jobId - Job ID
     * @param {string} status - New status ('pending', 'in_progress', 'success', 'failed', 'cancelled')
     * @param {Object} metadata - Additional metadata to update
     * @returns {Promise<Job>}
     */
    async updateJobStatus(jobId, status, metadata = null) {
        try {
            const job = await Job.findByPk(jobId);

            if (!job) {
                throw new Error('Job not found');
            }

            const updateData = { status };

            if (status === 'cancelled') {
                updateData.cancelled_at = new Date();
            }

            if (metadata) {
                updateData.metadata = {
                    ...job.metadata,
                    ...metadata
                };
            }

            await job.update(updateData);

            logger.info('Job status updated', { jobId, status });
            return job;
        } catch (error) {
            logger.error('Error updating job status', { error, jobId });
            throw error;
        }
    }

    /**
     * Get pending jobs
     * @param {number} limit - Maximum number of jobs to retrieve
     * @returns {Promise<Array<Job>>}
     */
    async getPendingJobs(limit = 10) {
        try {
            const pendingJobs = await Job.findAll({
                where: {
                    status: 'pending',
                    created_at: {
                        [Op.gte]: new Date(Date.now() - 5000) // Jobs created in the last 5 seconds
                    }
                },
                include: [{
                    model: Document,
                    required: true,
                    where: {
                        status: 'active'
                    }
                }],
                order: [['created_at', 'ASC']],
                limit
            });

            return pendingJobs;
        } catch (error) {
            logger.error('Error getting pending jobs', { error });
            throw error;
        }
    }

    /**
     * Cancel all pending jobs for a document
     * @param {number} docId - Document ID
     * @param {Sequelize.Transaction} [transaction] - Optional transaction object
     * @returns {Promise<number>} - Number of jobs cancelled
     */
    async cancelPendingJobs(docId, transaction = null) {
        try {
            const result = await Job.update(
                {
                    status: 'cancelled',
                    cancelled_at: new Date()
                },
                {
                    where: {
                        doc_id: docId,
                        status: 'pending'
                    },
                    transaction
                }
            );

            logger.info('Pending jobs cancelled', { docId, count: result[0] });
            return result[0]; // Number of rows affected
        } catch (error) {
            logger.error('Error cancelling pending jobs', { error, docId });
            throw error;
        }
    }

    /**
     * Get job statistics
     * @returns {Promise<Object>} - Job statistics
     */
    async getJobStats() {
        try {
            const stats = await Job.findAll({
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                group: ['status']
            });

            const result = {
                total: 0,
                pending: 0,
                in_progress: 0,
                success: 0,
                failed: 0,
                cancelled: 0
            };

            stats.forEach(stat => {
                result[stat.status] = parseInt(stat.get('count'));
                result.total += parseInt(stat.get('count'));
            });

            return result;
        } catch (error) {
            logger.error('Error getting job stats', { error });
            throw error;
        }
    }

    /**
     * Delete vectors for a job
     * @param {number} jobId - Job ID
     * @param {Sequelize.Transaction} [transaction] - Optional transaction object
     * @returns {Promise<number>} - Number of vectors deleted
     */
    async deleteVectors(jobId, transaction = null) {

        try {
            const result = await Vector.update(
                { is_active: false },
                {
                    where: { job_id: jobId },
                    transaction
                }
            );

            logger.info('Vectors deleted', { jobId, count: result[0] });
            return result[0]; // Number of rows affected
        } catch (error) {
            logger.error('Error deleting vectors', { error, jobId });
            throw error;
        }
    }
}

export default new JobService();
