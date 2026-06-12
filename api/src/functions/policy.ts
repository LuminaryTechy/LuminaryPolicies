// src/functions/policy.ts
// GET /api/policy/{policyNumber}  — returns full policy document
// GET /api/policy/{policyNumber}/download — returns a short-lived SAS URL to the docx

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { extractUserClaims, canSeeDrafts } from '../lib/auth.js';
import { getPolicy } from '../lib/search.js';
import { config } from '../config.js';

// GET /api/policy/{policyNumber}
app.http('getPolicy', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'policy/{policyNumber}',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === 'OPTIONS') return corsResponse(204, null);

    const claims = extractUserClaims(req);
    if (!claims) return corsResponse(401, { error: 'Unauthorized' });

    const policyNumber = req.params.policyNumber;
    if (!policyNumber) return corsResponse(400, { error: 'policyNumber required' });

    try {
      const doc = await getPolicy(policyNumber);
      if (!doc) return corsResponse(404, { error: 'Policy not found' });

      // Check access
      if (doc.status !== 'published' && !canSeeDrafts(claims.role, doc.category)) {
        return corsResponse(403, { error: 'You do not have access to this policy.' });
      }

      ctx.log(`GetPolicy: user=${claims.email} policy=${policyNumber}`);
      return corsResponse(200, doc);
    } catch (err) {
      ctx.error('GetPolicy error:', err);
      return corsResponse(500, { error: 'Failed to retrieve policy.' });
    }
  },
});

// GET /api/policy/{policyNumber}/download — SAS URL valid for 15 minutes
app.http('downloadPolicy', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'policy/{policyNumber}/download',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === 'OPTIONS') return corsResponse(204, null);

    const claims = extractUserClaims(req);
    if (!claims) return corsResponse(401, { error: 'Unauthorized' });

    const policyNumber = req.params.policyNumber;
    if (!policyNumber) return corsResponse(400, { error: 'policyNumber required' });

    try {
      const doc = await getPolicy(policyNumber);
      if (!doc) return corsResponse(404, { error: 'Policy not found' });

      if (doc.status !== 'published' && !canSeeDrafts(claims.role, doc.category)) {
        return corsResponse(403, { error: 'You do not have access to this policy.' });
      }

      // Generate a 15-minute SAS URL
      const blobServiceClient = BlobServiceClient.fromConnectionString(config.storage.connectionString);
      const [containerName, ...blobParts] = doc.blobPath.split('/');
      const blobName = blobParts.join('/');
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobName);

      const expiresOn = new Date();
      expiresOn.setMinutes(expiresOn.getMinutes() + 15);

      const sasUrl = await blobClient.generateSasUrl({
        permissions: { read: true } as Parameters<typeof blobClient.generateSasUrl>[0]['permissions'],
        expiresOn,
      });

      ctx.log(`Download: user=${claims.email} policy=${policyNumber}`);
      return corsResponse(200, { url: sasUrl, expiresIn: 900 });
    } catch (err) {
      ctx.error('Download error:', err);
      return corsResponse(500, { error: 'Failed to generate download link.' });
    }
  },
});

function corsResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: body ? JSON.stringify(body) : undefined,
  };
}
