// src/lib/auth.ts
// Validates the Azure AD access token from the Authorization header
// and resolves the caller's role from group membership claims.
//
// The frontend obtains tokens via MSAL with scope: api://{APP_CLIENT_ID}/Policies.Read
// Groups are included in the token when the app manifest sets "groupMembershipClaims": "SecurityGroup"
// (or via the optional claims configuration for tokens > 200 groups limit).

import { HttpRequest } from '@azure/functions';
import { config } from '../config.js';
import type { UserClaims, UserRole } from '../types/policy.js';

interface JwtPayload {
  oid: string;
  name: string;
  preferred_username?: string;
  email?: string;
  groups?: string[];
  roles?: string[];
  iss: string;
  aud: string;
  exp: number;
}

// Decode a JWT without verification (verification done by Azure Functions EasyAuth
// or by the caller having passed through Azure AD — we do a basic claims check here).
// For production hardening, add proper signature verification with jwks-rsa.
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload) as JwtPayload;
  } catch {
    return null;
  }
}

function resolveRole(groups: string[]): UserRole {
  const g = config.auth.groups;
  if (groups.includes(g.itAdmin)) return 'it-admin';
  if (groups.includes(g.compliance)) return 'compliance';
  if (groups.includes(g.hr)) return 'hr';
  if (groups.includes(g.clinicalLeads)) return 'clinical-lead';
  return 'staff';
}

export function extractUserClaims(req: HttpRequest): UserClaims | null {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = decodeJwt(token);
  if (!payload) return null;

  // Basic validation
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  // Verify audience is our app
  const expectedAud = `api://${config.auth.appClientId}`;
  if (payload.aud !== expectedAud && payload.aud !== config.auth.appClientId) {
    return null;
  }

  const groups = payload.groups ?? [];

  return {
    oid: payload.oid,
    name: payload.name ?? '',
    email: payload.email ?? payload.preferred_username ?? '',
    groups,
    role: resolveRole(groups),
  };
}

// Role capability checks
export function canUpload(role: UserRole): boolean {
  return role === 'it-admin' || role === 'hr' || role === 'compliance';
}

export function canSeeDrafts(role: UserRole, category?: string): boolean {
  if (role === 'it-admin' || role === 'compliance') return true;
  if (role === 'hr' && (!category || category.startsWith('2.'))) return true;
  if (role === 'clinical-lead' && category && category.startsWith('3.')) return true;
  return false;
}

export function canSeeAllDrafts(role: UserRole): boolean {
  return role === 'it-admin' || role === 'compliance';
}

// Build the status filter for search based on user role
export function buildStatusFilter(role: UserRole, categoryFilter?: string): string {
  if (role === 'it-admin' || role === 'compliance') {
    // See everything
    return "status ne 'archived'";
  }
  if (role === 'hr') {
    // Published everywhere + drafts in HR category
    return "(status eq 'published') or (status ne 'published' and status ne 'archived' and category eq '2.xx Human Resources')";
  }
  if (role === 'clinical-lead') {
    // Published everywhere + drafts in clinical categories
    const clinicalCategories = [
      '3.1 Clinical Operations',
      '3.2 Patient Care & Rights',
      '3.3 Safety & Infection Control',
      '3.4 Privacy & Health Information',
      '3.5 Quality & Compliance',
    ];
    const clinicalFilter = clinicalCategories.map(c => `category eq '${c}'`).join(' or ');
    return `(status eq 'published') or (status ne 'published' and status ne 'archived' and (${clinicalFilter}))`;
  }
  // Staff — published only
  return "status eq 'published'";
}
