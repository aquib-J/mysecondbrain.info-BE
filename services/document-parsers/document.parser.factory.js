import Logger from '../../utils/Logger.js';
import pdfService from './pdf.service.js';
import wordService from './word.service.js';
import jsonParserService from './json.parser.service.js';
import path from 'path';
import fs from 'fs';

/**
 * Factory for parsing different document types
 */
class DocumentParserFactory {
    constructor() {
        this.logger = new Logger();
    }

    /**
     * Check if a file type is supported
     * @param {string} fileType - The type of file to check
     * @returns {boolean} - Whether the file type is supported
     */
    isSupported(fileType) {
        const normalizedType = fileType.toLowerCase().replace(/^\./, '');
        return ['pdf', 'docx', 'doc', 'txt', 'text', 'json', 'html'].includes(normalizedType);
    }

    /**
     * Parse a document based on its file type
     * @param {string} filePath - Path to the document file
     * @param {string} fileType - Type of the file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async parseDocument(filePath, fileType) {
        this.logger.info('Parsing document with factory', { filePath, fileType });

        // Normalize file type
        const normalizedType = fileType.toLowerCase().replace(/^\./, '');

        if (!this.isSupported(normalizedType)) {
            this.logger.error('Error parsing document', {
                filePath,
                fileType,
                error: `Unsupported file type: ${fileType}`
            });
            throw new Error(`Unsupported file type: ${fileType}`);
        }

        try {
            switch (normalizedType) {
                case 'pdf':
                    return await this.parsePdf(filePath);
                case 'docx':
                case 'doc':
                    return await this.parseWord(filePath);
                case 'txt':
                case 'text':
                    return await this.parseText(filePath);
                case 'json':
                    return await this.parseJson(filePath);
                case 'html':
                    return await this.parseHtml(filePath);
                default:
                    throw new Error(`Unsupported file type: ${fileType}`);
            }
        } catch (error) {
            this.logger.error('Error parsing document', {
                filePath,
                fileType,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Parse a PDF document
     * @private
     * @param {string} filePath - Path to the PDF file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async parsePdf(filePath) {
        try {
            // Read file to buffer
            const fileBuffer = fs.readFileSync(filePath);
            // Use PDF service to extract text and chunks
            const { chunks } = await pdfService.extractTextFromPdf(fileBuffer);

            // Format chunks to match expected format
            return chunks.map(chunk => ({
                text: chunk.text,
                metadata: {
                    ...chunk,
                    format: 'pdf',
                    source: path.basename(filePath)
                }
            }));
        } catch (error) {
            this.logger.error('Error parsing PDF', { error, filePath });
            throw error;
        }
    }

    /**
     * Parse a Word document (DOCX/DOC)
     * @private
     * @param {string} filePath - Path to the Word file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async parseWord(filePath) {
        try {
            // Read file to buffer
            const fileBuffer = fs.readFileSync(filePath);
            // Use Word service to extract text and chunks
            const { chunks } = await wordService.extractTextFromWord(fileBuffer);

            // Format chunks to match expected format
            return chunks.map(chunk => ({
                text: chunk.text,
                metadata: {
                    ...chunk,
                    format: 'docx',
                    source: path.basename(filePath)
                }
            }));
        } catch (error) {
            this.logger.error('Error parsing Word document', { error, filePath });
            throw error;
        }
    }

    /**
     * Parse a JSON document
     * @private
     * @param {string} filePath - Path to the JSON file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async parseJson(filePath) {
        try {
            // Use JSON parser service
            return await jsonParserService.processJsonFile(filePath);
        } catch (error) {
            this.logger.error('Error parsing JSON', { error, filePath });
            throw error;
        }
    }

    /**
     * Parse a text document
     * @private
     * @param {string} filePath - Path to the text file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async parseText(filePath) {
        try {
            // Read the text file
            const text = fs.readFileSync(filePath, 'utf8');

            // Simple chunking by paragraphs
            const paragraphs = text.split(/\n\s*\n/);
            const maxChunkSize = 1000;
            const chunks = [];

            let currentChunk = '';
            let chunkIndex = 0;

            paragraphs.forEach(paragraph => {
                if ((currentChunk.length + paragraph.length > maxChunkSize) && currentChunk) {
                    chunks.push({
                        text: currentChunk.trim(),
                        metadata: {
                            format: 'txt',
                            source: path.basename(filePath),
                            chunkIndex: chunkIndex++
                        }
                    });
                    currentChunk = '';
                }

                currentChunk += paragraph + '\n\n';
            });

            // Add the last chunk if not empty
            if (currentChunk.trim()) {
                chunks.push({
                    text: currentChunk.trim(),
                    metadata: {
                        format: 'txt',
                        source: path.basename(filePath),
                        chunkIndex: chunkIndex
                    }
                });
            }

            return chunks;
        } catch (error) {
            this.logger.error('Error parsing text document', { error, filePath });
            throw error;
        }
    }

    /**
     * Parse an HTML document
     * @param {string} filePath - Path to the HTML file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async parseHtml(filePath) {
        this.logger.info('Parsing HTML document', { filePath });

        try {
            const html = fs.readFileSync(filePath, 'utf8');

            // Simple HTML parsing without external dependencies
            // This is a basic implementation - for production we'd need to use a library like cheerio

            // Remove script and style tags and their contents
            let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

            // Replace HTML tags with spaces or newlines
            text = text.replace(/<\/p>/gi, '\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/h[1-6]>/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<li\s*\/?>/gi, '\n- ')
                .replace(/<[^>]*>/g, ' ');

            // Replace multiple spaces and newlines with single ones
            text = text.replace(/\s+/g, ' ')
                .replace(/\n+/g, '\n')
                .trim();

            // Decode HTML entities
            text = text.replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, ' ');

            const chunks = [{
                text,
                metadata: {
                    format: 'html',
                    source: path.basename(filePath),
                    chunkIndex: 0
                }
            }];

            this.logger.info('HTML parsing completed', {
                filePath,
                chunksCount: chunks.length
            });

            return chunks;
        } catch (error) {
            this.logger.error('Error parsing HTML document', {
                filePath,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

export default new DocumentParserFactory(); 