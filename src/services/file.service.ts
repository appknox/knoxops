import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import crypto from 'crypto';
import type { MultipartFile } from '@fastify/multipart';
import { env } from '../config/env.js';

// S3 Client initialization
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!env.AWS_REGION || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }

    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export interface SaveFileResult {
  s3Key: string;
  fileName: string;
  fileSize: number;
  signedUrl: string;
  buffer?: Buffer; // For parsing Excel files
}

/**
 * Convert file stream to buffer for S3 upload
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Generate S3 signed URL for download
 */
export async function getSignedUrl(s3Key: string, expirySeconds?: number, fileName?: string): Promise<string> {
  try {
    const s3 = getS3Client();
    const command = new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET!,
      Key: s3Key,
      ...(fileName && { ResponseContentDisposition: `attachment; filename="${fileName}"` }),
    });

    const url = await awsGetSignedUrl(s3, command, {
      expiresIn: expirySeconds || env.AWS_S3_SIGNED_URL_EXPIRY,
    });
    return url;
  } catch (error) {
    console.error('Error generating signed URL for key:', s3Key, error);
    throw error;
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFileFromS3(s3Key: string): Promise<void> {
  try {
    const s3 = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET!,
      Key: s3Key,
    });
    await s3.send(command);
  } catch (error) {
    // Log error but don't fail - graceful degradation
    console.error(`Failed to delete S3 file: ${s3Key}`, error);
  }
}

/**
 * Check if a file exists in S3
 */
export async function fileExistsInS3(s3Key: string): Promise<boolean> {
  try {
    const s3 = getS3Client();
    const command = new HeadObjectCommand({
      Bucket: env.AWS_S3_BUCKET!,
      Key: s3Key,
    });
    await s3.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get a readable stream from S3 file
 */
export async function getS3FileStream(s3Key: string): Promise<NodeJS.ReadableStream> {
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET!,
    Key: s3Key,
  });
  const response = await s3.send(command);
  return response.Body as NodeJS.ReadableStream;
}

/**
 * Save a prerequisite Excel file to S3
 */
export async function savePrerequisiteFile(
  file: MultipartFile,
  deploymentId: string,
  orgId: string
): Promise<SaveFileResult> {
  // Validate file type (Excel files only)
  const allowedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Only Excel files (.xls, .xlsx) are allowed.');
  }

  // Generate S3 key: onprem/{clientId}/prerequisites/
  const timestamp = Date.now();
  const ext = path.extname(file.filename);
  const s3Key = `onprem/${orgId}/prerequisites/${deploymentId}-${timestamp}${ext}`;

  // Convert stream to buffer and upload
  const buffer = await streamToBuffer(file.file);
  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET!,
    Key: s3Key,
    Body: buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);

  // Generate signed URL with filename for proper download naming
  const signedUrl = await getSignedUrl(s3Key, undefined, file.filename);

  return {
    s3Key,
    fileName: file.filename,
    fileSize: buffer.length,
    signedUrl,
    buffer, // For parsing Excel files
  };
}

/**
 * Save an SSL certificate file to S3
 */
export async function saveSslCertificateFile(
  file: MultipartFile,
  deploymentId: string,
  orgId: string
): Promise<SaveFileResult> {
  // Validate file type (ZIP and GZ files)
  const allowedMimeTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/gzip',
    'application/x-gzip',
    'application/x-tar',
    'application/x-compressed-tar',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Only compressed files (.zip, .gz, .tar.gz) are allowed.');
  }

  // Determine file extension from original filename
  const originalExt = path.extname(file.filename).toLowerCase();
  const validExtensions = ['.zip', '.gz', '.tar.gz', '.tgz'];

  let fileExt = '.zip'; // default
  if (file.filename.endsWith('.tar.gz')) {
    fileExt = '.tar.gz';
  } else if (validExtensions.includes(originalExt)) {
    fileExt = originalExt;
  }

  // Generate S3 key: onprem/{clientId}/ssl-certificates/
  const s3Key = `onprem/${orgId}/ssl-certificates/${deploymentId}-ssl-certs${fileExt}`;

  // Convert stream to buffer and upload
  const buffer = await streamToBuffer(file.file);
  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET!,
    Key: s3Key,
    Body: buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);

  // Generate signed URL with filename for proper download naming
  const fileName = `${deploymentId}-ssl-certs${fileExt}`;
  const signedUrl = await getSignedUrl(s3Key, undefined, fileName);

  return {
    s3Key,
    fileName,
    fileSize: buffer.length,
    signedUrl,
  };
}

/**
 * Save a general document file (RFP or other) to S3
 */
export async function saveDocumentFile(
  deploymentId: string,
  category: 'rfp' | 'other',
  file: MultipartFile,
  orgId: string
): Promise<{ s3Key: string; fileName: string; fileUrl: string; mimeType: string; fileSize: number; signedUrl: string }> {
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

  // Allowed MIME types
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
  ];

  if (!allowedMimes.includes(file.mimetype)) {
    throw new Error(`File type ${file.mimetype} is not allowed`);
  }

  // Convert stream to buffer (to check size before uploading)
  const buffer = await streamToBuffer(file.file);

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds maximum allowed size of 50 MB');
  }

  // Generate S3 key: onprem/{clientId}/others/
  const ext = path.extname(file.filename) || '';
  const randomId = crypto.randomBytes(8).toString('hex');
  const s3Key = `onprem/${orgId}/others/${Date.now()}-${randomId}${ext}`;

  // Upload to S3
  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET!,
    Key: s3Key,
    Body: buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);

  // Generate signed URL with filename for proper download naming
  const signedUrl = await getSignedUrl(s3Key, undefined, file.filename);

  return {
    s3Key,
    fileName: file.filename,
    fileUrl: s3Key, // Store S3 key in DB
    mimeType: file.mimetype,
    fileSize: buffer.length,
    signedUrl,
  };
}

/**
 * Save a license file to S3
 */
export async function saveLicenseFile(
  file: { filename: string; data: Buffer },
  deploymentId: string,
  requestId: string,
  orgId: string
): Promise<{ s3Key: string; fileName: string; fileSize: number }> {
  // Generate S3 key: onprem/{clientId}/license-files/{requestId}/
  const s3Key = `onprem/${orgId}/license-files/${requestId}/${file.filename}`;

  // Upload to S3
  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET!,
    Key: s3Key,
    Body: file.data,
    ContentType: 'application/octet-stream',
  });

  await s3.send(command);

  return {
    s3Key,
    fileName: file.filename,
    fileSize: file.data.length,
  };
}

/**
 * Deprecated: kept for backward compatibility, redirects to S3 operations
 * Get the full path to a prerequisite file (returns S3 key)
 */
export function getPrerequisiteFilePath(s3Key: string): string {
  return s3Key;
}

/**
 * Deprecated: kept for backward compatibility, redirects to S3 operations
 * Get the full path to an SSL certificate file (returns S3 key)
 */
export function getSslCertificateFilePath(s3Key: string): string {
  return s3Key;
}

/**
 * Deprecated: kept for backward compatibility
 * Delete a prerequisite file (uses S3 deletion)
 */
export async function deletePrerequisiteFile(s3Key: string): Promise<void> {
  await deleteFileFromS3(s3Key);
}

/**
 * Deprecated: kept for backward compatibility
 * Delete an SSL certificate file (uses S3 deletion)
 */
export async function deleteSslCertificateFile(s3Key: string): Promise<void> {
  await deleteFileFromS3(s3Key);
}

/**
 * Delete a document file from S3
 */
export async function deleteDocumentFile(s3Key: string): Promise<void> {
  await deleteFileFromS3(s3Key);
}

/**
 * Check if a file exists
 */
export async function fileExists(s3Key: string): Promise<boolean> {
  return fileExistsInS3(s3Key);
}
