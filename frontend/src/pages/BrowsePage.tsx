// src/pages/BrowsePage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { searchPolicies } from '../api/client';
import { CATEGORIES, STATUS_LABELS, type PolicySearchResult } from '../types/policy';
import { useUserRole } from '../hooks/useUserRole';

const CATEGORY_ICONS: Record<string, string> = {
  '1.xx Administration':          '🏢',
  '2.xx Human Resources':         '👥',
  '3.1 Clinical Operations':      '🩺',
  '3.2 Patient Care & Rights':    '🤝',
  '3.3 Safety & Infection Control':'🛡️',
  '3.4 Privacy & Health Information':'🔒',
  '3.5 Quality & Compliance':     '✅',
  '3.6 Financial & Billing':      '💰',
  '4.xx Volunteer':               '🌟',
};

export function BrowsePage() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const role = useUserRole();
  const [selected, setSelected] = useState<string>(CATEGORIES[0]);
  const [policies, setPolicies] = useState<PolicySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Load count for each category on mount
  useEffect(() => {
    async function loadCounts() {
      const results = await Promise.allSettled(
        CATEGORIES.map(cat =>
          searchPolicies(instance, { category: cat, top: 1 })
            .then(r => ({ cat, count: r.totalCount }))
        )
      );
      const c: Record<string, number> = {};
      results.forEach(r => {
        if (r.status === 'fulfilled') c[r.value.cat] = r.value.count;
      });
      setCounts(c);
    }
    loadCounts();
  }, [instance]);

  // Load policies when category changes
  useEffect(() => {
    setLoading(true);
    searchPolicies(instance, { category: selected, top: 100, orderBy: 'policyNumber asc' })
      .then(r => setPolicies(r.results))
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false));
  }, [selected, instance]);

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Sidebar — category list */}
      <div className="card" style={{ width: 260, flexShrink: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{
          background: 'var(--teal)', color: 'var(--white)',
          padding: '14px 18px', fontWeight: 700, fontSize: 14,
        }}>
          Policy Categories
        </div>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelected(cat)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '12px 18px', textAlign: 'left',
              background: selected === cat ? 'var(--teal-light)' : 'transparent',
              borderBottom: '1px solid var(--gray-100)',
              borderLeft: selected === cat ? '3px solid var(--teal)' : '3px solid transparent',
              color: selected === cat ? 'var(--teal-dark)' : 'var(--gray-800)',
              fontWeight: selected === cat ? 600 : 400,
              borderRadius: 0,
              gap: 8,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span>{CATEGORY_ICONS[cat] ?? '📄'}</span>
              <span>{cat}</span>
            </span>
            {counts[cat] !== undefined && (
              <span style={{
                background: selected === cat ? 'var(--teal)' : 'var(--gray-200)',
                color: selected === cat ? 'var(--white)' : 'var(--gray-600)',
                borderRadius: 9999, padding: '1px 7px', fontSize: 11, fontWeight: 700,
              }}>
                {counts[cat]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>
            {CATEGORY_ICONS[selected]} {selected}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
            {counts[selected] ?? '...'} policies in this category
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <span className="spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {policies.map(p => (
              <div
                key={p.id}
                className="card"
                onClick={() => navigate(`/policy/${p.policyNumber}`)}
                style={{ cursor: 'pointer', padding: '14px 18px' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                      color: 'var(--teal)', background: 'var(--teal-light)',
                      padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
                    }}>
                      {p.policyNumber}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{p.title}</span>
                    {p.legalReview && <span className="badge badge-legal">Legal Review</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>{p.owner}</span>
                    <span className={`badge badge-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
