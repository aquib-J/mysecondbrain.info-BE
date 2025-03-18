/**
 * Email templates for the application
 */

/**
 * Generate welcome email HTML template
 * @param {string} username - User's username or name
 * @returns {string} HTML email content
 */
export const welcomeEmailTemplate = (username) => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to MySecondBrain.info</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; background-color: #f7f7f7; line-height: 1.6;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <tr>
          <td style="padding: 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 3px 10px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="background-color: #3a56e4; padding: 30px 20px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome to MySecondBrain.info</h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 30px 20px;">
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">Hello ${username},</p>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">Thank you for joining MySecondBrain.info! I'm thrilled to have you here.</p>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">I created this platform as a personal journey to build my own "second brain" – a place to store and organize all the information that matters to me. Whether it's interesting articles, important facts, personal notes, or references I want to remember later, I wanted a system that could help me manage this knowledge effectively.</p>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">Right now, the features are relatively limited, but I'm continuously working to improve and expand the platform. You can look forward to:</p>
                  
                  <ul style="margin-top: 0; margin-bottom: 15px; padding-left: 20px;">
                    <li style="margin-bottom: 8px;">Advanced document organization and tagging</li>
                    <li style="margin-bottom: 8px;">More robust AI-powered search capabilities</li>
                    <li style="margin-bottom: 8px;">Better integration with other productivity tools</li>
                    <li style="margin-bottom: 8px;">Improved sharing and collaboration options</li>
                  </ul>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">I'll be publishing a product roadmap soon, so you can see what's coming and perhaps even contribute your ideas to shape the future of this tool.</p>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">Thank you for taking the time to try out MySecondBrain.info. Your early support means a lot to me, and I'm committed to making this platform truly valuable for you.</p>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">If you have any questions, feedback, or just want to share how you're using the platform, please don't hesitate to reach out.</p>
                  
                  <p style="margin-top: 0; margin-bottom: 15px; font-size: 16px;">Happy organizing!</p>
                  
                  <p style="margin-top: 30px; margin-bottom: 0; font-size: 16px;">Best regards,<br>The MySecondBrain.info Team</p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 14px; color: #666;">
                  <p style="margin: 0 0 10px 0;">© ${new Date().getFullYear()} MySecondBrain.info - All rights reserved</p>
                  <p style="margin: 0;">You received this email because you signed up for MySecondBrain.info.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

export default {
    welcomeEmailTemplate
}; 