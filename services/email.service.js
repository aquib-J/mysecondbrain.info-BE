import nodemailer from 'nodemailer';
import Logger from '../utils/Logger.js';
import { welcomeEmailTemplate } from '../utils/email.templates.js';

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
            const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, NODE_ENV } = process.env;

            // If testing/development environment, use ethereal test account
            if (NODE_ENV !== 'production') {
                this.createTestAccount();
                return;
            }

            // Create transporter for production
            this.transporter = nodemailer.createTransport({
                host: EMAIL_HOST || 'smtp.gmail.com', // Default to Gmail
                port: EMAIL_PORT || 587,
                secure: EMAIL_PORT === '465', // true for 465, false for other ports
                auth: {
                    user: EMAIL_USER || 'app@mysecondbrain.info',
                    pass: EMAIL_PASSWORD,
                },
            });

            logger.info('Email service initialized successfully');
        } catch (error) {
            logger.error('Error initializing email service', { error });
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
     * Send welcome email to a new user
     * @param {string} email - User's email address
     * @param {string} username - User's username or name
     * @returns {Promise<boolean>} - Success or failure
     */
    async sendWelcomeEmail(email, username) {
        try {
            if (!this.transporter) {
                await this.initialize();
            }

            const mailOptions = {
                from: '"MySecondBrain.info" <app@mysecondbrain.info>',
                to: email,
                subject: 'Welcome to MySecondBrain.info!',
                html: welcomeEmailTemplate(username),
                // You can add text alternative here if needed
                text: `Welcome to MySecondBrain.info, ${username}! Thanks for joining. We've created this platform to help you organize and recall important information. While features are currently limited, we're working to expand capabilities soon. Thank you for your support!`,
            };

            const info = await this.transporter.sendMail(mailOptions);

            if (process.env.NODE_ENV !== 'production') {
                logger.info('Preview URL for test email:', {
                    previewUrl: nodemailer.getTestMessageUrl(info),
                });
            }

            logger.info('Welcome email sent successfully', { email, messageId: info.messageId });
            return true;
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
            if (!this.transporter) {
                await this.initialize();
            }

            const mailOptions = {
                from: '"MySecondBrain.info" <app@mysecondbrain.info>',
                to,
                subject,
                html: htmlContent,
                text: textContent || 'Please view this email in an HTML compatible email client',
            };

            const info = await this.transporter.sendMail(mailOptions);

            if (process.env.NODE_ENV !== 'production') {
                logger.info('Preview URL for test email:', {
                    previewUrl: nodemailer.getTestMessageUrl(info),
                });
            }

            logger.info('Email sent successfully', { to, subject, messageId: info.messageId });
            return true;
        } catch (error) {
            logger.error('Error sending email', { error, to, subject });
            return false;
        }
    }
}

export default new EmailService(); 