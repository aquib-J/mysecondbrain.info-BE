import nodemailer from 'nodemailer';
import Logger from '../utils/Logger.js';
import { welcomeEmailTemplate } from '../utils/email.templates.js';
import { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, NODE_ENV } from '../config/env.js';

const logger = new Logger();

/**
 * Email Service for sending various types of emails
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.initialize();
    }

    /**
     * Initialize the email service
     */
    initialize() {
        try {
            // If testing/development environment, use ethereal test account
            if (NODE_ENV !== 'production') {
                this.createTestAccount();
                return;
            }

            // Extract email configuration
            const host = EMAIL_HOST || 'smtp.hostinger.com';
            const port = EMAIL_PORT ? parseInt(EMAIL_PORT, 10) : 465;
            // Secure should be true for port 465, false for other ports
            const secure = port === 465;

            logger.debug('Email service configuration', {
                host,
                port,
                secure,
                user: EMAIL_USER ? `${EMAIL_USER.substring(0, 3)}...` : 'not set'
            });

            // Create transporter for production with correct settings
            this.transporter = nodemailer.createTransport({
                host: host,
                port: port,
                secure: secure, // true for 465, false for other ports
                auth: {
                    user: EMAIL_USER || '',
                    pass: EMAIL_PASSWORD || '',
                },
                connectionTimeout: 10000, // 10 seconds
                greetingTimeout: 5000,
                socketTimeout: 10000,
                tls: {
                    // Do not fail on invalid certs
                    rejectUnauthorized: false
                },
                debug: true, //enable debug output
                logger: true //log to console
            });

            // Verify the connection
            this.transporter.verify((error, success) => {
                if (error) {
                    logger.error('SMTP connection verification failed', {
                        error: error.message,
                        host,
                        port
                    });
                } else {
                    logger.info('SMTP connection verified successfully', { success });
                }
            });

            logger.info('Email service initialized successfully');
        } catch (error) {
            logger.error('Error initializing email service', { error: error.message, stack: error.stack });
        }
    }

    /**
     * Create a test account for development/testing
     */
    async createTestAccount() {
        try {
            // Create test account on ethereal.email
            const testAccount = await nodemailer.createTestAccount();

            // Create a transporter for testing
            this.transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });

            logger.info('Test email account created', {
                user: testAccount.user,
                pass: testAccount.pass,
                preview: 'https://ethereal.email'
            });
        } catch (error) {
            logger.error('Error creating test email account', { error });
        }
    }

    /**
     * Send an email with retry logic
     * @param {Object} mailOptions - Email options for nodemailer
     * @param {number} retries - Number of retries left
     * @param {number} backoff - Backoff time in milliseconds
     * @returns {Promise<Object>} - Email sending result or error
     * @private
     */
    async _sendWithRetry(mailOptions, retries = 3, backoff = 1000) {
        try {
            if (!this.transporter) {
                await this.initialize();
                if (!this.transporter) {
                    throw new Error('Email transporter not available');
                }
            }

            // Attempt to send email
            const info = await this.transporter.sendMail(mailOptions);

            if (NODE_ENV !== 'production') {
                logger.info('Preview URL for test email:', {
                    previewUrl: nodemailer.getTestMessageUrl(info),
                });
            }

            logger.info('Email sent successfully', {
                to: mailOptions.to,
                subject: mailOptions.subject,
                messageId: info.messageId
            });

            return { success: true, info };
        } catch (error) {
            logger.warn(`Error sending email (retries left: ${retries})`, {
                error: error.message,
                to: mailOptions.to,
                subject: mailOptions.subject
            });

            // No more retries left
            if (retries <= 0) {
                logger.error('Email sending failed after all retries', {
                    error: error.message,
                    to: mailOptions.to,
                    subject: mailOptions.subject
                });
                return { success: false, error };
            }

            // Wait before retrying with exponential backoff
            const retryDelay = backoff * Math.pow(2, 3 - retries);
            logger.info(`Retrying email send in ${retryDelay}ms`, {
                to: mailOptions.to,
                subject: mailOptions.subject,
                retryNumber: 4 - retries
            });

            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return this._sendWithRetry(mailOptions, retries - 1, backoff);
        }
    }

    /**
     * Send welcome email to a new user
     * @param {string} email - User's email address
     * @param {string} username - User's username or name
     * @returns {Promise<boolean>} - Success or failure
     */
    async sendWelcomeEmail(email, username) {
        try {
            const mailOptions = {
                from: '"MySecondBrain.info" <app@mysecondbrain.info>',
                to: email,
                subject: 'Welcome to MySecondBrain.info!',
                html: welcomeEmailTemplate(username),
                // You can add text alternative here if needed
                text: `Welcome to MySecondBrain.info, ${username}! Thanks for joining. We've created this platform to help you organize and recall important information. While features are currently limited, we're working to expand capabilities soon. Thank you for your support!`,
            };

            const result = await this._sendWithRetry(mailOptions);
            return result.success;
        } catch (error) {
            logger.error('Error sending welcome email', { error, email });
            return false;
        }
    }

    /**
     * Send a generic email
     * @param {string} to - Recipient email address
     * @param {string} subject - Email subject
     * @param {string} htmlContent - HTML content of the email
     * @param {string} textContent - Plain text content of the email
     * @returns {Promise<boolean>} - Success or failure
     */
    async sendEmail(to, subject, htmlContent, textContent) {
        try {
            const mailOptions = {
                from: '"MySecondBrain.info" <app@mysecondbrain.info>',
                to,
                subject,
                html: htmlContent,
                text: textContent || 'Please view this email in an HTML compatible email client',
            };

            const result = await this._sendWithRetry(mailOptions);
            return result.success;
        } catch (error) {
            logger.error('Error sending email', { error, to, subject });
            return false;
        }
    }

    /**
     * Check if the email service is properly configured and ready
     * @returns {Object} Status information including readiness state
     */
    getServiceStatus() {
        const isProduction = NODE_ENV === 'production';
        const hasTransporter = !!this.transporter;
        const hasAuth = !!(EMAIL_USER && EMAIL_PASSWORD);

        // Check if we have the minimum required configuration
        const isConfigured = isProduction ?
            (hasTransporter && hasAuth) :
            hasTransporter;

        return {
            isReady: isConfigured,
            environment: NODE_ENV,
            transporterConfigured: hasTransporter,
            authConfigured: hasAuth,
            host: EMAIL_HOST || 'smtp.hostinger.com',
            port: EMAIL_PORT || 465,
            timestamp: new Date().toISOString()
        };
    }
}

export default new EmailService(); 