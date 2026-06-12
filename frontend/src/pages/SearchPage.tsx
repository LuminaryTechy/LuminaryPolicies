// src/pages/SearchPage.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { searchPolicies } from '../api/client';
import { CATEGORIES, STATUS_LABELS, type PolicySearchResult } from '../types/policy';
import { useUserRole, useCanSeeDrafts } from '../hooks/useUserRole';

const PAGE_SIZE = 20;

export function SearchPage() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const role = useUserRole();
  const canSeeDrafts = useCanSeeDrafts();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('cat') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [skip, setSkip] = useState(0);

  const [results, setResults] = useState<PolicySearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string, cat: string, st: string, sk: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await searchPolicies(instance, {
        q: q || undefined,
        category: cat || undefined,
        status: st || undefined,
        top: PAGE_SIZE,
        skip: sk,
        semantic: q.length > 3,
      });
      setResults(res.results);
      setTotalCount(res.totalCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [instance]);

  // Run search when filters change
  useEffect(() => {
    doSearch(query, category, status, skip);
    setParams({ q: query, cat: category, status, skip: String(skip) }, { replace: true });
  }, [query, category, status, skip]);

  // Initial load
  useEffect(() => {
    inputRef.current?.focus();
    doSearch(params.get('q') ?? '', params.get('cat') ?? '', params.get('status') ?? '', 0);
  }, []);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>
          Policy Search
        </h1>
        <p style={{ color: 'var(--gray-600)', fontSize: 13 }}>
          Search all {totalCount > 0 ? totalCount.toLocaleString() : ''} published Luminary Hospice policies
          {canSeeDrafts ? ' (including drafts in your area)' : ''}.
        </p>
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by keyword, policy number, or topic..."
          value={query}
          onChange={e => { setQuery(e.target.value); setSkip(0); }}
          style={{ flex: 1, height: 40, fontSize: 15 }}
        />
        {query && (
          <button className="btn-ghost" onClick={() => { setQuery(''); setSkip(0); }}>
            Clear
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setSkip(0); }}
          style={{ height: 36 }}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {canSeeDrafts && (
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setSkip(0); }}
            style={{ height: 36 }}
          >
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="in-review">In Review</option>
          </select>
        )}

        {(category || status) && (
          <button className="btn-ghost" onClick={() => { setCategory(''); setStatus(''); setSkip(0); }}>
            Reset filters
          </button>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
          <span className="spinner" />
          <div style={{ marginTop: 12 }}>Searching...</div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', color: 'var(--red)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No policies found</div>
          <div style={{ fontSize: 13 }}>Try different keywords or remove filters</div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 12 }}>
            {totalCount.toLocaleString()} result{totalCount !== 1 ? 's' : ''}
            {query && <> for <strong>"{query}"</strong></>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map(r => (
              <PolicyCard key={r.id} result={r} onClick={() => navigate(`/policy/${r.policyNumber}`)} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24, alignItems: 'center' }}>
              <button
                className="btn-secondary"
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              >← Previous</button>
              <span style={{ color: 'var(--gray-600)', fontSize: 13 }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={skip + PAGE_SIZE >= totalCount}
                onClick={() => setSkip(skip + PAGE_SIZE)}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PolicyCard({ result, onClick }: { result: PolicySearchResult; onClick: () => void }) {
  const isOverdue = result.reviewDate && new Date(result.reviewDate) < new Date();

  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Policy number + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
              color: 'var(--teal)', background: 'var(--teal-light)',
              padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
            }}>
              {result.policyNumber}
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-800)' }}>
              {result.title}
            </h3>
          </div>

          {/* Category + owner */}
          <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 6 }}>
            {result.category} {result.subCategory ? `› ${result.subCategory}` : ''} · Owner: {result.owner || '—'}
          </div>

          {/* Highlights */}
          {result.highlights && (
            <div style={{ fontSize: 13, color: 'var(--gray-600)', fontStyle: 'italic' }}
              dangerouslySetInnerHTML={{
                __html: (
                  result.highlights.policyText?.[0] ??
                  result.highlights.purpose?.[0] ??
                  result.highlights.scope?.[0] ?? ''
                ).slice(0, 200),
              }}
            />
          )}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span className={`badge badge-${result.status}`}>
            {STATUS_LABELS[result.status]}
          </span>
          {result.legalReview && (
            <span className="badge badge-legal">Legal Review</span>
          )}
          {isOverdue && (
            <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
              Review Overdue
            </span>
          )}
          {result.reviewDate && (
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
              Review: {new Date(result.reviewDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
