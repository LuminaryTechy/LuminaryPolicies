// src/functions/search.ts
// GET /api/search?q=...&category=...&status=...&top=...&skip=...
// Returns paginated policy search results filtered by the caller's role.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { extractUserClaims, buildStatusFilter } from '../lib/auth.js';
import { searchPolicies } from '../lib/search.js';

app.http('search', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',  // Auth handled manually via JWT
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return corsResponse(204, null);
    }

    const claims = extractUserClaims(req);
    if (!claims) {
      return corsResponse(401, { error: 'Unauthorized' });
    }

    const url = new URL(req.url);
    const query = url.searchParams.get('q') ?? '';
    const category = url.searchParams.get('category') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const orderBy = url.searchParams.get('orderBy') ?? undefined;
    const top = Math.min(parseInt(url.searchParams.get('top') ?? '20', 10), 100);
    const skip = parseInt(url.searchParams.get('skip') ?? '0', 10);
    const semantic = url.searchParams.get('semantic') === 'true';

    // Build OData filter respecting the user's role
    const roleFilter = buildStatusFilter(claims.role, category);
    const filters: string[] = [roleFilter];
    if (category) filters.push(`category eq '${category}'`);
    if (status) filters.push(`status eq '${status}'`);
    const filter = filters.join(' and ');

    try {
      const { results, totalCount } = await searchPolicies({
        query,
        filter,
        top,
        skip,
        category,
        orderBy,
        useSemanticRanking: semantic && query.length > 0,
      });

      ctx.log(`Search: user=${claims.email} role=${claims.role} q="${query}" results=${results.length}`);

      return corsResponse(200, {
        results,
        totalCount,
        skip,
        top,
      });
    } catch (err) {
      ctx.error('Search error:', err);
      return corsResponse(500, { error: 'Search failed. Please try again.' });
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
