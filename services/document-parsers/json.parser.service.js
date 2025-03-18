import fs from 'fs';
import Logger from '../../utils/Logger.js';
import { flatten } from 'flat';
import * as uuid from 'uuid';

const logger = new Logger();

/**
 * Service for processing JSON documents and converting them to text chunks
 */
class JsonParserService {
    /**
     * Process a JSON file and extract chunks with metadata
     * @param {string} filePath - Path to the JSON file
     * @returns {Promise<Array>} - Array of text chunks with metadata
     */
    async processJsonFile(filePath) {
        const processId = uuid.v4();
        logger.info('Processing JSON file', {
            processId,
            filePath,
            timestamp: new Date().toISOString()
        });

        try {
            // Read the JSON file
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);

            // Process the parsed JSON data
            return this.processJsonData(jsonData, processId);
        } catch (error) {
            logger.error('Error processing JSON file', {
                processId,
                filePath,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Process parsed JSON data into text chunks
     * @param {Object|Array} jsonData - Parsed JSON data
     * @param {string} processId - Process ID for logging
     * @returns {Array} - Array of text chunks with metadata
     */
    processJsonData(jsonData, processId = uuid.v4()) {
        try {
            logger.info('Processing JSON data', {
                processId,
                jsonType: Array.isArray(jsonData) ? 'array' : 'object',
                timestamp: new Date().toISOString()
            });

            // Handle both array and object formats
            const jsonItems = Array.isArray(jsonData) ? jsonData : [jsonData];
            const chunks = [];

            // Process each item in the JSON data
            for (const [itemIndex, item] of jsonItems.entries()) {
                // Flatten nested JSON structures
                const flattenedJson = flatten(item);

                // Process each key-value pair
                for (const [path, value] of Object.entries(flattenedJson)) {
                    // Skip null or undefined values
                    if (value === null || value === undefined) continue;

                    // Convert the key-value pair to a text representation
                    const textRepresentation = `${path}: ${value}`;
                    const valueType = typeof value;

                    // Determine if numeric for aggregation potential
                    const isNumeric = valueType === 'number' || (valueType === 'string' && !isNaN(parseFloat(value)));

                    // Create chunk with metadata
                    chunks.push({
                        text: textRepresentation,
                        metadata: {
                            format: 'json',
                            path,
                            value: String(value),
                            valueType: isNumeric ? 'number' : valueType,
                            itemIndex,
                            parsedNumericValue: isNumeric ? parseFloat(value) : null
                        }
                    });
                }
            }

            logger.info('JSON data processed successfully', {
                processId,
                chunksCount: chunks.length,
                timestamp: new Date().toISOString()
            });

            return chunks;
        } catch (error) {
            logger.error('Error processing JSON data', {
                processId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Parse and validate JSON string
     * @param {string} jsonString - JSON string to parse
     * @returns {Object|Array} - Parsed JSON data
     */
    parseJson(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            logger.error('Error parsing JSON string', {
                error: error.message,
                preview: jsonString.substring(0, 100) + (jsonString.length > 100 ? '...' : '')
            });
            throw new Error(`Invalid JSON: ${error.message}`);
        }
    }

    /**
     * Serialize object to JSON string
     * @param {Object|Array} data - Data to serialize
     * @param {boolean} pretty - Whether to pretty print the JSON
     * @returns {string} - JSON string
     */
    stringifyJson(data, pretty = true) {
        try {
            return pretty
                ? JSON.stringify(data, null, 2)
                : JSON.stringify(data);
        } catch (error) {
            logger.error('Error stringifying JSON data', {
                error: error.message
            });
            throw new Error(`Error serializing data: ${error.message}`);
        }
    }
}

export default new JsonParserService(); 