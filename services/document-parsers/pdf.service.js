import pdf from 'pdf-parse';
import Logger from '../../utils/Logger.js';

const logger = new Logger();

class PdfService {
    /**
     * Extract text from a PDF buffer
     * @param {Buffer} pdfBuffer - PDF file buffer
     * @returns {Promise<{fullText: string, chunks: Array<{text: string, pageNumber: number, chunkIndex: number}>}>}
     */
    async extractTextFromPdf(pdfBuffer) {
        try {
            // Parse PDF
            const pdfData = await pdf(pdfBuffer);
            const fullText = pdfData.text;

            // Split text into pages
            const pageTexts = this.#extractTextByPages(pdfData);

            // Create chunks from pages
            const chunks = this.#createChunksFromPages(pageTexts);

            return {
                fullText,
                chunks
            };
        } catch (error) {
            logger.error('Error extracting text from PDF', { error });
            throw error;
        }
    }

    /**
     * Extract text by pages from PDF data
     * @private
     * @param {Object} pdfData - Result from pdf-parse
     * @returns {Array<string>} - Array of text by page
     */
    #extractTextByPages(pdfData) {
        const pageTexts = [];

        // Check if we can get page count from the PDF data
        const numPages = pdfData.numpages || 1;

        try {
            // Try to extract pages using pdf-parse's built-in page handling
            if (pdfData.text && numPages > 1) {
                // Look for page breaks in the text
                const pageBreakPattern = /\f/g;
                const textWithoutFooters = pdfData.text.replace(/Page \d+ of \d+/g, '');
                const pages = textWithoutFooters.split(pageBreakPattern);

                // Return pages, filtering out empty ones
                return pages
                    .map(page => page.trim())
                    .filter(page => page.length > 0);
            }

            // If we have items with page information
            if (pdfData.pages && pdfData.pages.length > 0 && pdfData.pages[0].items) {
                let lastY;
                let text = '';
                let pageNumber = 1;

                // Process each render item (text element)
                for (const item of pdfData.pages[0].items) {
                    if (lastY !== undefined && lastY !== item.y) {
                        // New line detected
                        text += '\n';
                    }

                    // If page number changes
                    if (item.page && item.page !== pageNumber) {
                        pageTexts.push(text);
                        text = '';
                        pageNumber = item.page;
                    }

                    text += item.str;
                    lastY = item.y;
                }

                // Add the last page
                if (text) {
                    pageTexts.push(text);
                }

                // If we found pages, return them
                if (pageTexts.length > 0) {
                    return pageTexts;
                }
            }

            // Fallback: If no pages were detected, use heuristic splitting
            logger.info('Using fallback page splitting for PDF', { numPages });

            // Split by approximate page boundaries
            const lines = pdfData.text.split('\n');
            const linesPerPage = Math.ceil(lines.length / numPages);

            for (let i = 0; i < lines.length; i += linesPerPage) {
                const pageText = lines.slice(i, i + linesPerPage).join('\n');
                if (pageText.trim()) {
                    pageTexts.push(pageText);
                }
            }

            return pageTexts;
        } catch (error) {
            logger.error('Error extracting pages from PDF', { error });
            // Last resort: just return the whole text as one page
            return [pdfData.text];
        }
    }

    /**
     * Create chunks from page texts
     * @private
     * @param {Array<string>} pageTexts - Array of text by page
     * @returns {Array<{text: string, pageNumber: number, chunkIndex: number}>} - Array of chunks
     */
    #createChunksFromPages(pageTexts) {
        const chunks = [];
        const maxChunkSize = 1000; // Maximum characters per chunk

        pageTexts.forEach((pageText, pageIndex) => {
            // Skip empty pages
            if (!pageText.trim()) return;

            // Split long pages into chunks
            if (pageText.length <= maxChunkSize) {
                chunks.push({
                    text: pageText,
                    pageNumber: pageIndex + 1,
                    chunkIndex: 0
                });
            } else {
                // For longer texts, split by sentences or paragraphs
                const sentences = pageText.split(/(?<=[.!?])\s+/);
                let currentChunk = '';
                let chunkIndex = 0;

                sentences.forEach(sentence => {
                    // If adding this sentence would exceed the chunk size
                    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
                        chunks.push({
                            text: currentChunk,
                            pageNumber: pageIndex + 1,
                            chunkIndex: chunkIndex++
                        });
                        currentChunk = '';
                    }

                    currentChunk += sentence + ' ';
                });

                // Add the last chunk if not empty
                if (currentChunk.trim()) {
                    chunks.push({
                        text: currentChunk,
                        pageNumber: pageIndex + 1,
                        chunkIndex: chunkIndex
                    });
                }
            }
        });

        return chunks;
    }
}

export default new PdfService(); 