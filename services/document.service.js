import S3 from '../utils/s3.utils.js';
import Logger from '../utils/Logger.js';
import { Document, Job } from '../databases/mysql8/db-schemas.js';
import * as uuid from 'uuid';
import sequelize from '../databases/mysql8/sequelizeConnect.js';
import { Op } from 'sequelize';
import pdfParser from '../utils/pdf-parse-wrapper.js';
import mammoth from 'mammoth';
import jobService from './job.service.js';
import weaviateService from './weaviate/weaviate.service.js';

const logger = new Logger();


const MimeTypesExtensionMap = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/json': 'json',
    'text/plain': 'txt'
};



class DocumentService {

    /**
     * Upload a document and create necessary database entries
     * @param {Buffer} fileBuffer - The file buffer to upload
     * @param {string} originalName - Original name of the file
     * @param {string} contentType - mime type of the file
     * @param {number} userId - ID of the user uploading the document
     * @returns {Promise<Document>}
     */
    async uploadDocument(fileBuffer, originalName, contentType, userId) {
        let transaction;
        try {
            transaction = await sequelize.transaction();
            // Generate a unique key for S3
            const fileExtension = MimeTypesExtensionMap[contentType];
            const key = this.#generateKey(originalName, userId, fileExtension);

            // Upload to S3
            const s3Result = await S3.upload(fileBuffer, key, contentType);

            // Create document entry
            const pages = await this.#extractPages(fileBuffer, contentType);
            const document = await Document.create({
                filename: originalName,
                filesize: fileBuffer.length,
                file_type: fileExtension,
                pages,
                uploaded_by: userId,
                s3_upload_url: s3Result.Location,
                status: 'active'
            }, { transaction });

            // Create job entry for processing
            await jobService.createJob(document.id, this.#getJobType(contentType), {
                pages,
                job_type: this.#getJobType(contentType),
                userId: userId  // Include userId in job metadata
            }, transaction);

            await transaction.commit();
            return document;
        } catch (error) {
            logger.error('Error uploading document', { error });
            if (transaction) await transaction.rollback();
            throw error;
        }
    }

    /**
     * Update a document
     * @param {number} documentId - ID of the document to update
     * @param {Buffer} fileBuffer - New file buffer
     * @param {string} originalName - New original name
     * @param {string} contentType - file mime type
     * @returns {Promise<Document>}
     */
    async updateDocument(documentId, fileBuffer = null, originalName = null, contentType = null) {
        let transaction;
        try {
            transaction = await sequelize.transaction();
            const document = await Document.findOne({
                where: {
                    id: documentId,
                    status: 'active'
                }
            });
            if (!document) {
                await transaction.rollback();
                throw new Error('Document not found');
            }

            document.filename = originalName || document.filename;

            if (!fileBuffer) {
                await document.save({ transaction });
                await transaction.commit();
                return document;
            }

            if (document.file_type !== MimeTypesExtensionMap[contentType]) {
                throw new Error('Trying to update document with different file type, Please upload a new document instead');
            }
            // Delete old file from S3
            const oldKey = S3.fetchKeyFromDbUrl(document.s3_upload_url);
            if (oldKey) await S3.delete(oldKey);

            // Generate new key
            const fileExtension = document.file_type;
            const key = this.#generateKey(document.filename, document.uploaded_by, fileExtension);

            // Upload new file
            const s3Result = await S3.upload(fileBuffer, key, contentType);
            const pages = await this.#extractPages(fileBuffer, contentType);
            // Update document
            await document.update({
                filename: originalName || document.filename,
                filesize: fileBuffer.length,
                pages,
                s3_upload_url: s3Result.Location,
                status: 'active'
            }, { transaction });

            // Cancel any pending jobs
            const cancelledPendingJob = await jobService.cancelPendingJobs(document.id, transaction);

            if (!cancelledPendingJob) {
                // Delete all vectors for this document from DB and vectorStore (Weaviate)
                const job = await jobService.getJobByDocId(document.id);
                if (job) {
                    //TODO: there is redundancy here, jobService.deleteVectors also removes vectors from weaviate,
                    //  and jobVectors and documentVectors are the same thing
                    await jobService.deleteVectors(job.id, transaction);
                    await weaviateService.deleteDocumentVectors(document.id, document.uploaded_by);
                }
            }

            // Create new job for processing
            await jobService.createJob(document.id, this.#getJobType(contentType), {
                pages,
                job_type: this.#getJobType(contentType),
                userId: document.uploaded_by  // Include userId in job metadata
            }, transaction);

            await transaction.commit();
            return document;
        } catch (error) {
            logger.error('Error updating document', { error });
            if (transaction) await transaction.rollback();
            throw error;
        }
    }

    /**
     * Get document download URL
     * @param {number} documentId - ID of the document
     * @param {{
     * docExists?:boolean,
     * s3_upload_url?:string}} options optional options object
     * @returns {Promise<string>}
     */
    async getDownloadUrl(documentId, options) {
        try {
            let document;
            if (!options?.docExists) {
                console.log('this is not triggered');
                document = await Document.findOne({
                    where: {
                        id: documentId,
                        status: 'active'
                    }
                });
                if (!document) {
                    throw new Error('Document not found');
                }
            }
            const key = S3.fetchKeyFromDbUrl(document?.s3_upload_url || options?.s3_upload_url);
            return S3.getPresignedUrl(key, 3600); // 1 hour
        } catch (error) {
            logger.error('Error getting download URL', { error });
            throw error;
        }
    }

    /**
     * List documents
     * @param {string} userId - ID of the user
     * @param {number} page - Page number
     * @param {number} pageSize - Page size
     * @param {string} search - Search query
     * @returns {Promise<{documents: Document[], totalPages: number, currentPage: number}>}
     */
    async listDocuments(userId, page = 1, pageSize = 10, search = '') {
        //TODO: filter output by keys: filename, filetype, uploaded_by, status, uploaded_at

        try {
            const offset = (page - 1) * pageSize;
            const whereClause = { uploaded_by: userId, status: 'active' };

            if (search) {
                whereClause.filename = { [Op.like]: `%${search}%` };
            }

            const documents = await Document.findAll({
                where: whereClause,
                offset,
                page,
                order: [['uploaded_at', 'DESC']]
            }, {
                attributes: ['id', 'filename', 'filetype', 'uploaded_at']
            });

            for (const document of documents) {
                document.s3_upload_url = await this.getDownloadUrl(document.id, { docExists: true, s3_upload_url: document.s3_upload_url });
            }

            const totalDocuments = await Document.count({ where: whereClause });
            const totalPages = Math.ceil(totalDocuments / pageSize);

            return {
                documents,
                totalPages,
                currentPage: page
            };
        } catch (error) {
            logger.error('Error listing documents', { error });
            throw error;
        }
    }

    /**
     * Delete a document
     * @param {number} documentId - ID of the document
     * @returns {Promise<void>}
     */
    async deleteDocument(documentId) {
        let transaction;
        try {
            transaction = await sequelize.transaction();

            const document = await Document.findOne({
                where: {
                    id: documentId,
                    status: 'active'
                }
            });
            if (!document) {
                await transaction.rollback();
                throw new Error('Document not found');
            }

            // Delete from S3
            await S3.delete(S3.fetchKeyFromDbUrl(document.s3_upload_url));
            logger.info('Document deleted from S3', { documentId });

            // Soft delete document
            await document.update({ status: 'deleted', deleted_at: new Date() }, { transaction });
            logger.info('Document soft deleted', { documentId });
            // Cancel any pending jobs
            const cancelledPendingJob = await jobService.cancelPendingJobs(document.id, transaction);

            if (!cancelledPendingJob) {
                // Delete all vectors for this document from DB and vectorStore (Weaviate)
                const job = await jobService.getJobByDocId(document.id);
                if (job) {
                    await jobService.deleteVectors(job.id, transaction);
                    await weaviateService.deleteDocumentVectors(document.id, document.uploaded_by);
                }
            }

            await transaction.commit();
            logger.info('Document deleted successfully', { documentId });
        } catch (error) {
            logger.error('Error deleting document', { error });
            if (transaction) await transaction.rollback();
            throw error;
        }
    }

    /**
     * Get document status
     * @param {number} documentId - ID of the document
     * @returns {Promise<{documentStatus: string, jobStatus: string, jobDueAt: Date}>}
     */
    async getDocumentStatus(documentId) {
        try {
            const document = await Document.findOne({
                where: {
                    id: documentId,
                    status: 'active'
                }
            });

            if (!document) {
                throw new Error('Document not found');
            }

            // If the document exists, try to get its job status
            let jobData = null;
            try {
                jobData = await sequelize.query(`
                    SELECT 
                        j.status as job_status,
                        j.created_at as job_created
                    FROM jobs j
                    WHERE j.doc_id = :documentId
                    ORDER BY j.created_at DESC
                    LIMIT 1
                `, {
                    replacements: { documentId },
                    type: sequelize.QueryTypes.SELECT
                });
            } catch (dbError) {
                logger.warn('Error querying job status, using defaults', { error: dbError, documentId });
                // Continue execution with null jobData
            }

            // Return document status with job info if available
            return {
                documentUrl: await this.getDownloadUrl(document.id, {
                    docExists: true,
                    s3_upload_url: document.s3_upload_url
                }),
                documentId: document.id,
                docName: document.filename,
                docType: document.file_type,
                docStatus: document.status,
                jobStatus: jobData && jobData.length > 0 ? jobData[0].job_status : 'unknown',
                jobDueAt: jobData && jobData.length > 0 ? jobData[0].job_created : null
            };
        } catch (error) {
            logger.error('Error getting document status', { error, documentId });

            // For connection errors, return a default status rather than failing completely
            if (error.code === 'ECONNREFUSED' || error.name === 'SequelizeConnectionError') {
                logger.warn('Database connection error when checking document status, using default values', { documentId });
                return {
                    documentStatus: 'active', // Assume document is active if we can't check
                    jobStatus: 'unknown',     // Can't determine job status
                    jobDueAt: null
                };
            }

            throw error;
        }
    }

    /**
     * Get job type based on content type
     * @private
     * @param {string} contentType - Content type of the file
     * @returns { pdf_processing, doc_processing, json_processing, docx_processing }
     */
    #getJobType(contentType) {
        return MimeTypesExtensionMap[contentType] + '_processing';
    }

    /**
     * Extract pages from a file
     * @private
     * @param {Buffer} fileBuffer - The file buffer to extract pages from
     * @param {string} fileType - mime type of the file
     * @returns {Promise<number>}
     */
    async #extractPages(fileBuffer, fileType) {
        let pages = 0;
        switch (fileType) {
            case 'application/pdf':
                const pdfData = await pdfParser(fileBuffer);
                pages = pdfData.numpages;
                break;
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                const docData = await mammoth.extractRawText({ buffer: fileBuffer });
                pages = Math.ceil(docData.value.split('\n').length / 25); // Simple estimate: 25 lines per page
                break;
            case 'application/json':
                const jsonData = JSON.parse(fileBuffer);
                pages = Array.isArray(jsonData) ? jsonData.length : Object.keys(jsonData).length;
                break;
            case 'text/plain':
                const textContent = fileBuffer.toString('utf-8');
                pages = Math.ceil(textContent.split('\n').length / 40); // Simple estimate: 40 lines per page
                break;
            case 'application/msword':
                // For DOC files, use a reasonable estimate since extraction is complex
                pages = Math.ceil(fileBuffer.length / 4096); // Simple estimate based on average page size
                break;
            default:
                throw new Error('Unsupported file type');
        }
        return pages;
    }

    #generateKey(originalName, userId, fileExtension) {
        try {
            // Generate a UUID without using the v4 function directly
            const uniqueId = uuid.v4();
            return `documents/${userId}/${uniqueId}.${originalName}.${fileExtension}`;
        } catch (error) {
            logger.error('Error generating key', { error });
            // Fallback to timestamp-based unique ID if UUID fails
            const timestamp = new Date().getTime();
            const random = Math.floor(Math.random() * 10000);
            return `documents/${userId}/${timestamp}-${random}.${originalName}.${fileExtension}`;
        }
    };

    /**
     * Check if a file type is allowed
     * @param {string} mimeType - MIME type of the file
     * @returns {boolean}
     */
    isAllowedFileType(mimeType) {
        return MimeTypesExtensionMap[mimeType] !== undefined;
    };
}

export default new DocumentService();
