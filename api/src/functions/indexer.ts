// src/functions/indexer.ts
// Blob trigger — fires whenever a file is created or updated in any policies-* container.
// Parses the docx, generates embeddings, and upserts into Azure AI Search.
// This powers the automated indexing path: upload via Azure Portal, CLI, or the app.

import { app, InvocationContext, StorageBlobTrigger } from '@azure/functions';
import { parseDocxBuffer, extractMetaFromFilename } from '../lib/parser.js';
import { generateEmbedding } from '../lib/openai.js';
import { upsertPolicy, deletePolicy } from '../lib/search.js';
import type { PolicyDocument, PolicyStatus } from '../types/policy.js';

// Trigger on all three containers
const containers = ['policies-published', 'policies-draft', 'policies-archive'];

for (const container of containers) {
  app.storageBlob(`indexer-${container}`, {
    path: `${container}/{name}`,
    connection: 'AzureWebJobsStorage',
    handler: async (blob: Buffer, context: InvocationContext) => {
      const blobName = context.triggerMetadata?.name as string;
      const blobUri = context.triggerMetadata?.uri as string ?? '';

      context.log(`Indexer triggered: container=${container} blob=${blobName}`);

      // Only process docx files
      if (!blobName.toLowerCase().endsWith('.docx')) {
        context.log(`Skipping non-docx file: ${blobName}`);
        return;
      }

      try {
        // Derive policy number and title from filename
        // Expected: {policyNumber}-{Title_Words}.docx  e.g. 3-2-01_Patient_Rights.docx
        const { policyNumber, title } = extractMetaFromFilename(blobName);

        if (!policyNumber) {
          context.warn(`Could not extract policy number from filename: ${blobName}`);
          return;
        }

        // Determine status from container
        const status = containerToStatus(container);

        // If archived, remove from search index (don't re-index)
        if (status === 'archived') {
          context.log(`Archiving policy from search index: ${policyNumber}`);
          await deletePolicy(policyNumber);
          return;
        }

        // Parse document
        const sections = await parseDocxBuffer(blob);

        // Generate embedding
        const contentVector = await generateEmbedding(sections.fullText);

        // Build document — metadata fields will be filled by the upload function
        // when uploaded through the app. For files dropped directly into storage,
        // we populate what we can from the filename.
        const docId = policyNumber.replace(/\./g, '-');
        const searchDoc: PolicyDocument = {
          id: docId,
          policyNumber,
          title: title || policyNumber,
          category: inferCategory(policyNumber),
          subCategory: '',
          owner: '',
          status,
          effectiveDate: null,
          reviewDate: null,
          legalReview: false,
          corridorRef: '',
          chapStandard: '',
          scope: sections.scope,
          purpose: sections.purpose,
          policyText: sections.policyText,
          procedureText: sections.procedureText,
          fullText: sections.fullText,
          blobUrl: blobUri,
          blobPath: `${container}/${blobName}`,
          contentVector,
        };

        await upsertPolicy(searchDoc);
        context.log(`Indexed: policy=${policyNumber} status=${status}`);
      } catch (err) {
        context.error(`Indexer failed for ${blobName}:`, err);
        throw err; // Re-throw so Functions retries
      }
    },
  });
}

function containerToStatus(container: string): PolicyStatus {
  if (container === 'policies-published') return 'published';
  if (container === 'policies-archive') return 'archived';
  return 'draft';
}

function inferCategory(policyNumber: string): string {
  if (policyNumber.startsWith('1.')) return '1.xx Administration';
  if (policyNumber.startsWith('2.')) return '2.xx Human Resources';
  if (policyNumber.startsWith('3.1')) return '3.1 Clinical Operations';
  if (policyNumber.startsWith('3.2')) return '3.2 Patient Care & Rights';
  if (policyNumber.startsWith('3.3')) return '3.3 Safety & Infection Control';
  if (policyNumber.startsWith('3.4')) return '3.4 Privacy & Health Information';
  if (policyNumber.startsWith('3.5')) return '3.5 Quality & Compliance';
  if (policyNumber.startsWith('3.6')) return '3.6 Financial & Billing';
  if (policyNumber.startsWith('4.')) return '4.xx Volunteer';
  return 'Uncategorized';
}
