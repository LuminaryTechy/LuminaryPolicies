// src/lib/search.ts
// Azure AI Search client — index documents and query policies

import { SearchClient, SearchIndexClient, AzureKeyCredential } from '@azure/ai-search';
import { DefaultAzureCredential } from '@azure/identity';
import { config } from '../config.js';
import type { PolicyDocument, PolicySearchResult } from '../types/policy.js';

// Use managed identity in production, key fallback for local dev
function getCredential() {
  if (process.env.SEARCH_API_KEY) {
    return new AzureKeyCredential(process.env.SEARCH_API_KEY);
  }
  return new DefaultAzureCredential();
}

export function getSearchClient(): SearchClient<PolicyDocument> {
  return new SearchClient<PolicyDocument>(
    config.search.endpoint,
    config.search.indexName,
    getCredential() as AzureKeyCredential,
  );
}

export function getIndexClient(): SearchIndexClient {
  return new SearchIndexClient(
    config.search.endpoint,
    getCredential() as AzureKeyCredential,
  );
}

export interface SearchOptions {
  query: string;
  filter?: string;
  top?: number;
  skip?: number;
  category?: string;
  status?: string;
  orderBy?: string;
  useSemanticRanking?: boolean;
}

export async function searchPolicies(opts: SearchOptions): Promise<{
  results: PolicySearchResult[];
  totalCount: number;
}> {
  const client = getSearchClient();

  const searchOptions: Parameters<typeof client.search>[1] = {
    includeTotalCount: true,
    top: opts.top ?? 20,
    skip: opts.skip ?? 0,
    filter: opts.filter,
    select: [
      'id', 'policyNumber', 'title', 'category', 'subCategory',
      'owner', 'status', 'effectiveDate', 'reviewDate', 'legalReview',
    ] as (keyof PolicyDocument)[],
    highlightFields: 'title,policyText,procedureText,purpose,scope',
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
    orderBy: opts.orderBy ? [opts.orderBy] : undefined,
    scoringProfile: 'policy-scoring',
  };

  if (opts.useSemanticRanking) {
    (searchOptions as Record<string, unknown>).queryType = 'semantic';
    (searchOptions as Record<string, unknown>).semanticSearchOptions = {
      configurationName: 'policy-semantic',
      answers: { answerType: 'extractive', count: 3 },
      captions: { captionType: 'extractive', highlight: true },
    };
  }

  const response = await client.search(opts.query || '*', searchOptions);

  const results: PolicySearchResult[] = [];
  for await (const result of response.results) {
    const doc = result.document;
    results.push({
      id: doc.id,
      policyNumber: doc.policyNumber,
      title: doc.title,
      category: doc.category,
      subCategory: doc.subCategory,
      owner: doc.owner,
      status: doc.status,
      effectiveDate: doc.effectiveDate,
      reviewDate: doc.reviewDate,
      legalReview: doc.legalReview,
      score: result.score ?? 0,
      highlights: result.highlights as PolicySearchResult['highlights'],
    });
  }

  return {
    results,
    totalCount: response.count ?? results.length,
  };
}

export async function getPolicy(policyNumber: string): Promise<PolicyDocument | null> {
  const client = getSearchClient();
  const id = policyNumber.replace(/\./g, '-');
  try {
    return await client.getDocument(id);
  } catch {
    return null;
  }
}

export async function upsertPolicy(doc: PolicyDocument): Promise<void> {
  const client = getSearchClient();
  await client.mergeOrUploadDocuments([doc]);
}

export async function deletePolicy(policyNumber: string): Promise<void> {
  const client = getSearchClient();
  const id = policyNumber.replace(/\./g, '-');
  await client.deleteDocuments([{ id }]);
}

// Vector search for RAG — returns top-k chunks most similar to the query embedding
export async function vectorSearch(
  queryVector: number[],
  filter?: string,
  topK = 5,
): Promise<PolicyDocument[]> {
  const client = getSearchClient();

  const response = await client.search('*', {
    vectorSearchOptions: {
      queries: [{
        kind: 'vector',
        vector: queryVector,
        kNearestNeighborsCount: topK,
        fields: ['contentVector'],
      }],
    },
    filter,
    select: [
      'id', 'policyNumber', 'title', 'category', 'policyText',
      'procedureText', 'purpose', 'scope', 'blobUrl',
    ] as (keyof PolicyDocument)[],
    top: topK,
  });

  const results: PolicyDocument[] = [];
  for await (const result of response.results) {
    results.push(result.document);
  }
  return results;
}
