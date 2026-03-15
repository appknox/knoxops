import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { MultipartFile } from '@fastify/multipart';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const PREREQUISITES_DIR = path.join(UPLOADS_DIR, 'prerequisites');
const SSL_CERTS_DIR = path.join(UPLOADS_DIR, 'ssl-certificates');

// Ensure directories exist
async function ensureDirectories() {
  await fsp.mkdir(PREREQUISITES_DIR, { recursive: true });
  await fsp.mkdir(SSL_CERTS_DIR, { recursive: true });
}

export interface SaveFileResult {
  fileName: string;
  filePath: string;
  fileSize: number;
}

/**
 * Save an uploaded file to the prerequisites directory
 */
export async function savePrerequisiteFile(
  file: MultipartFile,
  deploymentId: string
): Promise<SaveFileResult> {
  await ensureDirectories();

  // Validate file type (Excel files only)
  const allowedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Only Excel files (.xls, .xlsx) are allowed.');
  }

  // Generate unique filename with deployment ID and timestamp
  const timestamp = Date.now();
  const ext = path.extname(file.filename);
  const fileName = `${deploymentId}-${timestamp}${ext}`;
  const filePath = path.join(PREREQUISITES_DIR, fileName);

  // Save file
  await pipeline(file.file, fs.createWriteStream(filePath));

  // Get file size
  const stats = await fsp.stat(filePath);

  return {
    fileName: file.filename, // Original filename
    filePath: fileName, // Stored filename
    fileSize: stats.size,
  };
}

/**
 * Get the full path to a prerequisite file
 */
export function getPrerequisiteFilePath(fileName: string): string {
  return path.join(PREREQUISITES_DIR, fileName);
}

/**
 * Delete a prerequisite file
 */
export async function deletePrerequisiteFile(fileName: string): Promise<void> {
  const filePath = getPrerequisiteFilePath(fileName);
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(fileName: string): Promise<boolean> {
  try {
    await fsp.access(getPrerequisiteFilePath(fileName));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save an uploaded SSL certificate file (ZIP or GZ compressed files)
 */
export async function saveSslCertificateFile(
  file: MultipartFile,
  deploymentId: string
): Promise<SaveFileResult> {
  await ensureDirectories();

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

  // Use generic filename: {deploymentId}-ssl-certs.{ext}
  const fileName = `${deploymentId}-ssl-certs${fileExt}`;
  const filePath = path.join(SSL_CERTS_DIR, fileName);

  // Save file
  await pipeline(file.file, fs.createWriteStream(filePath));

  // Get file size
  const stats = await fsp.stat(filePath);

  return {
    fileName, // Generic filename
    filePath: fileName, // Stored filename
    fileSize: stats.size,
  };
}

/**
 * Get the full path to an SSL certificate file
 */
export function getSslCertificateFilePath(fileName: string): string {
  return path.join(SSL_CERTS_DIR, fileName);
}

/**
 * Delete an SSL certificate file
 */
export async function deleteSslCertificateFile(fileName: string): Promise<void> {
  const filePath = getSslCertificateFilePath(fileName);
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
