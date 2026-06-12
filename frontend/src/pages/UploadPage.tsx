// src/pages/UploadPage.tsx
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { uploadPolicy, type UploadMetadata } from '../api/client';
import { CATEGORIES } from '../types/policy';
import { useCanUpload, useUserRole } from '../hooks/useUserRole';

export function UploadPage() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const canUpload = useCanUpload();
  const role = useUserRole();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Available categories depends on role
  const availableCategories = role === 'hr'
    ? CATEGORIES.filter(c => c.startsWith('2.'))
    : role === 'compliance'
      ? CATEGORIES
      : CATEGORIES; // it-admin sees all

  const [meta, setMeta] = useState<Partial<UploadMetadata>>({
    status: 'draft',
    legalReview: false,
    category: availableCategories[0],
  });

  if (!canUpload) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 600 }}>You do not have permission to upload policies.</div>
      </div>
    );
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.docx')) {
      setError('Only .docx files are supported.');
      return;
    }
    setFile(f);
    setError('');

    // Try to infer policy number and title from filename
    const base = f.name.replace(/\.docx$/i, '');
    const parts = base.split('_');
    if (parts.length >= 2) {
      const policyNumber = parts[0].replace(/-/g, '.');
      const title = parts.slice(1).join(' ');
      setMeta(prev => ({ ...prev, policyNumber, title }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    if (!meta.policyNumber || !meta.title || !meta.category || !meta.owner) {
      setError('Policy number, title, category, and owner are required.');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const result = await uploadPolicy(instance, file, meta as UploadMetadata);
      setSuccess(`✅ "${result.title}" (${result.policyNumber}) uploaded successfully as ${result.status}.`);
      setFile(null);
      setMeta({ status: 'draft', legalReview: false, category: availableCategories[0] });
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const field = (label: string, content: React.ReactNode, required = false) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--gray-800)' }}>
        {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      {content}
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>Upload Policy</h1>
        <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
          Upload a rewritten policy document. The file will be indexed automatically.
          {role === 'hr' && ' HR users can upload Human Resources (2.xx) policies only.'}
        </p>
      </div>

      {success && (
        <div style={{ background: '#dcfce7', color: '#15803d', padding: 16, borderRadius: 'var(--radius)', marginBottom: 20 }}>
          {success}
          <button
            style={{ marginLeft: 16, color: 'var(--green)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => navigate(`/policy/${meta.policyNumber ?? ''}`)}
          >
            View policy →
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', color: 'var(--red)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit}>
          {/* File drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${file ? 'var(--teal)' : 'var(--gray-200)'}`,
              borderRadius: 'var(--radius)',
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: file ? 'var(--teal-light)' : 'var(--gray-50)',
              marginBottom: 24,
              transition: 'all .15s',
            }}
          >
            <input ref={fileRef} type="file" accept=".docx" onChange={handleFile} style={{ display: 'none' }} />
            <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '📄' : '⬆'}</div>
            {file ? (
              <div>
                <div style={{ fontWeight: 600, color: 'var(--teal)' }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(0)} KB — click to change
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Click to select a .docx file</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Filename format: 3-2-01_Policy_Title.docx
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            {field('Policy Number', (
              <input
                type="text" placeholder="e.g. 3.2.01"
                value={meta.policyNumber ?? ''}
                onChange={e => setMeta(prev => ({ ...prev, policyNumber: e.target.value }))}
                style={{ width: '100%' }}
              />
            ), true)}

            {field('Status', (
              <select
                value={meta.status}
                onChange={e => setMeta(prev => ({ ...prev, status: e.target.value as UploadMetadata['status'] }))}
                style={{ width: '100%' }}
              >
                <option value="draft">Draft</option>
                <option value="in-review">In Review</option>
                <option value="published">Published</option>
              </select>
            ), true)}
          </div>

          {field('Policy Title', (
            <input
              type="text" placeholder="Full policy title"
              value={meta.title ?? ''}
              onChange={e => setMeta(prev => ({ ...prev, title: e.target.value }))}
              style={{ width: '100%' }}
            />
          ), true)}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            {field('Category', (
              <select
                value={meta.category}
                onChange={e => setMeta(prev => ({ ...prev, category: e.target.value }))}
                style={{ width: '100%' }}
              >
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ), true)}

            {field('Owner', (
              <input
                type="text" placeholder="e.g. Compliance Director"
                value={meta.owner ?? ''}
                onChange={e => setMeta(prev => ({ ...prev, owner: e.target.value }))}
                style={{ width: '100%' }}
              />
            ), true)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            {field('Effective Date', (
              <input
                type="date"
                value={meta.effectiveDate ?? ''}
                onChange={e => setMeta(prev => ({ ...prev, effectiveDate: e.target.value }))}
                style={{ width: '100%' }}
              />
            ))}

            {field('Review Date', (
              <input
                type="date"
                value={meta.reviewDate ?? ''}
                onChange={e => setMeta(prev => ({ ...prev, reviewDate: e.target.value }))}
                style={{ width: '100%' }}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            {field('CHAP Standard(s)', (
              <input
                type="text" placeholder="e.g. HCDT.26.I"
                value={meta.chapStandard ?? ''}
                onChange={e => setMeta(prev => ({ ...prev, chapStandard: e.target.value }))}
                style={{ width: '100%' }}
              />
            ))}

            {field('Corridor Reference', (
              <input
                type="text" placeholder="e.g. Ops 9-005"
                value={meta.corridorRef ?? ''}
                onChange={e => setMeta(prev => ({ ...prev, corridorRef: e.target.value }))}
                style={{ width: '100%' }}
              />
            ))}
          </div>

          {field('', (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={meta.legalReview ?? false}
                onChange={e => setMeta(prev => ({ ...prev, legalReview: e.target.checked }))}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14 }}>This policy requires legal / counsel review before publication</span>
            </label>
          ))}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 18, borderTop: '1px solid var(--gray-200)' }}>
            <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={uploading}>
              {uploading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Uploading...
                </span>
              ) : 'Upload Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
