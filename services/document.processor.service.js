import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Logger from '../utils/Logger.js';
import * as uuid from 'uuid';
import documentParserFactory from './document-parsers/document.parser.factory.js';

const execAsync = promisify(exec);
const logger = new Logger();

/**
 * Service for processing documents and extracting content
 */
class DocumentProcessorService {
    constructor() {
        this.docStore = path.join(process.cwd(), 'doc-store');
        this.outputStore = path.join(process.cwd(), 'output-store');
        this.useNativeParser = false; // Default to Python script, set to true to use native JS parsers

        // Ensure directories exist
        if (!fs.existsSync(this.docStore)) {
            fs.mkdirSync(this.docStore, { recursive: true });
            logger.info('Created document store directory', { path: this.docStore });
        }

        if (!fs.existsSync(this.outputStore)) {
            fs.mkdirSync(this.outputStore, { recursive: true });
            logger.info('Created output store directory', { path: this.outputStore });
        }

        logger.info('DocumentProcessorService initialized', {
            docStore: this.docStore,
            outputStore: this.outputStore,
            useNativeParser: this.useNativeParser
        });
    }

    /**
     * Set whether to use native JS parsers instead of Python script
     * @param {boolean} useNative - Whether to use native JS parsers
     */
    setUseNativeParser(useNative) {
        this.useNativeParser = useNative;
        logger.info(`Document processor set to use ${useNative ? 'native JS parsers' : 'Python script'}`);
    }

    /**
     * Process a document to extract content
     * @param {string} filePath - Path to the document file
     * @param {string} fileType - Type of the file (e.g., 'pdf', 'txt')
     * @returns {Promise<Array>} - Array of document chunks
     */
    async processDocument(filePath, fileType) {
        const processId = uuid.v4();
        logger.info('Starting document processing', {
            processId,
            filePath,
            fileType,
            useNativeParser: this.useNativeParser,
            timestamp: new Date().toISOString()
        });

        try {
            // Validate file exists
            if (!fs.existsSync(filePath)) {
                logger.error('File not found during processing', { processId, filePath });
                throw new Error(`File not found: ${filePath}`);
            }

            let chunks = [];

            if (this.useNativeParser) {
                // Use native JS parsers via document parser factory
                logger.info('Using native JS parsers', { processId, fileType });
                chunks = await documentParserFactory.parseDocument(filePath, fileType);
            } else {
                // Use Python script
                try {
                    logger.info('Using Python script for processing', { processId, fileType });

                    // Get file stats
                    const fileStats = fs.statSync(filePath);
                    logger.info('File details', {
                        processId,
                        filePath,
                        size: fileStats.size,
                        created: fileStats.birthtime,
                        modified: fileStats.mtime
                    });

                    // Normalize file type
                    const normalizedFileType = fileType.toLowerCase().replace(/^\./, '');
                    logger.debug('Normalized file type', { processId, normalizedFileType, originalType: fileType });

                    // Map file type to extension
                    let fileExt;
                    switch (normalizedFileType) {
                        case 'pdf':
                            fileExt = '.pdf';
                            break;
                        case 'txt':
                        case 'text':
                            fileExt = '.txt';
                            break;
                        case 'json':
                            fileExt = '.json';
                            break;
                        default:
                            // If the file type is not recognized, try to infer from the file path
                            fileExt = path.extname(filePath).toLowerCase();
                            if (!fileExt) {
                                logger.error('Unsupported file type', { processId, fileType, normalizedFileType });
                                throw new Error(`Unsupported file type: ${fileType}`);
                            }
                    }

                    logger.info('Determined file extension', {
                        processId,
                        fileExt,
                        normalizedFileType,
                        fileType
                    });

                    // Check if file type is supported by our Python script
                    const supportedTypes = ['.pdf', '.txt', '.json'];
                    if (!supportedTypes.includes(fileExt)) {
                        logger.error('Unsupported file type extension for Python script', {
                            processId,
                            fileExt,
                            supportedTypes
                        });
                        throw new Error(`Unsupported file type for Python script: ${fileType} (extension: ${fileExt})`);
                    }

                    // If the file doesn't have the expected extension, create a temporary file with the correct extension
                    let processingFilePath = filePath;
                    let tempFile = false;

                    if (path.extname(filePath).toLowerCase() !== fileExt) {
                        const tempFilePath = path.join(this.docStore, `temp_${Date.now()}${fileExt}`);
                        logger.info('Creating temporary file with correct extension', {
                            processId,
                            originalPath: filePath,
                            tempPath: tempFilePath,
                            originalExt: path.extname(filePath),
                            requiredExt: fileExt
                        });

                        fs.copyFileSync(filePath, tempFilePath);
                        processingFilePath = tempFilePath;
                        tempFile = true;
                    }

                    // Generate output path
                    const outputPath = path.join(this.outputStore, `${path.basename(processingFilePath)}.json`);
                    logger.info('Output will be saved to', { processId, outputPath });

                    // Ensure output directory exists
                    if (!fs.existsSync(this.outputStore)) {
                        fs.mkdirSync(this.outputStore, { recursive: true });
                    }

                    // Make script path absolute
                    const scriptPath = path.resolve(process.cwd(), 'scripts', 'pdf_processor.py');
                    logger.info('Python script path', { processId, scriptPath });

                    // Check if script exists
                    if (!fs.existsSync(scriptPath)) {
                        logger.error('Python script not found', { processId, scriptPath });
                        throw new Error(`Python script not found: ${scriptPath}`);
                    }

                    // Use python3 explicitly with quoted paths to handle spaces
                    const command = `python3 "${scriptPath}" "${processingFilePath}" --output "${outputPath}"`;
                    logger.info('Executing command', {
                        processId,
                        command,
                        timestamp: new Date().toISOString()
                    });

                    // Execute python script with timeout
                    const startTime = Date.now();
                    let stdout, stderr;
                    try {
                        const result = await execAsync(command, { timeout: 60000 }); // 60 second timeout
                        stdout = result.stdout;
                        stderr = result.stderr;
                    } catch (execError) {
                        logger.error('Error executing Python script', {
                            processId,
                            error: execError.message,
                            code: execError.code,
                            stderr: execError.stderr
                        });
                        throw new Error(`Failed to execute Python script: ${execError.message}`);
                    }

                    const executionTime = Date.now() - startTime;

                    logger.info('Command execution completed', {
                        processId,
                        executionTimeMs: executionTime,
                        hasStdout: !!stdout,
                        hasStderr: !!stderr
                    });

                    if (stderr && !stderr.includes('INFO')) {
                        logger.warn('Python script stderr', {
                            processId,
                            stderr,
                            command
                        });
                    }

                    logger.debug('Python script stdout', { processId, stdout });

                    // Parse the result
                    let result;
                    try {
                        result = JSON.parse(stdout);
                        logger.debug('Successfully parsed stdout as JSON', {
                            processId,
                            status: result.status
                        });
                    } catch (e) {
                        logger.error('Failed to parse Python script output', {
                            processId,
                            error: e.message,
                            stdout: stdout.substring(0, 500) + (stdout.length > 500 ? '...' : '')
                        });

                        // Check if output file was created despite parse error
                        if (fs.existsSync(outputPath)) {
                            logger.info('Output file exists despite parsing error, trying to read it directly', {
                                processId,
                                outputPath
                            });

                            try {
                                const outputContent = fs.readFileSync(outputPath, 'utf8');
                                const chunks = JSON.parse(outputContent);

                                // Clean up temporary file if created
                                if (tempFile) {
                                    logger.info('Cleaning up temporary file', { processId, tempFilePath: processingFilePath });
                                    fs.unlinkSync(processingFilePath);
                                }

                                return chunks;
                            } catch (outputError) {
                                logger.error('Failed to read output file directly', {
                                    processId,
                                    error: outputError.message
                                });
                            }
                        }

                        throw new Error('Failed to parse document processing result');
                    }

                    if (result.status !== 'success') {
                        logger.error('Document processing failed in Python script', {
                            processId,
                            status: result.status,
                            error: result.error || 'Unknown error'
                        });
                        throw new Error(`Document processing failed: ${result.error || 'Unknown error'}`);
                    }

                    // Read the output JSON file
                    if (!fs.existsSync(outputPath)) {
                        logger.error('Output file not created', { processId, outputPath });
                        throw new Error('Output file not created by Python script');
                    }

                    logger.info('Reading output JSON file', { processId, outputPath });
                    const outputContent = fs.readFileSync(outputPath, 'utf8');

                    try {
                        chunks = JSON.parse(outputContent);
                    } catch (jsonError) {
                        logger.error('Failed to parse output JSON', {
                            processId,
                            error: jsonError.message,
                            outputContent: outputContent.substring(0, 500) + (outputContent.length > 500 ? '...' : '')
                        });
                        throw new Error('Failed to parse output JSON');
                    }

                    logger.info('Document processing with Python script completed successfully', {
                        processId,
                        chunksCount: chunks.length,
                        fileSize: fs.statSync(outputPath).size,
                        executionTimeMs: executionTime,
                        timestamp: new Date().toISOString()
                    });

                    // Clean up temporary file if created
                    if (tempFile) {
                        logger.info('Cleaning up temporary file', { processId, tempFilePath: processingFilePath });
                        fs.unlinkSync(processingFilePath);
                    }
                } catch (pyError) {
                    logger.warn('Python script processing failed, falling back to native parsers', {
                        processId,
                        error: pyError.message
                    });
                    // Fall back to native parsers
                    chunks = await documentParserFactory.parseDocument(filePath, fileType);
                }
            }

            logger.info('Document processing completed successfully', {
                processId,
                chunksCount: chunks.length,
                timestamp: new Date().toISOString()
            });

            return chunks;
        } catch (error) {
            logger.error('Error processing document', {
                processId,
                filePath,
                fileType,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });

            // Return empty chunks array instead of throwing
            // This allows our fallback in job.service.js to create a placeholder chunk
            return [];
        }
    }

    /**
     * Process a JSON document
     * @param {string} filePath - Path to the JSON file
     * @returns {Promise<Array>} - Array of processed chunks
     */
    async processJsonDocument(filePath) {
        const processId = uuid.v4();
        logger.info('Processing JSON document', {
            processId,
            filePath,
            timestamp: new Date().toISOString()
        });

        try {
            const chunks = await documentParserFactory.parseJson(filePath);
            logger.info('JSON document processed successfully', {
                processId,
                chunksCount: chunks.length,
                timestamp: new Date().toISOString()
            });

            return chunks;
        } catch (error) {
            logger.error('Error processing JSON document', {
                processId,
                filePath,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Clean up temporary files after processing
     * @param {string} filePath - The original file path
     * @returns {Promise<void>}
     */
    async cleanup(filePath) {
        // If the file is in our docStore, remove it
        if (filePath && filePath.startsWith(this.docStore) && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                logger.info('Cleaned up temporary file', { path: filePath });
            } catch (error) {
                logger.warn('Error cleaning up temporary file', { error, path: filePath });
                // Non-fatal error, just log it
            }
        }

        // Check for any output files based on this filepath
        const baseName = path.basename(filePath);
        const outputPath = path.join(this.outputStore, `${baseName}.json`);

        if (fs.existsSync(outputPath)) {
            try {
                fs.unlinkSync(outputPath);
                logger.info('Cleaned up output file', { path: outputPath });
            } catch (error) {
                logger.warn('Error cleaning up output file', { error, path: outputPath });
                // Non-fatal error, just log it
            }
        }
    }
}

export default new DocumentProcessorService(); 