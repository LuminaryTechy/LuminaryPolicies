// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './auth/msalConfig';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { SearchPage } from './pages/SearchPage';
import { BrowsePage } from './pages/BrowsePage';
import { PolicyDetailPage } from './pages/PolicyDetailPage';
import { AskPage } from './pages/AskPage';
import { UploadPage } from './pages/UploadPage';

const msalInstance = new PublicClientApplication(msalConfig);

export default function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthenticatedTemplate>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/search" replace />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/ask" element={<AskPage />} />
              <Route path="/policy/:policyNumber" element={<PolicyDetailPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>
    </MsalProvider>
  );
}
