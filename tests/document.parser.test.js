import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import documentProcessorService from '../services/document.processor.service.js';
import Logger from '../utils/Logger.js';

const logger = new Logger();

/**
 * Test document parsing with both Python script and native parsers
 */
async function testDocumentParsing() {
    logger.info('Starting document parsing test');

    // Create test directory if it doesn't exist
    const testDir = path.join(process.cwd(), 'test-data');
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
        logger.info('Created test data directory', { path: testDir });
    }

    // Create a simple test text file
    const testTextPath = path.join(testDir, 'test.txt');
    fs.writeFileSync(testTextPath, 'This is a test document.\n\nIt has multiple paragraphs.\n\nEach paragraph should be a chunk.');
    logger.info('Created test text file', { path: testTextPath });

    // Create a simple test JSON file
    const testJsonPath = path.join(testDir, 'test.json');
    fs.writeFileSync(testJsonPath, JSON.stringify({
        title: 'Test Document',
        sections: [
            { heading: 'Introduction', content: 'This is the introduction' },
            { heading: 'Main Content', content: 'This is the main content' },
            { heading: 'Conclusion', content: 'This is the conclusion' }
        ]
    }, null, 2));
    logger.info('Created test JSON file', { path: testJsonPath });

    try {
        // Test 1: Process text with Python script
        logger.info('TEST 1: Processing text with Python script');
        documentProcessorService.setUseNativeParser(false);
        const textChunksPythonScript = await documentProcessorService.processDocument(testTextPath, 'txt');
        logger.info('Python script text processing results', {
            chunksCount: textChunksPythonScript.length,
            firstChunk: textChunksPythonScript[0]
        });

        // Test 2: Process text with native parser
        logger.info('TEST 2: Processing text with native parser');
        documentProcessorService.setUseNativeParser(true);
        const textChunksNative = await documentProcessorService.processDocument(testTextPath, 'txt');
        logger.info('Native parser text processing results', {
            chunksCount: textChunksNative.length,
            firstChunk: textChunksNative[0]
        });

        // Test 3: Process JSON with Python script
        logger.info('TEST 3: Processing JSON with Python script');
        documentProcessorService.setUseNativeParser(false);
        const jsonChunksPythonScript = await documentProcessorService.processDocument(testJsonPath, 'json');
        logger.info('Python script JSON processing results', {
            chunksCount: jsonChunksPythonScript.length,
            firstChunk: jsonChunksPythonScript[0]
        });

        // Test 4: Process JSON with native parser
        logger.info('TEST 4: Processing JSON with native parser');
        documentProcessorService.setUseNativeParser(true);
        const jsonChunksNative = await documentProcessorService.processDocument(testJsonPath, 'json');
        logger.info('Native parser JSON processing results', {
            chunksCount: jsonChunksNative.length,
            firstChunk: jsonChunksNative[0]
        });

        // Test 5: Test fallback mechanism (make Python script fail and fall back to native parser)
        logger.info('TEST 5: Testing fallback mechanism');
        documentProcessorService.setUseNativeParser(false);
        // Create an unsupported file that should fail with Python but work with native parser
        const testHtmlPath = path.join(testDir, 'test.html');
        fs.writeFileSync(testHtmlPath, '<html><body><h1>Test HTML</h1><p>This is a test HTML document.</p></body></html>');
        const htmlChunks = await documentProcessorService.processDocument(testHtmlPath, 'html');
        logger.info('Fallback mechanism results', {
            chunksCount: htmlChunks.length,
            firstChunk: htmlChunks[0]
        });

        logger.info('Document parsing tests completed');
    } catch (error) {
        logger.error('Error during document parsing tests', { error });
    } finally {
        // Clean up test files
        try {
            if (fs.existsSync(testTextPath)) fs.unlinkSync(testTextPath);
            if (fs.existsSync(testJsonPath)) fs.unlinkSync(testJsonPath);
            if (fs.existsSync(path.join(testDir, 'test.html'))) fs.unlinkSync(path.join(testDir, 'test.html'));
            logger.info('Cleaned up test files');
        } catch (cleanupError) {
            logger.warn('Error cleaning up test files', { error: cleanupError });
        }
    }
}

// Run the test if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testDocumentParsing().catch(error => {
        logger.error('Test failed', { error });
        process.exit(1);
    });
}

export { testDocumentParsing }; 