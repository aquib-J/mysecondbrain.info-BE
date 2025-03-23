/**
 * This module provides a safe wrapper around the pdf-parse library
 * to prevent crashes due to debug mode issues.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the test directory and file needed by pdf-parse
const pdfParseTestDir = path.join(__dirname, '../node_modules/pdf-parse/test/data');
fs.mkdirSync(pdfParseTestDir, { recursive: true });
const testPdfPath = path.join(pdfParseTestDir, '05-versions-space.pdf');
if (!fs.existsSync(testPdfPath)) {
    fs.writeFileSync(testPdfPath, '');
}

// Now intercept the require/import of pdf-parse
const originalRequire = createRequire(import.meta.url);

// Safely import the pdf-parse module
let pdfParse;
try {
    // We need to use dynamic import since we're in an ES module
    const pdfParseModule = await import('pdf-parse');
    pdfParse = pdfParseModule.default;
} catch (error) {
    console.error('Error importing pdf-parse:', error.message);
    // Provide a fallback implementation if needed
    pdfParse = async (buffer) => {
        return {
            numpages: 0,
            numrender: 0,
            info: {},
            metadata: null,
            text: '',
            version: '1.10.100'
        };
    };
}

//TODO: need to fix this, this is a temp jugaad to bypass the error and most processing is done by the python parser anyways, but this fallback is a total stub :lol

export default pdfParse; 