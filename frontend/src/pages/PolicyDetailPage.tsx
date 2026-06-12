// src/pages/PolicyDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { getPolicy, getDownloadUrl } from '../api/client';
import { STATUS_LABELS, type PolicyDocument } from '../types/policy';

export function PolicyDetailPage() {
  const { policyNumber } = useParams<{ policyNumber: string }>();
  const navigate = useNavigate();
  const { instance } = useMsal();
  const [policy, setPolicy] = useState<PolicyDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!policyNumber) return;
    setLoading(true);
    getPolicy(instance, policyNumber)
      .then(setPolicy)
      .catch(e => setError(e instanceof Error ? e.message : 'Policy not found'))
      .finally(() => setLoading(false));
  }, [policyNumber, instance]);

  async function handleDownload() {
    if (!policyNumber) return;
    setDownloading(true);
    try {
      const { url } = await getDownloadUrl(instance, policyNumber);
      window.open(url, '_blank');
    } catch (e) {
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  if (error || !policy) return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{error || 'Policy not found'}</div>
      <button className="btn-primary" onClick={() => navigate(-1)}>Go back</button>
    </div>
  );

  const isOverdue = policy.reviewDate && new Date(policy.reviewDate) < new Date();

  return (
    <div style={{ maxWidth: 840, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="btn-ghost" onClick={() => navigate(-1)} style={{ padding: '2px 8px', fontSize: 13 }}>← Back</button>
        <span>/</span>
        <span>{policy.category}</span>
        <span>/</span>
        <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{policy.policyNumber}</span>
      </div>

      <div className="card">
        {/* Header */}
        <div style={{ borderBottom: '2px solid var(--teal)', paddingBottom: 18, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{
                  fontFamily: 'monospace', fontWeight: 800, fontSize: 14,
                  color: 'var(--teal)', background: 'var(--teal-light)',
                  padding: '3px 10px', borderRadius: 4,
                }}>
                  {policy.policyNumber}
                </span>
                <span className={`badge badge-${policy.status}`}>
                  {STATUS_LABELS[policy.status]}
                </span>
                {policy.legalReview && (
                  <span className="badge badge-legal">Counsel Review Required</span>
                )}
                {isOverdue && (
                  <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                    Review Overdue
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-800)', lineHeight: 1.3 }}>
                {policy.title}
              </h1>
            </div>
            <button
              className="btn-secondary"
              onClick={handleDownload}
              disabled={downloading}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {downloading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '⬇'}
              Download .docx
            </button>
          </div>

          {/* Metadata */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12, marginTop: 16,
          }}>
            {[
              { label: 'Category', value: policy.category },
              { label: 'Owner', value: policy.owner || '—' },
              { label: 'Effective Date', value: policy.effectiveDate ? new Date(policy.effectiveDate).toLocaleDateString() : '—' },
              { label: 'Review Date', value: policy.reviewDate ? new Date(policy.reviewDate).toLocaleDateString() : '—' },
              ...(policy.chapStandard ? [{ label: 'CHAP Standard', value: policy.chapStandard }] : []),
              ...(policy.corridorRef ? [{ label: 'Corridor Ref', value: policy.corridorRef }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Policy sections */}
        {[
          { label: 'SCOPE', content: policy.scope },
          { label: 'PURPOSE', content: policy.purpose },
          { label: 'POLICY', content: policy.policyText },
          { label: 'PROCEDURE', content: policy.procedureText },
        ].filter(s => s.content).map(section => (
          <div key={section.label} style={{ marginBottom: 28 }}>
            <h2 style={{
              fontSize: 12, fontWeight: 700, color: 'var(--teal)',
              textTransform: 'uppercase', letterSpacing: '.08em',
              marginBottom: 10, paddingBottom: 6,
              borderBottom: '1px solid var(--gray-200)',
            }}>
              {section.label}
            </h2>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--gray-800)', whiteSpace: 'pre-wrap' }}>
              {section.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
