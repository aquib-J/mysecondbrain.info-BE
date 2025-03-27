#!/usr/bin/env node
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { welcomeEmailTemplate } from '../utils/email.templates.js';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Load production environment variables
dotenv.config({ path: path.join(rootDir, '.env.production') });

// Get email credentials from environment
const {
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_USER,
    EMAIL_PASSWORD,
    EMAIL_FROM
} = process.env;

// Configure test parameters
const TEST_RECIPIENT = 'aquib.jansher@gmail.com';
const TEST_SUBJECT = 'Test Email from MySecondBrain.info Email Service';

/**
 * Create a simple HTML email template
 */
function createTestEmailHtml() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f4f4f4; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 0.8em; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MySecondBrain.info</h1>
        </div>
        <div class="content">
          <h2>Test Email</h2>
          <p>This is a test email sent at: ${new Date().toISOString()}</p>
          <p>This email was sent to verify functionality of the email service in production.</p>
          <p>Email configuration:</p>
          <ul>
            <li>Host: ${EMAIL_HOST}</li>
            <li>Port: ${EMAIL_PORT}</li>
            <li>User: ${EMAIL_USER}</li>
            <li>Secure: ${EMAIL_PORT === '465' ? 'Yes' : 'No'}</li>
          </ul>
          <p>If you received this email, the email service is working correctly!</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} MySecondBrain.info</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Run detailed email test with verbose logging
 */
async function runEmailTest() {
    console.log('Starting email service test...');
    console.log('----------------------------------------');
    console.log('Testing with these email settings:');
    console.log(`Host: ${EMAIL_HOST}`);
    console.log(`Port: ${EMAIL_PORT}`);
    console.log(`User: ${EMAIL_USER}`);
    console.log(`From: ${EMAIL_FROM || '"MySecondBrain.info" <app@mysecondbrain.info>'}`);
    console.log(`Password: ${EMAIL_PASSWORD ? '********' : 'Not provided'}`);
    console.log(`Secure: ${EMAIL_PORT === '465'}`);
    console.log('----------------------------------------');

    try {
        // Create transporter with debug option
        console.log('Creating transporter...');
        const transporter = nodemailer.createTransport({
            host: EMAIL_HOST || 'smtp.gmail.com',
            port: EMAIL_PORT || 587,
            secure: EMAIL_PORT === '465', // true for 465, false for other ports
            auth: {
                user: EMAIL_USER || 'app@mysecondbrain.info',
                pass: EMAIL_PASSWORD,
            },
            debug: true, // Enable debug output
            logger: true // Log to console
        });

        // Verify SMTP configuration
        console.log('Verifying SMTP configuration...');
        const verification = await transporter.verify();
        console.log('SMTP Verification result:', verification);

        // Prepare email
        const mailOptions = {
            from: EMAIL_FROM || '"MySecondBrain.info" <app@mysecondbrain.info>',
            to: TEST_RECIPIENT,
            subject: TEST_SUBJECT,
            html: welcomeEmailTemplate('Jansher'),
            text: `This is a test email sent at: ${new Date().toISOString()}. If you received this email, the email service is working correctly!`,
        };

        // Send email
        console.log('Sending test email...');
        const info = await transporter.sendMail(mailOptions);

        console.log('----------------------------------------');
        console.log('Email sent successfully!');
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        console.log('----------------------------------------');

        // Test completed
        console.log('Email test completed successfully');

        return true;
    } catch (error) {
        console.error('----------------------------------------');
        console.error('Email test failed with error:');
        console.error(error);
        console.error('----------------------------------------');

        // Detailed error analysis
        console.error('Detailed error analysis:');

        if (error.code === 'EAUTH') {
            console.error('Authentication failed. Check your username and password.');
        } else if (error.code === 'ESOCKET') {
            console.error('Socket error. Check your host and port settings.');
        } else if (error.code === 'ETIMEDOUT') {
            console.error('Connection timed out. Check your network and firewall settings.');
        } else if (error.code === 'ECONNECTION') {
            console.error('Connection error. Check if the server is reachable.');
        }

        if (error.response) {
            console.error('Server responded with:', error.response);
        }

        // Gmail-specific advice
        if (EMAIL_HOST?.includes('gmail')) {
            console.error('\nGmail-specific troubleshooting:');
            console.error('1. Ensure "Less secure app access" is enabled for your Gmail account');
            console.error('2. If using 2FA, use an App Password instead of your regular password');
            console.error('3. Try allowing access via: https://accounts.google.com/DisplayUnlockCaptcha');
        }

        return false;
    }
}

// Execute the test immediately when script is run
runEmailTest()
    .then(success => {
        if (success) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    })
    .catch(err => {
        console.error('Unhandled error during test:', err);
        process.exit(1);
    }); 