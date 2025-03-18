import mammoth from 'mammoth';
import Logger from '../../utils/Logger.js';

const logger = new Logger();

class WordService {
    /**
     * Extract text from a Word document buffer
     * @param {Buffer} wordBuffer - Word document file buffer
     * @returns {Promise<{fullText: string, chunks: Array<{text: string, pageNumber: number, chunkIndex: number}>}>}
     */
    async extractTextFromWord(wordBuffer) {
        try {
            // Extract raw text from Word document
            const result = await mammoth.extractRawText({ buffer: wordBuffer });
            const fullText = result.value;

            // Create chunks from text
            const chunks = this.#createChunksFromText(fullText);

            return {
                fullText,
                chunks
            };
        } catch (error) {
            logger.error('Error extracting text from Word document', { error });
            throw error;
        }
    }

    /**
     * Create chunks from text
     * @private
     * @param {string} text - Full text from Word document
     * @returns {Array<{text: string, pageNumber: number, chunkIndex: number}>} - Array of chunks
     */
    #createChunksFromText(text) {
        const chunks = [];
        const maxChunkSize = 1000; // Maximum characters per chunk
        const linesPerPage = 40; // Approximate lines per page

        // Split text by paragraphs or lines
        const paragraphs = text.split(/\n\s*\n/); // Split by double line breaks
        let currentChunk = '';
        let currentLines = 0;
        let pageNumber = 1;
        let chunkIndex = 0;

        paragraphs.forEach(paragraph => {
            // Count approximate lines in this paragraph
            const paragraphLines = Math.ceil(paragraph.length / 80); // Assuming 80 chars per line

            // Check if adding this paragraph would exceed the chunk size
            if ((currentChunk.length + paragraph.length > maxChunkSize && currentChunk) ||
                (currentLines + paragraphLines > linesPerPage)) {
                // Store current chunk
                chunks.push({
                    text: currentChunk.trim(),
                    pageNumber: pageNumber,
                    chunkIndex: chunkIndex++
                });

                currentChunk = '';
                currentLines = 0;

                // Check if we should move to a new page
                if (currentLines + paragraphLines > linesPerPage) {
                    pageNumber++;
                    chunkIndex = 0;
                }
            }

            currentChunk += paragraph + '\n\n';
            currentLines += paragraphLines;
        });

        // Add the last chunk if not empty
        if (currentChunk.trim()) {
            chunks.push({
                text: currentChunk.trim(),
                pageNumber: pageNumber,
                chunkIndex: chunkIndex
            });
        }

        return chunks;
    }
}

export default new WordService(); 