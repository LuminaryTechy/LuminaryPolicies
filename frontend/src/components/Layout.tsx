// src/components/Layout.tsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useUserRole } from '../hooks/useUserRole';

interface Props { children: React.ReactNode; }

export function Layout({ children }: Props) {
  const { instance, accounts } = useMsal();
  const role = useUserRole();
  const navigate = useNavigate();
  const user = accounts[0];

  const canUpload = role === 'it-admin' || role === 'hr' || role === 'compliance';

  function handleLogout() {
    instance.logoutPopup().catch(() => instance.logoutRedirect());
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <header style={{
        background: 'var(--teal)',
        color: 'var(--white)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: 56,
        gap: 32,
        boxShadow: '0 2px 4px rgba(0,0,0,.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Logo / wordmark */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/search')}
        >
          <div style={{
            width: 32, height: 32, background: 'rgba(255,255,255,.2)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16,
          }}>L</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>Luminary Hospice</div>
            <div style={{ fontSize: 11, opacity: .75, letterSpacing: '.05em' }}>POLICY HUB</div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
          {[
            { to: '/search', label: '🔍 Search' },
            { to: '/browse', label: '📁 Browse' },
            { to: '/ask',    label: '💬 Ask AI' },
            ...(canUpload ? [{ to: '/upload', label: '⬆ Upload' }] : []),
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                color: 'var(--white)',
                padding: '6px 14px',
                borderRadius: 'var(--radius)',
                fontWeight: isActive ? 700 : 400,
                background: isActive ? 'rgba(255,255,255,.2)' : 'transparent',
                fontSize: 14,
                textDecoration: 'none',
                transition: 'background .15s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <div style={{ textAlign: 'right', opacity: .85 }}>
            <div style={{ fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 11, opacity: .8, textTransform: 'capitalize' }}>
              {role?.replace('-', ' ')}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,.15)',
              color: 'var(--white)',
              padding: '5px 12px',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              border: '1px solid rgba(255,255,255,.3)',
            }}
          >Sign out</button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        background: 'var(--white)',
        borderTop: '1px solid var(--gray-200)',
        padding: '12px 24px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--gray-400)',
      }}>
        Luminary Hospice Policy Hub · For internal use only · Questions? Contact the Compliance Director
      </footer>
    </div>
  );
}
