# Log Archiving System Documentation

This document provides detailed information about the log archiving system implemented in MySecondBrain.info backend. The system automatically uploads log files to AWS S3 for long-term storage and disaster recovery.

## Overview

The log archiving system is implemented as a scheduled task that runs daily at 1:00 AM UTC. It analyzes log files in the `logs/` directory, identifies files older than 24 hours, and uploads them to a specified AWS S3 bucket for long-term storage.

## Prerequisites

To use the log archiving feature, you need:

1. An AWS account with S3 access
2. An S3 bucket created for log storage
3. AWS IAM credentials with permissions to write to this bucket
4. Proper environment variables configured

## Environment Configuration

The following environment variables must be set:

```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region (e.g., us-east-1)
AWS_S3_BUCKET_NAME=your_bucket_name
```

## How It Works

### Implementation Details

The log archiving system is implemented in `scripts/archive-logs.js` and runs automatically through the cron job system configured in `cron/maintenance.cron.js`.

The process follows these steps:

1. **Scan**: The system scans the `logs/` directory for log files (`.log` and `.log.gz`)
2. **Identify**: Files older than 24 hours are identified for archiving
3. **Upload**: Each eligible file is uploaded to the S3 bucket with the path `logs/{YYYY-MM-DD}/{filename}`
4. **Report**: Statistics are logged for monitoring and debugging

### Cron Schedule

The log archiving task runs according to the following cron schedule:

```
0 1 * * *  # At 1:00 AM UTC every day
```

### S3 Storage Organization

Log files are stored in S3 using the following path structure:

```
{bucket_name}/logs/{YYYY-MM-DD}/{filename}
```

For example:
```
mysecondbrain-logs/logs/2023-10-15/application-2023-10-14.log
```

## Configuration Options

The archiving behavior can be configured by modifying the `S3_CONFIG` object in `scripts/archive-logs.js`:

| Setting | Description | Default |
|---------|-------------|---------|
| `logPrefix` | S3 key prefix for uploads | `logs/` |
| `archiveAge` | Minimum age (ms) for archiving | `24 * 60 * 60 * 1000` (24 hours) |
| `deleteAfterArchive` | Delete local logs after upload | `false` |

## Monitoring and Troubleshooting

### Logs

The archiving process logs its operations to the application logs. To monitor the process:

```
grep "log archival" application.log
```

### Common Issues

1. **Missing AWS credentials**: Ensure AWS environment variables are correctly set
2. **Bucket permissions**: Verify the IAM user has `s3:PutObject` permissions
3. **Region mismatch**: Ensure the bucket exists in the configured AWS region

## Manual Execution

To manually trigger log archiving:

```javascript
import archiveLogs from './scripts/archive-logs.js';

// Run the archive process
archiveLogs().then(stats => {
  console.log('Archive complete:', stats);
});
```

## Statistics and Reporting

The archiving function returns statistics about the operation:

```javascript
{
  scanned: 10,  // Total files examined
  archived: 6,  // Successfully uploaded to S3
  failed: 0,    // Failed uploads
  deleted: 0    // Local files deleted (if enabled)
}
```

## Security Considerations

- AWS credentials are stored as environment variables and never logged
- Log files might contain sensitive information; ensure S3 bucket is properly secured
- Consider enabling S3 bucket encryption for additional security
- Review IAM permissions to follow the principle of least privilege

## Extending the System

To modify the archiving behavior:

1. Edit `scripts/archive-logs.js` to change file selection criteria or S3 path structure
2. Update `cron/maintenance.cron.js` to change the schedule
3. Monitor performance and adjust as needed 