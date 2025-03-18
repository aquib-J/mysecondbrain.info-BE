import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document as LangchainDocument } from "langchain/document";
import { TextLoader } from "langchain/document_loaders/fs/text";


import fs from 'fs';
import path from 'path';
import Logger from '../utils/Logger.js';

const logger = new Logger();

class LangchainService {
    constructor() {
        this.docStore = path.join(process.cwd(), 'doc-store');
        // Ensure doc-store directory exists
        if (!fs.existsSync(this.docStore)) {
            fs.mkdirSync(this.docStore, { recursive: true });
        }
    }

    /**
     * Process a document based on its type
     * @param {string} filePath - Path to the document
     * @param {string} fileType - File type of the document (e.g. 'pdf', 'docx', 'json', 'txt')
     * @returns {Promise<LangchainDocument[]>} - Array of documents with text and metadata
     */
    async processDocument(filePath, fileType) {
        try {
            let docs;
            switch (fileType) {
                case 'pdf':
                    docs = await this._processPDF(filePath);
                    break;
                case 'docx':
                    docs = await this._processDOCX(filePath);
                    break;
                case 'json':
                    docs = await this._processJSON(filePath);
                    break;
                case 'txt':
                    docs = await this._processTXT(filePath);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${fileType}`);
            }

            // Split documents into chunks
            return await this._splitDocuments(docs);
        } catch (error) {
            logger.error('Error processing document with Langchain', { error });
            throw error;
        }
    }

    /**
     * Process a PDF document
     * @private
     * @param {string} filePath - Path to the PDF file
     * @returns {Promise<Array<Document>>}
     */
    async _processPDF(filePath) {
        const loader = new PDFLoader(filePath, {
            splitPages: true,
            pdfjs: () => import('pdfjs-dist/legacy/build/pdf.js')
        });
        return await loader.load();
    }

    /**
     * Process a DOCX document
     * @private
     * @param {string} filePath - Path to the DOCX file
     * @returns {Promise<Array<Document>>}
     */
    async _processDOCX(filePath) {
        const loader = new DocxLoader(filePath);
        return await loader.load();
    }

    /**
     * Process a JSON document
     * @private
     * @param {string} filePath - Path to the JSON file
     * @returns {Promise<Array<Document>>}
     */
    async _processJSON(filePath) {
        try {
            // Read the raw JSON file to process it in a more structured way
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);

            // Handle both array and object formats
            const jsonItems = Array.isArray(jsonData) ? jsonData : [jsonData];

            // Create documents for each item or entry in the JSON
            const documents = [];

            for (const [index, item] of jsonItems.entries()) {
                // Flatten the item to handle nested structures
                const flatItem = this._flattenJSON(item, '');

                // Create a text representation of the item
                let textContent = '';
                for (const [key, value] of Object.entries(flatItem)) {
                    textContent += `${key}: ${value}\n`;
                }

                // Create a document with both the text representation and structured metadata
                documents.push(
                    new LangchainDocument({
                        pageContent: textContent,
                        metadata: {
                            source: filePath,
                            format: 'json',
                            index,
                            originalItem: item,
                            flattenedItem: flatItem
                        }
                    })
                );
            }

            return documents;
        } catch (error) {
            logger.error('Error processing JSON document', { error, filePath });
            throw error;
        }
    }

    /**
     * Flatten a nested JSON object
     * @private
     * @param {Object} obj - The object to flatten
     * @param {string} prefix - The current path prefix
     * @returns {Object} - Flattened object with dot notation paths
     */
    _flattenJSON(obj, prefix) {
        const result = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = prefix ? `${prefix}.${key}` : key;

                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    Object.assign(result, this._flattenJSON(obj[key], newKey));
                } else if (Array.isArray(obj[key])) {
                    // Handle arrays by joining their values
                    result[newKey] = obj[key].join(', ');
                } else {
                    result[newKey] = obj[key];
                }
            }
        }

        return result;
    }

    /**
     * Process a TXT document
     * @private
     * @param {string} filePath - Path to the TXT file
     * @returns {Promise<Array<Document>>}
     */
    async _processTXT(filePath) {
        const loader = new TextLoader(filePath);
        const docs = await loader.load();
        return docs.map(doc => ({
            pageContent: doc.pageContent,
            metadata: {
                ...doc.metadata,
                format: 'txt',
                source: filePath
            }
        }));
    }

    /**
     * Split documents into chunks
     * @private
     * @param {Array<Document>} docs - Array of Langchain documents
     * @returns {Promise<Array<{text: string, metadata: Object}>>}
     */
    async _splitDocuments(docs) {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const splitDocs = await splitter.splitDocuments(docs);
        return splitDocs.map(doc => ({
            text: doc.pageContent,
            metadata: doc.metadata
        }));
    }

    /**   
     * Create a document from text
     * @param {string} text - The text content
     * @param {Object} metadata - Metadata for the document
     * @returns {Document} - A Langchain document
     */
    createDocument(text, metadata = {}) {
        return new LangchainDocument({
            pageContent: text,
            metadata
        });
    }

    /**
     * Clean up temporary files
     * @param {string} filePath - Path to the file to clean up
     */
    async cleanup(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                logger.info('Cleaned up temporary file', { filePath });
            }
        } catch (error) {
            logger.error('Error cleaning up file', { error, filePath });
        }
    }
}

export default new LangchainService(); 