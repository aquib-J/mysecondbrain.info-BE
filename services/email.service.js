import nodemailer from 'nodemailer';
import Logger from '../utils/Logger.js';
import { welcomeEmailTemplate } from '../utils/email.templates.js';
import { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, NODE_ENV, TWILIO_SENDGRID_API_KEY } from '../config/env.js';
import sendgrid from '@sendgrid/mail';

const logger = new Logger();


/**
 * Email Service for sending various types of emails
 */
class EmailService {
    constructor() {
        this.transportConfig = null;
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

            // Initialize SendGrid [better to use the client Methods later to use better features]
            sendgrid.setApiKey(TWILIO_SENDGRID_API_KEY);

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

            // Store the transport configuration instead of creating the transport
            this.transportConfig = {
                host: host,
                port: port,
                secure: secure, // true for 465, false for other ports
                auth: {
                    user: EMAIL_USER || '',
                    pass: EMAIL_PASSWORD || '',
                },
                connectionTimeout: 5000, // 5 seconds - reduced from 10
                greetingTimeout: 3000, // 3 seconds - reduced from 5
                socketTimeout: 5000, // 5 seconds - reduced from 10
                tls: {
                    // Do not fail on invalid certs
                    rejectUnauthorized: false
                },
                debug: NODE_ENV === 'development', // only enable debug in development
                logger: NODE_ENV === 'development',  // only log to console in development
                disableFileAccess: true, // Security: disallow attachments from file paths
                pool: false, // Disable connection pooling - create fresh connections
                maxConnections: 1, // Limit to one connection
                maxMessages: 1, // Limit to one message per connection
                rateDelta: 1000, // Minimum milliseconds between messages
                rateLimit: 5, // Maximum number of messages in rateDelta time
                dnsCache: false // Disable DNS caching to get fresh DNS records
            };

            logger.info('Email service initialized successfully');
        } catch (error) {
            logger.error('Error initializing email service', { error: error.message, stack: error.stack });
        }
    }

    /**
     * Create a fresh transporter with the current configuration
     * @returns {Object} - Nodemailer transporter
     * @private
     */
    _createTransporter() {
        if (NODE_ENV !== 'production') {
            return this.testTransporter;
        }

        if (!this.transportConfig) {
            logger.error('Transport configuration not initialized');
            return null;
        }

        return nodemailer.createTransport(this.transportConfig);
    }

    /**
     * Create a test account for development/testing
     */
    async createTestAccount() {
        try {
            // Create test account on ethereal.email
            const testAccount = await nodemailer.createTestAccount();

            // Create a transporter config for testing
            this.transportConfig = {
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            };

            // Store a reference to the test transporter
            this.testTransporter = nodemailer.createTransport(this.transportConfig);

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
            // Create a fresh transporter for each send attempt
            const transporter = this._createTransporter();

            if (!transporter) {
                throw new Error('Failed to create email transporter');
            }

            // Log that we're creating a new transporter for this send
            logger.debug('Creating fresh SMTP transport for email send', {
                to: mailOptions.to,
                subject: mailOptions.subject
            });

            // Attempt to send email with the fresh transporter
            const info = await transporter.sendMail(mailOptions);

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

            // Close the transporter if possible
            if (transporter && typeof transporter.close === 'function') {
                transporter.close();
            }

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
        const hasConfig = !!this.transportConfig;
        const hasAuth = !!(EMAIL_USER && EMAIL_PASSWORD);

        // Check if we have the minimum required configuration
        const isConfigured = isProduction ?
            (hasConfig && hasAuth) :
            hasConfig;

        return {
            isReady: isConfigured,
            environment: NODE_ENV,
            configAvailable: hasConfig,
            authConfigured: hasAuth,
            host: EMAIL_HOST || 'smtp.hostinger.com',
            port: EMAIL_PORT || 465,
            timestamp: new Date().toISOString()
        };
    }


    /**
     * Send an email with SendGrid [Latest PIVOT to use SendGrid]
     * @param {{
     *  to: string,
     *  from: string, 
     *  subject: string, 
     *  html: string, 
     *  text: string, 
     *  type: string ['generic', 'welcome', 'password-reset', 'verification'] , 
     *  metadata: {
     *      reportType?:string,
     *      reportId?:string, 
     *      reportPeriod?:string
     *  }}} emailJob - Email job object
     * @param {string} [username] - Username for welcome email
     * @returns {Promise<boolean>} - Success or failure
     */
    async sendEmailWithSendGrid(emailJob, username = null) {
        let mailOptions = null;
        const from = 'app@mysecondbrain.info';
        try {
            if (emailJob.type === 'welcome') {
                mailOptions = {
                    from,
                    to: emailJob.to,
                    subject: 'Welcome to MySecondBrain.info!',
                    html: welcomeEmailTemplate(username),
                    text: `Welcome to MySecondBrain.info, ${username}! Thanks for joining. We've created this platform to help you organize and recall important information. While features are currently limited, we're working to expand capabilities soon. Thank you for your support!`,
                };
            } else if (emailJob.type === 'generic') {
                mailOptions = {
                    from,
                    to: emailJob.to,
                    subject: emailJob.subject,
                    text: emailJob.text,
                    html: emailJob.html,
                };
            }

            const result = await sendgrid.send(mailOptions);
            return result;
        } catch (error) {
            logger.error(`Error sending ${emailJob.type} email`, { error, emailJob });
            return false;
        }
    }
}

export default new EmailService(); 