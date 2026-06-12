// src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../auth/msalConfig';

export function LoginPage() {
  const { instance } = useMsal();
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      await instance.loginPopup(loginRequest);
    } catch {
      try {
        await instance.loginRedirect(loginRequest);
      } catch { /* silently fail */ }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--teal-dark) 0%, var(--teal) 60%, var(--teal-mid) 100%)',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: 12,
        padding: '48px 56px', maxWidth: 400, width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,.2)',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: 64, height: 64, background: 'var(--teal)', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 28, fontWeight: 900, color: 'var(--white)',
        }}>
          L
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginBottom: 4 }}>
          Luminary Hospice
        </h1>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', letterSpacing: '.08em', marginBottom: 32, textTransform: 'uppercase', fontWeight: 600 }}>
          Policy Hub
        </div>

        <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 32 }}>
          Sign in with your Luminary Hospice Microsoft account to access policies and procedures.
        </p>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="btn-primary"
          style={{
            width: '100%', height: 48, fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          {loading ? (
            <span className="spinner" style={{ width: 18, height: 18 }} />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              Sign in with Microsoft
            </>
          )}
        </button>

        <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 24 }}>
          Internal use only · Luminary Hospice employees only
        </p>
      </div>
    </div>
  );
}
