/**
 * Email templates for the application
 */

/**
 * Generate welcome email HTML template
 * @param {string} username - User's username or name
 * @returns {string} HTML email content
 */
export const welcomeEmailTemplate = (username) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>Welcome to MySecondBrain.info</title>
  <style>
    /* Reset styles */
    body, p, h1, h2, h3, h4, h5, h6 {
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      color: #1E293B;
      background-color: #F8FAFC;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    /* Email image defaults */
    .email-image {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      display: block;
      font-family: 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      font-size: 13px;
      color: #64748B;
    }
    
    .social-icon {
      display: inline-block;
      width: 32px !important;
      height: 32px !important;
      margin: 0 8px;
    }
    
    /* Gmail-specific fixes */
    u ~ div .gmail-hide {
      display: none;
    }
    
    u ~ div .gmail-show {
      display: block !important;
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, h1, h2, h3, p {font-family: Arial, Helvetica, sans-serif !important;}
    .mso-button {
      background-color: #5A67D8 !important;
      border-radius: 8px !important;
      font-weight: bold !important;
    }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #1E293B; background-color: #F8FAFC; line-height: 1.6; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    Welcome to MySecondBrain.info - Your personal knowledge management system has been activated!
  </div>
  <!-- Preheader space hack -->
  <div style="display: none; max-height: 0; overflow: hidden;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  
  <div style="max-width: 600px; margin: 0 auto; padding: 20px 10px;">
    <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <!-- Logo Header -->
      <!-- <div style="text-align: center; padding: 30px 20px 25px; background-color: #FFFFFF;">
        <img src="https://public-cdn-jansher.s3.us-east-1.amazonaws.com/logo.png" 
             width="200" 
             style="display: block; margin: 0 auto; max-width: 100%;"
             class="email-image"
             alt="MySecondBrain Logo">
      </div>  -->
      
      <!-- Banner -->
      <div style="background: #FFFFFF; padding: 35px 30px; text-align: center; border-bottom: 1px solid #E2E8F0;">
        <h1 style="color: #1E293B; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin: 0;">Welcome to Your Second Brain!</h1>
        <p style="color: #64748B; margin-top: 15px; font-size: 16px; margin-bottom: 0;">Your journey to better knowledge management starts now</p>
      </div>
      
      <!-- Content -->
      <div style="padding: 30px; text-align: left; background-color: #FFFFFF;">
        <p style="margin-bottom: 22px; font-size: 16px; color: #1E293B;">Hey ${username}!</p>
        
        <p style="margin-bottom: 22px; font-size: 16px; color: #1E293B;">I'm absolutely thrilled you've joined us at MySecondBrain.info! 🎉</p>
        
        <p style="margin-bottom: 22px; font-size: 16px; color: #1E293B;">This platform was born from my own struggle with information overload. I found myself drowning in articles, notes, and important facts with no reliable system to recall them when needed. Sound familiar?</p>
        
        <p style="margin-bottom: 22px; font-size: 16px; color: #1E293B;">That's why I built this digital "second brain" — to help people like us capture, organize, and actually use the knowledge we collect. Whether it's brilliant ideas that strike at midnight or research for your next big project, everything now has a home.</p>
        
        <p style="margin-bottom: 15px; font-size: 16px; color: #1E293B;">I'm working diligently to enhance the platform with exciting features coming soon:</p>
        
        <div style="margin: 25px 0;">
          <div style="padding: 16px; background-color: #F8FAFC; border-radius: 12px; border-left: 4px solid #5A67D8; margin-bottom: 10px; display: flex; align-items: flex-start;">
            <div style="margin-right: 10px; flex-shrink: 0;">
              <img src="https://cdn-icons-png.flaticon.com/512/1828/1828640.png" width="20" height="20" alt="Checkmark">
            </div>
            <p style="margin: 0; font-size: 15px; font-weight: 500; color: #1E293B;">Smart tagging and intelligent categorization</p>
          </div>
          
          <div style="height: 10px;"></div>
          
          <div style="padding: 16px; background-color: #F8FAFC; border-radius: 12px; border-left: 4px solid #5A67D8; margin-bottom: 10px; display: flex; align-items: flex-start;">
            <div style="margin-right: 10px; flex-shrink: 0;">
              <img src="https://cdn-icons-png.flaticon.com/512/3132/3132693.png" width="20" height="20" alt="Brain Icon">
            </div>
            <p style="margin: 0; font-size: 15px; font-weight: 500; color: #1E293B;">Enhanced AI-powered semantic search</p>
          </div>
          
          <div style="height: 10px;"></div>
          
          <div style="padding: 16px; background-color: #F8FAFC; border-radius: 12px; border-left: 4px solid #5A67D8; margin-bottom: 10px; display: flex; align-items: flex-start;">
            <div style="margin-right: 10px; flex-shrink: 0;">
              <img src="https://cdn-icons-png.flaticon.com/512/1086/1086741.png" width="20" height="20" alt="Integration Icon">
            </div>
            <p style="margin: 0; font-size: 15px; font-weight: 500; color: #1E293B;">Seamless integration with your favorite tools</p>
          </div>
        </div>
        
        <p style="margin-top: 25px; margin-bottom: 22px; font-size: 16px; color: #1E293B;">I'd love to hear about your knowledge management challenges and how I might help solve them. This isn't just a product for me — it's a mission to help people think better and create more.</p>
        
        <p style="margin-bottom: 22px; font-size: 16px; color: #1E293B;">Your early support means everything. I'm building this with users like you in mind, and your feedback will directly shape our roadmap.</p>
        
        <p style="margin-bottom: 30px; font-size: 16px; color: #1E293B;">Feel free to reply to this email with any questions or thoughts.</p>
        
        <!-- CTA Button -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://mysecondbrain.info" target="_blank" style="display: inline-block; background: #3B82F6; border-radius: 8px; color: #FFFFFF !important; text-decoration: none; padding: 14px 32px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.25);">
            Get Started Now
          </a>
        </div>
        
        <p style="margin-top: 30px; padding-top: 25px; border-top: 1px solid #E2E8F0; margin-bottom: 0; font-size: 16px; color: #1E293B;">Here's to building your second brain,</p>
        
        <div style="display: flex; align-items: center; margin-top: 15px;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 16px; font-weight: 600; color: #1E293B;">Jansher Aquib</span>
            <span style="font-size: 14px; color: #64748B;">Builder, MySecondBrain.info</span>
          </div>
        </div>
        <br>
        <div align="center">Crafted with Love ❤️ </div>
      </div>
     
      
      <!-- Social Media Links -->
      <div style="background-color: #F8FAFC; padding: 20px 30px; text-align: center; border-top: 1px solid #E2E8F0;">
        <a href="https://linkedin.com" target="_blank">
          <img src="https://cdn-icons-png.flaticon.com/512/174/174857.png"
               width="32"
               height="32"
               class="social-icon email-image"
               alt="LinkedIn">
        </a>
        
        <a href="https://github.com/aquib-J/mysecondbrain.info-BE" target="_blank">
          <img src="https://cdn-icons-png.flaticon.com/512/25/25231.png"
               width="32"
               height="32"
               class="social-icon email-image"
               alt="GitHub">
        </a>
      </div>
      
      <!-- Footer -->
      <div style="background-color: #F1F5F9; padding: 25px 20px; text-align: center; font-size: 13px; color: #64748B; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;">
        <p style="margin-bottom: 8px; color: #64748B;">© ${new Date().getFullYear()} MySecondBrain.info — All rights reserved</p>
        <p style="margin-bottom: 8px; color: #64748B;">
          <a href="https://mysecondbrain.info/privacy" style="color: #1E293B; text-decoration: none; font-weight: 500; margin: 0 5px;">Privacy</a> •
          <a href="https://mysecondbrain.info/terms" style="color: #1E293B; text-decoration: none; font-weight: 500; margin: 0 5px;">Terms</a> •
          <a href="https://mysecondbrain.info/contact" style="color: #1E293B; text-decoration: none; font-weight: 500; margin: 0 5px;">Contact</a>
        </p>
        <p style="margin-top: 18px; font-size: 12px; color: #64748B;">If you have questions, just reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Generate MIS report email HTML template
 * @param {Object} reportData - Report data object containing all metrics
 * @param {Object} reportData.timeRange - Time range information
 * @param {Array} reportData.newUsers - New user signups
 * @param {Array} reportData.newDocuments - New documents uploaded
 * @param {Array} reportData.jobs - Jobs created
 * @param {Object} reportData.vectors - Vector statistics
 * @param {Object} reportData.chats - Chat statistics
 * @returns {string} HTML email content
 */
export const misReportEmailTemplate = (reportData) => {
  const { timeRange, newUsers, newDocuments, jobs, vectors, chats } = reportData;

  // Format timestamp
  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calculate time difference in human readable format
  const getTimeDifference = (start, end) => {
    if (!start || !end) return 'N/A';

    const startTime = new Date(start);
    const endTime = new Date(end);
    const diffMs = endTime - startTime;

    if (diffMs < 0) return 'Invalid time range';

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds} sec`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ${seconds % 60} sec`;

    const hours = Math.floor(minutes / 60);
    return `${hours} hr ${minutes % 60} min`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MySecondBrain.info - MIS Report</title>
  <style>
    body {
      font-family: 'SF Pro Display', 'Inter', 'Segoe UI', Arial, sans-serif;
      color: #1E293B;
      background-color: #F8FAFC;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 20px;
      background-color: #FFFFFF;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }
    .header {
      padding: 20px 0;
      border-bottom: 1px solid #E2E8F0;
      margin-bottom: 20px;
    }
    h1 {
      color: #1E293B;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
    }
    h2 {
      color: #334155;
      font-size: 20px;
      font-weight: 600;
      margin: 25px 0 15px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid #E2E8F0;
    }
    h3 {
      color: #475569;
      font-size: 16px;
      font-weight: 600;
      margin: 15px 0 10px 0;
    }
    p {
      margin: 0 0 15px 0;
      color: #475569;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 14px;
    }
    th {
      background-color: #F1F5F9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 10px;
      border: 1px solid #E2E8F0;
    }
    td {
      padding: 8px 10px;
      border: 1px solid #E2E8F0;
      color: #475569;
    }
    tr:nth-child(even) {
      background-color: #F8FAFC;
    }
    .summary-box {
      background-color: #F8FAFC;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
      border-left: 4px solid #3B82F6;
    }
    .metric {
      font-weight: 600;
      color: #334155;
    }
    .metric-value {
      font-weight: 700;
      color: #3B82F6;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #E2E8F0;
      font-size: 13px;
      color: #64748B;
      text-align: center;
    }
    .no-data {
      font-style: italic;
      color: #94A3B8;
      text-align: center;
      padding: 15px;
    }
    .status-pending {
      color: #FB923C;
      font-weight: 500;
    }
    .status-in-progress {
      color: #3B82F6;
      font-weight: 500;
    }
    .status-success {
      color: #22C55E;
      font-weight: 500;
    }
    .status-failed {
      color: #EF4444;
      font-weight: 500;
    }
    .status-cancelled {
      color: #94A3B8;
      font-weight: 500;
    }
    @media only screen and (max-width: 600px) {
      table {
        font-size: 12px;
      }
      th, td {
        padding: 6px 8px;
      }
      .container {
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MySecondBrain.info - MIS Report</h1>
      <p>Report Period: ${formatDateTime(timeRange.from)} to ${formatDateTime(timeRange.to)}</p>
    </div>
    
    <div class="summary-box">
      <p><span class="metric">New Users:</span> <span class="metric-value">${newUsers.length}</span></p>
      <p><span class="metric">New Documents:</span> <span class="metric-value">${newDocuments.length}</span></p>
      <p><span class="metric">New Jobs:</span> <span class="metric-value">${jobs.length}</span></p>
      <p><span class="metric">New Vectors:</span> <span class="metric-value">${vectors.totalCount || 0}</span></p>
      <p><span class="metric">Active Chats:</span> <span class="metric-value">${chats.totalCount || 0}</span></p>
    </div>
    
    <h2>New User Signups</h2>
    ${newUsers.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>IP Address</th>
          <th>Location</th>
          <th>Signup Time (IST)</th>
        </tr>
      </thead>
      <tbody>
        ${newUsers.map(user => `
        <tr>
          <td>${user.username}</td>
          <td>${user.email}</td>
          <td>${user.metadata?.ipAddress || 'N/A'}</td>
          <td>${user.metadata?.location || 'N/A'}</td>
          <td>${formatDateTime(user.created_at)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `<div class="no-data">No new user signups in this period</div>`}
    
    <h2>New Documents Uploaded</h2>
    ${newDocuments.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Filename</th>
          <th>Type</th>
          <th>Size</th>
          <th>Pages</th>
          <th>Uploaded By</th>
          <th>Uploaded At (IST)</th>
        </tr>
      </thead>
      <tbody>
        ${newDocuments.map(doc => `
        <tr>
          <td>${doc.filename}</td>
          <td>${doc.file_type}</td>
          <td>${formatFileSize(doc.filesize)}</td>
          <td>${doc.pages || 'N/A'}</td>
          <td>${doc.username}</td>
          <td>${formatDateTime(doc.uploaded_at)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `<div class="no-data">No new documents uploaded in this period</div>`}
    
    <h2>Jobs Created</h2>
    ${jobs.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Document</th>
          <th>Job Type</th>
          <th>Status</th>
          <th>Started At (IST)</th>
          <th>Completed At (IST)</th>
          <th>Duration</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${jobs.map(job => `
        <tr>
          <td>${job.document?.filename || `Doc #${job.doc_id}`}</td>
          <td>${job.job_type || 'N/A'}</td>
          <td class="status-${job.status}">${job.status}</td>
          <td>${formatDateTime(job.started_at)}</td>
          <td>${formatDateTime(job.completed_at)}</td>
          <td>${getTimeDifference(job.started_at, job.completed_at)}</td>
          <td>${job.error_message ? job.error_message.substring(0, 50) + (job.error_message.length > 50 ? '...' : '') : 'None'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `<div class="no-data">No new jobs created in this period</div>`}
    
    <h2>Vectors Created</h2>
    <div class="summary-box">
      <p><span class="metric">Total Vectors:</span> <span class="metric-value">${vectors.totalCount || 0}</span></p>
      <p><span class="metric">Success:</span> <span class="metric-value">${vectors.successCount || 0}</span></p>
      <p><span class="metric">In Progress:</span> <span class="metric-value">${vectors.inProgressCount || 0}</span></p>
      <p><span class="metric">Failed:</span> <span class="metric-value">${vectors.failedCount || 0}</span></p>
    </div>
    
    <h2>Chat Activity</h2>
    ${chats.byTitle && chats.byTitle.length > 0 ? `
    <h3>Chats by Title</h3>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Count</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${chats.byTitle.map(chat => `
        <tr>
          <td>${chat.title}</td>
          <td>${chat.count}</td>
          <td>${chat.status}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    ${chats.byUser && chats.byUser.length > 0 ? `
    <h3>Chats by User</h3>
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Active Chats</th>
          <th>Deleted Chats</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${chats.byUser.map(user => `
        <tr>
          <td>${user.username}</td>
          <td>${user.activeCount}</td>
          <td>${user.deletedCount}</td>
          <td>${user.totalCount}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <div class="footer">
      <p>Generated automatically by MySecondBrain.info system at ${formatDateTime(new Date())}</p>
      <p>This email is for system monitoring purposes only.</p>
    </div>
  </div>
</body>
</html>`;
};

export default {
  welcomeEmailTemplate,
  misReportEmailTemplate
};

