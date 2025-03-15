import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, PutObjectAclCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Logger from './Logger.js';
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME } from '../config/env.js';

const logger = new Logger();

// Initialize S3 client
const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = AWS_S3_BUCKET_NAME;

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} key - The key (path) where the file will be stored in S3
 * @param {string} contentType - mime type of the file
 * @returns {Promise<{Location: string, Key: string}>}
 */
export const uploadToS3 = async (fileBuffer, key, contentType) => {
    try {
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType,
            ACL: 'private'
        });

        await s3Client.send(command);
        return {
            Location: `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`,
            Key: key
        };
    } catch (error) {
        logger.error('Error uploading file to S3', { error });
        throw error;
    }
};

/**
 * Get a presigned URL for downloading a file
 * @param {string} key - The key (path) of the file in S3
 * @param {number} expiresIn - Number of seconds until the URL expires
 * @returns {Promise<string>} - The presigned URL valid for 1 hour
 */
export const getPresignedUrl = async (key, expiresIn = 3600) => {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
        logger.error('Error generating presigned URL', { error });
        throw error;
    }
};

/**
 * Delete a file from S3
 * @param {string} key - The key (path) of the file in S3
 * @returns {Promise<void>}
 */
export const deleteFromS3 = async (key) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        await s3Client.send(command);
    } catch (error) {
        logger.error('Error deleting file from S3', { error });
        throw error;
    }
};

/**
 * Get file metadata from S3
 * @param {string} key - The key (path) of the file in S3
 * @returns {Promise<Object>}
 */
export const getFileMetadata = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        const response = await s3Client.send(command);
        return {
            contentType: response.ContentType,
            contentLength: response.ContentLength,
            lastModified: response.LastModified
        };
    } catch (error) {
        logger.error('Error getting file metadata from S3', { error });
        throw error;
    }
}; 


/**
     * Fetch the key from the database URL
     * @param {string} dbUrl - The database `s3_upload_url`
     * @returns {string}
     */
export const fetchKeyFromDbUrl = (dbUrl) => {
    const key = dbUrl.split('.com/')[1]; // example: https://mysecondbrain.info.s3.ap-south-1.amazonaws.com/documents/5/dc1b4792-e40c-402e-8f44-5b894535660d.my_latest_cv.pdf
    return key;
}