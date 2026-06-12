// src/functions/ask.ts
// POST /api/ask
// Body: { question: string }
// Returns an AI-generated answer grounded in published policies with citations.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { extractUserClaims, buildStatusFilter } from '../lib/auth.js';
import { vectorSearch } from '../lib/search.js';
import { generateEmbedding, generateAnswer } from '../lib/openai.js';

const AskBodySchema = z.object({
  question: z.string().min(1).max(2000),
});

app.http('ask', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method === 'OPTIONS') {
      return corsResponse(204, null);
    }

    const claims = extractUserClaims(req);
    if (!claims) {
      return corsResponse(401, { error: 'Unauthorized' });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return corsResponse(400, { error: 'Invalid JSON body' });
    }

    const parsed = AskBodySchema.safeParse(body);
    if (!parsed.success) {
      return corsResponse(400, { error: 'question is required' });
    }

    const { question } = parsed.data;

    try {
      // 1. Embed the question
      const queryVector = await generateEmbedding(question);

      // 2. Vector search — filter by what this role can see
      const statusFilter = buildStatusFilter(claims.role);
      const relevantPolicies = await vectorSearch(queryVector, statusFilter, 5);

      // 3. Generate answer with citations
      const answer = await generateAnswer(question, relevantPolicies);

      ctx.log(`Ask: user=${claims.email} role=${claims.role} q="${question.slice(0, 80)}..." citations=${answer.citations.length}`);

      return corsResponse(200, answer);
    } catch (err) {
      ctx.error('Ask error:', err);
      return corsResponse(500, { error: 'Unable to generate an answer. Please try again.' });
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
