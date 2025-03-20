import Response from '../../utils/Response.js';
import Logger from '../../utils/Logger.js';
import DocumentService from '../../services/document.service.js';
import { StatusCodes } from 'http-status-codes';
import { UtilityMethods as util} from '../../utils/utilityMethods.js';
const logger = new Logger();

// Upload Document
 const uploadDocument = async (req, res) => {
     try {
         const userId = req.user.id;
         let { filename, filetype } = req.body;
         const file = req.files.file;
         if(!file) {
            return Response.fail(res, 'File is required', StatusCodes.BAD_REQUEST);
         }

         filename = filename || file.name;
         filetype = filetype || file.mimetype;         

         filename = util.cleanAndJoinString(filename);
         
         if(!DocumentService.isAllowedFileType(file.mimetype)) {
            return Response.fail(res, 'Invalid file type', StatusCodes.BAD_REQUEST);
         }
        
         const document = await DocumentService.uploadDocument(req.files.file.data, filename, filetype, userId);
         
         return Response.success(res, 'Document uploaded successfully', document);
         
    } catch (error) {
        logger.error('Error during document upload', { error });
        return Response.fail(res, 'Document upload failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

// Update Document
const updateDocument = async (req, res) => {
    const { documentId } = req.params;
    if(!documentId || documentId === ':documentId') {
        return Response.fail(res, 'Document ID is required', StatusCodes.BAD_REQUEST);
    }
    try {
        let { filename } = req.body;
        const file = req.files?.file;

        filename = filename || file?.name;
        if(filename) filename = util.cleanAndJoinString(filename);
        
        const document = await DocumentService.updateDocument(documentId, file?.data, filename, file?.mimetype);
        return Response.success(res, 'Document updated successfully', document);
    } catch (error) {
        logger.error('Error during document update', { error });
        return Response.fail(res, 'Document update failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

// List Documents -> paginated list of documents
const listDocuments = async (req, res) => {
    try {
        const { documents, totalPages, currentPage } = await DocumentService.listDocuments(
            req.user.id, req.query?.page, req.query?.pageSize, req.query?.search);
        
        return Response.success(res, 'Documents retrieved successfully',
            { documents, totalPages, currentPage });

    } catch (error) {
        logger.error('Error listing documents', { error });
        return Response.fail(res, 'Failed to retrieve documents', StatusCodes.INTERNAL_SERVER_ERROR);
    }

}

// Download Document -> presigned url
const downloadDocument = async (req, res) => {
    const { documentId } = req.params;
    try {
        const document = await DocumentService.getDownloadUrl(documentId, { docExists: false });
        return Response.success(res, 'Fetched document successfully', document);
    } catch (error) {
        logger.error('Error downloading document', { error });
        return Response.fail(res, 'Failed to download document', StatusCodes.INTERNAL_SERVER_ERROR);
    }
}

// Get Document Status
const getDocumentStatus = async (req, res) => {
    const { documentId } = req.params;
    try {
        let status=await DocumentService.getDocumentStatus(documentId);
        return Response.success(res, 'Document status retrieved successfully', status);
     } catch(error) {
        logger.error('Error retrieving document status', { error });
        return Response.fail(res, 'Failed to retrieve document status', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};

// Delete Document
const deleteDocument = async (req, res) => {
    const { documentId } = req.params;
    try {
        await DocumentService.deleteDocument(documentId);
        return Response.success(res, 'Document deleted successfully');
    } catch (error) {
        logger.error('Error during document deletion', { error });
        return Response.fail(res, 'Document deletion failed', StatusCodes.INTERNAL_SERVER_ERROR);
    }
};


export { uploadDocument, updateDocument, getDocumentStatus, deleteDocument, listDocuments, downloadDocument };