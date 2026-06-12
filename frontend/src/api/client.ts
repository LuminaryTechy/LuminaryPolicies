// src/api/client.ts
// All API calls to the Azure Functions backend.
// Automatically attaches the MSAL access token to every request.

import { PublicClientApplication } from '@azure/msal-browser';
import { apiScopes } from '../auth/msalConfig';
import type { PolicySearchResult, PolicyDocument, AskResponse } from '../types/policy';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string ?? '/api';

async function getToken(msalInstance: PublicClientApplication): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) throw new Error('No authenticated account');

  const result = await msalInstance.acquireTokenSilent({
    scopes: apiScopes,
    account: accounts[0],
  });
  return result.accessToken;
}

async function apiFetch<T>(
  msalInstance: PublicClientApplication,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken(msalInstance);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error: string }).error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

// ── Search ────────────────────────────────────────────────────
export interface SearchParams {
  q?: string;
  category?: string;
  status?: string;
  orderBy?: string;
  top?: number;
  skip?: number;
  semantic?: boolean;
}

export interface SearchResponse {
  results: PolicySearchResult[];
  totalCount: number;
  skip: number;
  top: number;
}

export async function searchPolicies(
  msalInstance: PublicClientApplication,
  params: SearchParams,
): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.status) qs.set('status', params.status);
  if (params.orderBy) qs.set('orderBy', params.orderBy);
  if (params.top) qs.set('top', String(params.top));
  if (params.skip) qs.set('skip', String(params.skip));
  if (params.semantic) qs.set('semantic', 'true');
  return apiFetch(msalInstance, `/search?${qs.toString()}`);
}

// ── Ask ───────────────────────────────────────────────────────
export async function askQuestion(
  msalInstance: PublicClientApplication,
  question: string,
): Promise<AskResponse> {
  return apiFetch(msalInstance, '/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

// ── Policy detail ─────────────────────────────────────────────
export async function getPolicy(
  msalInstance: PublicClientApplication,
  policyNumber: string,
): Promise<PolicyDocument> {
  return apiFetch(msalInstance, `/policy/${encodeURIComponent(policyNumber)}`);
}

export async function getDownloadUrl(
  msalInstance: PublicClientApplication,
  policyNumber: string,
): Promise<{ url: string; expiresIn: number }> {
  return apiFetch(msalInstance, `/policy/${encodeURIComponent(policyNumber)}/download`);
}

// ── Upload ────────────────────────────────────────────────────
export interface UploadMetadata {
  policyNumber: string;
  title: string;
  category: string;
  subCategory?: string;
  owner: string;
  status: 'published' | 'draft' | 'in-review' | 'archived';
  effectiveDate?: string;
  reviewDate?: string;
  legalReview: boolean;
  corridorRef?: string;
  chapStandard?: string;
}

export async function uploadPolicy(
  msalInstance: PublicClientApplication,
  file: File,
  metadata: UploadMetadata,
): Promise<{ policyNumber: string; title: string; status: string }> {
  const token = await getToken(msalInstance);

  const form = new FormData();
  form.append('file', file);
  form.append('metadata', JSON.stringify(metadata));

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error: string }).error ?? 'Upload failed');
  }

  return response.json();
}
