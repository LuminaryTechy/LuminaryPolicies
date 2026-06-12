// src/functions/upload.ts
// POST /api/upload
// Multipart form: file (docx), metadata (JSON string)
// Only HR, Compliance, and IT Admin can call this endpoint.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { z } from 'zod';
import { extractUserClaims, canUpload } from '../lib/auth.js';
import { parseDocxBuffer } from '../lib/parser.js';
import { generateEmbedding } from '../lib/openai.js';
import { upsertPolicy } from '../lib/search.js';
import { config } from '../config.js';
import type { UploadMetadata, PolicyDocument } from '../types/policy.js';

const MetadataSchema = z.object({
  policyNumber: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  subCategory: z.string().optional().default(''),
  owner: z.string().min(1),
  status: z.enum(['published', 'draft', 'in-review', 'archived']),
  effectiveDate: z.string().optional(),
  reviewDate: z.string().optional(),
  legalReview: z.boolean().default(false),
  corridorRef: z.string().optional().default(''),
  chapStandard: z.string().optional().default(''),
});

app.http('upload', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === 'OPTIONS') return corsResponse(204, null);

    const claims = extractUserClaims(req);
    if (!claims) return corsResponse(401, { error: 'Unauthorized' });
    if (!canUpload(claims.role)) {
      return corsResponse(403, { error: 'You do not have permission to upload policies.' });
    }

    // Parse multipart form data
    const formData = await req.formData().catch(() => null);
    if (!formData) return corsResponse(400, { error: 'Expected multipart/form-data' });

    const fileEntry = formData.get('file');
    const metadataEntry = formData.get('metadata');

    if (!fileEntry || typeof fileEntry === 'string') {
      return corsResponse(400, { error: 'file is required' });
    }
    if (!metadataEntry || typeof metadataEntry !== 'string') {
      return corsResponse(400, { error: 'metadata JSON string is required' });
    }

    // Validate metadata
    let rawMeta: unknown;
    try { rawMeta = JSON.parse(metadataEntry); } catch {
      return corsResponse(400, { error: 'metadata must be valid JSON' });
    }
    const parsed = MetadataSchema.safeParse(rawMeta);
    if (!parsed.success) {
      return corsResponse(400, { error: 'Invalid metadata', details: parsed.error.flatten() });
    }
    const meta: UploadMetadata = parsed.data;

    // HR can only upload HR category policies
    if (claims.role === 'hr' && !meta.category.startsWith('2.')) {
      return corsResponse(403, { error: 'HR users can only upload Human Resources policies.' });
    }

    try {
      // Read file as buffer
      const fileBlob = fileEntry as File;
      const arrayBuffer = await fileBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine container
      const containerName = meta.status === 'published'
        ? config.storage.containers.published
        : meta.status === 'archived'
          ? config.storage.containers.archive
          : config.storage.containers.draft;

      // Upload to blob storage
      const blobName = `${meta.policyNumber.replace(/\./g, '-')}_${sanitizeFilename(meta.title)}.docx`;
      const blobPath = `${containerName}/${blobName}`;

      const blobServiceClient = BlobServiceClient.fromConnectionString(config.storage.connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        metadata: {
          policyNumber: meta.policyNumber,
          title: meta.title,
          uploadedBy: claims.email,
          uploadedAt: new Date().toISOString(),
        },
      });

      // Parse document sections
      const sections = await parseDocxBuffer(buffer);

      // Generate embedding from full text
      const contentVector = await generateEmbedding(sections.fullText);

      // Build search document
      const docId = meta.policyNumber.replace(/\./g, '-');
      const searchDoc: PolicyDocument = {
        id: docId,
        policyNumber: meta.policyNumber,
        title: meta.title,
        category: meta.category,
        subCategory: meta.subCategory ?? '',
        owner: meta.owner,
        status: meta.status,
        effectiveDate: meta.effectiveDate ?? null,
        reviewDate: meta.reviewDate ?? null,
        legalReview: meta.legalReview,
        corridorRef: meta.corridorRef ?? '',
        chapStandard: meta.chapStandard ?? '',
        scope: sections.scope,
        purpose: sections.purpose,
        policyText: sections.policyText,
        procedureText: sections.procedureText,
        fullText: sections.fullText,
        blobUrl: blockBlobClient.url,
        blobPath,
        contentVector,
      };

      await upsertPolicy(searchDoc);

      ctx.log(`Upload: user=${claims.email} policy=${meta.policyNumber} status=${meta.status}`);

      return corsResponse(201, {
        message: 'Policy uploaded and indexed successfully.',
        policyNumber: meta.policyNumber,
        title: meta.title,
        status: meta.status,
        blobPath,
      });
    } catch (err) {
      ctx.error('Upload error:', err);
      return corsResponse(500, { error: 'Upload failed. Please try again.' });
    }
  },
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

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
