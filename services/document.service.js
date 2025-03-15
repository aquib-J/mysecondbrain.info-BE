import { uploadToS3, getPresignedUrl, deleteFromS3, fetchKeyFromDbUrl } from '../utils/s3.utils.js';
import Logger from '../utils/Logger.js';
import { Document, Job } from '../databases/mysql8/db-schemas.js';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../databases/mysql8/sequelizeConnect.js';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const logger = new Logger();


const MimeTypesExtensionMap = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/json': 'json',

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
        try {
            const transaction = await sequelize.transaction();
            // Generate a unique key for S3
            const fileExtension = MimeTypesExtensionMap[contentType];
            const key = this.#generateKey(originalName, userId, fileExtension);

            // Upload to S3
            const s3Result = await uploadToS3(fileBuffer, key, contentType);

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
            await Job.create({
                doc_id: document.id,
                status: 'pending',
                metadata: {
                    pages,
                    job_type: this.#getJobType(contentType),
                },
                service: 'secondbrain',
                resource: 'upload' // TODO: decide the right usage for this
            }, { transaction });

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
        try {
            const transaction = await sequelize.transaction();
            const document = await Document.findOne({
                where: {
                    id: documentId,
                    status: 'active'
                }
            });
            if (!document) {
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
            const oldKey = fetchKeyFromDbUrl(document.s3_upload_url);
            if (oldKey) await deleteFromS3(oldKey);

            // Generate new key
            const fileExtension = document.file_type;
            const key = this.#generateKey(document.filename, document.uploaded_by, fileExtension);

            // Upload new file
            const s3Result = await uploadToS3(fileBuffer, key, contentType);
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
            await Job.update(
                { status: 'cancelled', cancelled_at: new Date() },
                { where: { doc_id: documentId, status: 'pending' }, transaction }
            );

            //TODO: delete all vectors for this document from DB and vectorStore (Weaviate) [NOT A RESPONSIBILITY OF THIS SERVICE, NEEDS TO BE implemented by methods in JobService] 

            // Create new job for processing
            await Job.create({
                doc_id: document.id,
                status: 'pending',
                metadata: {
                    pages,
                    job_type: this.#getJobType(contentType),
                },
                service: 'secondbrain',
                resource: 'upload' // TODO: decide the right usage for this
            }, { transaction });

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
     * @returns {Promise<string>}
     */
    async getDownloadUrl(documentId) {
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
            const key = fetchKeyFromDbUrl(document.s3_upload_url);
            return getPresignedUrl(key, 3600); // 1 hour
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
                document.s3_upload_url = await this.getDownloadUrl(document.id);
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
        try {
            const transaction = await sequelize.transaction();

            const document = await Document.findOne({
                where: {
                    id: documentId,
                    status: 'active'
                }
            });
            if (!document) {
                throw new Error('Document not found');
            }

            // Delete from S3
            await deleteFromS3(fetchKeyFromDbUrl(document.s3_upload_url));
            logger.info('Document deleted from S3', { documentId });

            // Soft delete document
            await document.update({ status: 'deleted', deleted_at: new Date() }, { transaction });
            logger.info('Document soft deleted', { documentId });
            // Cancel any pending jobs
            await Job.update(
                { status: 'cancelled', cancelled_at: new Date() },
                { where: { doc_id: documentId, status: 'pending' }, transaction }
            );
            logger.info('All pending jobs cancelled', { documentId });
            // TODO: delete all vectors for this document from DB and vectorStore (Weaviate)
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

            const data = await sequelize.query(`
                SELECT 
                    d.status as document_status,
                    j.status as job_status,
                    j.created_at as job_created
                FROM documents d
                LEFT JOIN jobs j ON d.id = j.doc_id
                WHERE d.id = :documentId
                and d.status = 'active'
                and j.status <> 'cancelled'
            `, {
                replacements: { documentId },
                type: sequelize.QueryTypes.SELECT
            });

            if (!data || data[0].length === 0) throw new Error('Document not found');

            return {
                documentStatus: data[0].document_status,
                jobStatus: data[0]?.job_status,
                jobDueAt: data[0]?.job_created
            };
        } catch (error) {
            logger.error('Error getting document status', { error });
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
                const pdfData = await pdf(fileBuffer);
                pages = pdfData.numpages;
                break;
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                const docData = await mammoth.extractRawText({ buffer: fileBuffer });
                pages = docData.value.split('\n').length; // Simple line count as a proxy for pages
                break;
            case 'application/json':
                const jsonData = JSON.parse(fileBuffer);
                pages = Object.keys(jsonData).length; // Assuming each key is a page in the document, TODO: make this better
                break;
            //TODO: need to implement for 'application/msword' and check the correctness of the above
            default:
                throw new Error('Unsupported file type');
        }
        return pages;
    }

    #generateKey(originalName, userId, fileExtension) {
        return `documents/${userId}/${uuidv4()}.${originalName}.${fileExtension}`;
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