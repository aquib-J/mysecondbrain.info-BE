import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, PutObjectAclCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Logger from './Logger.js';
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME } from '../config/env.js';

const logger = new Logger();



class s3Utils {

    constructor() {
        this.BUCKET_NAME = AWS_S3_BUCKET_NAME;
        this.s3Client = new S3Client({
            region: AWS_REGION,
            credentials: {
                accessKeyId: AWS_ACCESS_KEY_ID,
                secretAccessKey: AWS_SECRET_ACCESS_KEY
            }
        });
    }

    /**
     * Upload a file to S3
     * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} key - The key (path) where the file will be stored in S3
 * @param {string} contentType - mime type of the file
 * @returns {Promise<{Location: string, Key: string}>}
 */
 uploadToS3 = async (fileBuffer, key, contentType) => {
    try {
        const command = new PutObjectCommand({
            Bucket: this.BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType,
            ACL: 'private'
        });

            await this.s3Client.send(command);
            return {
                Location: `https://${this.BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`,
                Key: key
            };
    } catch (error) {
        logger.error('Error uploading file to S3', { error });
        throw error;
    }
};

/**
 * Download a file from S3
 * @param {string} key - The key (path) of the file in S3
 * @returns {Promise<Buffer>} - The file buffer
 */
 downloadFromS3 = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: this.BUCKET_NAME,
            Key: key
        });

        const response = await this.s3Client.send(command);
        return response.Body;
    } catch (error) {
        logger.error('Error downloading file from S3', { error });
        throw error;
    }
};


/**
 * Get a presigned URL for downloading a file
 * @param {string} key - The key (path) of the file in S3
 * @param {number} expiresIn - Number of seconds until the URL expires
 * @returns {Promise<string>} - The presigned URL valid for 1 hour
 */
 getPresignedUrl = async (key, expiresIn = 3600) => {
    try {
        const command = new GetObjectCommand({
            Bucket: this.BUCKET_NAME,
            Key: key
        });

        return await getSignedUrl(this.s3Client, command, { expiresIn });
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
 deleteFromS3 = async (key) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: this.BUCKET_NAME,
            Key: key
        });

        await this.s3Client.send(command);
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
 getFileMetadata = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: this.BUCKET_NAME,
            Key: key
        });

        const response = await this.s3Client.send(command);
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
    fetchKeyFromDbUrl(dbUrl) {
        const key = dbUrl.split('.com/')[1]; // example: https://mysecondbrain.info.s3.ap-south-1.amazonaws.com/documents/5/dc1b4792-e40c-402e-8f44-5b894535660d.my_latest_cv.pdf
        return key;
    }
}

export default new s3Utils();