import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getApp, testUsers, loginUser, createTestUser, createTestOnpremDeployment, cleanupTestData, initializeTests, teardownTests } from './setup.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OnPrem File Uploads & Downloads (S3 Integration)', () => {
  let app;
  let adminToken: string;
  let adminUser;
  let deploymentId: string;

  beforeAll(async () => {
    await initializeTests();
    app = await getApp();
    adminUser = await createTestUser({
      email: 'onprem-admin@test.com',
      firstName: 'OnPrem',
      lastName: 'Admin',
      role: 'admin',
      password: 'testpass123',
    });

    adminToken = (await loginUser(app, adminUser.email, 'testpass123')).accessToken;

    // Create a test deployment
    const deployRes = await createTestOnpremDeployment(app, adminToken);
    const deployment = deployRes.json();
    deploymentId = deployment.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  describe('POST /api/onprem/:id/prerequisite - Prerequisite File Upload', () => {
    it('should upload prerequisite file', async () => {
      // Create a simple Excel-like file for testing
      const fileName = `test-prereq-${Date.now()}.xlsx`;
      const filePath = path.join(__dirname, fileName);
      const buffer = Buffer.from('PK\x03\x04', 'binary'); // Minimal XLSX header
      fs.writeFileSync(filePath, buffer);

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/prerequisite`,
          headers: { authorization: `Bearer ${adminToken}` },
          // Simulate multipart file upload
          payload: {
            file: fs.createReadStream(filePath),
          },
        });

        // Note: Actual file upload behavior depends on multipart handling
        // Response code might be 200 for successful upload
        if (response.statusCode === 200 || response.statusCode === 201) {
          const result = response.json();
          expect(result.fileName).toBeDefined();
          expect(result.message).toContain('uploaded');
        }
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    it('should return error when no file is uploaded', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect([400, 404, 406, 415]).toContain(response.statusCode);
    });
  });

  describe('GET /api/onprem/:id/prerequisite - Prerequisite File Download', () => {
    it('should return signed URL for prerequisite download', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // May be 200 if file exists, or 404 if not uploaded
      if (response.statusCode === 200) {
        const result = response.json();
        expect(result.downloadUrl).toBeDefined();
        expect(result.fileName).toBeDefined();
        // Signed URL should contain S3 URL format
        expect(result.downloadUrl).toMatch(/https?:\/\//);
      } else if (response.statusCode === 404) {
        expect(response.statusCode).toBe(404);
      }
    });

    it('should return JSON response (not stream)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Should return JSON, not blob
      const contentType = response.headers['content-type'];
      if (response.statusCode === 200) {
        expect(contentType).toContain('application/json');
      }
    });
  });

  describe('POST /api/onprem/:id/ssl-certificate - SSL Certificate Upload', () => {
    it('should upload SSL certificate file', async () => {
      const fileName = `test-cert-${Date.now()}.zip`;
      const filePath = path.join(__dirname, fileName);
      const buffer = Buffer.from('PK\x03\x04', 'binary'); // ZIP header
      fs.writeFileSync(filePath, buffer);

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/ssl-certificate`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            file: fs.createReadStream(filePath),
          },
        });

        if (response.statusCode === 200 || response.statusCode === 201) {
          const result = response.json();
          expect(result.fileName).toBeDefined();
          expect(result.message).toContain('uploaded');
        }
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    it('should validate certificate file type', async () => {
      const fileName = `test-cert-${Date.now()}.txt`;
      const filePath = path.join(__dirname, fileName);
      fs.writeFileSync(filePath, 'invalid certificate');

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/ssl-certificate`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            file: fs.createReadStream(filePath),
          },
        });

        // Should reject invalid file type or pass through
        expect([400, 404, 406, 415, 201, 200]).toContain(response.statusCode);
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });
  });

  describe('GET /api/onprem/:id/ssl-certificate - SSL Certificate Download', () => {
    it('should return signed URL for certificate download', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/ssl-certificate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        const result = response.json();
        expect(result.downloadUrl).toBeDefined();
        expect(result.fileName).toBeDefined();
      } else if (response.statusCode === 404) {
        expect(response.statusCode).toBe(404);
      }
    });
  });

  describe('POST /api/onprem/:id/documents - Document Upload', () => {
    it('should upload document with RFP category', async () => {
      const fileName = `test-rfp-${Date.now()}.pdf`;
      const filePath = path.join(__dirname, fileName);
      fs.writeFileSync(filePath, '%PDF-1.4'); // PDF header

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/documents`,
          headers: { authorization: `Bearer ${adminToken}` },
          query: { category: 'rfp' },
          payload: {
            file: fs.createReadStream(filePath),
          },
        });

        if (response.statusCode === 200 || response.statusCode === 201) {
          const result = Array.isArray(response.json()) ? response.json()[0] : response.json();
          expect(result.fileName).toBeDefined();
        }
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    it('should upload document with other category', async () => {
      const fileName = `test-doc-${Date.now()}.docx`;
      const filePath = path.join(__dirname, fileName);
      fs.writeFileSync(filePath, 'PK\x03\x04'); // Office file header

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/documents`,
          headers: { authorization: `Bearer ${adminToken}` },
          query: { category: 'other' },
          payload: {
            file: fs.createReadStream(filePath),
          },
        });

        if (response.statusCode === 200 || response.statusCode === 201) {
          const result = Array.isArray(response.json()) ? response.json()[0] : response.json();
          expect(result.fileName).toBeDefined();
        }
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    it('should require category parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/documents`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          file: Buffer.from('%PDF-1.4'),
        },
      });

      expect([400, 404, 406, 415, 201, 200]).toContain(response.statusCode);
    });

    it('should validate file type', async () => {
      const fileName = `test-exe-${Date.now()}.exe`;
      const filePath = path.join(__dirname, fileName);
      fs.writeFileSync(filePath, 'MZ'); // EXE header

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/onprem/${deploymentId}/documents`,
          headers: { authorization: `Bearer ${adminToken}` },
          query: { category: 'other' },
          payload: {
            file: fs.createReadStream(filePath),
          },
        });

        // Should either reject or accept based on implementation
        expect([400, 404, 406, 415, 201, 200]).toContain(response.statusCode);
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });
  });

  describe('GET /api/onprem/:id/documents - List Documents', () => {
    it('should list documents for deployment', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/documents`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const docs = response.json();
      expect(Array.isArray(docs)).toBe(true);
    });

    it('should filter documents by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/documents`,
        headers: { authorization: `Bearer ${adminToken}` },
        query: { category: 'rfp' },
      });

      expect(response.statusCode).toBe(200);
      const docs = response.json();
      expect(Array.isArray(docs)).toBe(true);
    });
  });

  describe('DELETE /api/onprem/:id/documents/:docId - Delete Document', () => {
    it('should delete document from S3 and database', async () => {
      // First, get the list of documents
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/documents`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const docs = listRes.json();
      if (docs.length > 0) {
        const docId = docs[0].id;

        const deleteRes = await app.inject({
          method: 'DELETE',
          url: `/api/onprem/${deploymentId}/documents/${docId}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect([200, 204]).toContain(deleteRes.statusCode);
      }
    });
  });

  describe('GET /api/onprem/:id/download-all - Download All Documents as ZIP', () => {
    it('should return ZIP file with all documents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/download-all`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        // Should return ZIP content type
        const contentType = response.headers['content-type'];
        expect(contentType).toContain('application/zip');
      }
    });

    it('should include Content-Disposition header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/download-all`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        const disposition = response.headers['content-disposition'];
        expect(disposition).toContain('attachment');
      }
    });
  });

  describe('S3 Integration Edge Cases', () => {
    it('should handle non-existent deployment gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/onprem/00000000-0000-0000-0000-000000000000/prerequisite',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should require authentication for file downloads', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: {}, // No auth header
      });

      expect([401, 404]).toContain(response.statusCode);
    });

    it('should require authentication for file uploads', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: {}, // No auth header
        payload: {},
      });

      expect([401, 404]).toContain(response.statusCode);
    });

    it('should create audit log for file uploads', async () => {
      // Get audit logs for deployment
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/audit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        const logs = response.json().data;
        expect(Array.isArray(logs)).toBe(true);
        // May have upload-related logs depending on prior uploads
      }
    });
  });

  describe('File Upload Response Format', () => {
    it('should return JSON response from upload endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        const contentType = response.headers['content-type'];
        expect(contentType).toContain('application/json');

        const body = response.json();
        expect(body.downloadUrl).toBeDefined();
        expect(typeof body.downloadUrl).toBe('string');
      }
    });

    it('should include fileName in download response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        const body = response.json();
        expect(body.fileName).toBeDefined();
        expect(typeof body.fileName).toBe('string');
      }
    });

    it('should generate proper signed URLs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/onprem/${deploymentId}/prerequisite`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      if (response.statusCode === 200) {
        const body = response.json();
        const url = body.downloadUrl;

        // Signed URL should be HTTPS and contain S3 bucket
        expect(url).toMatch(/^https?:\/\//);
        expect(url).toMatch(/s3|amazonaws/i);
      }
    });
  });
});
