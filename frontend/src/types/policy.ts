// src/types/policy.ts — frontend copy of shared types

export type PolicyStatus = 'published' | 'draft' | 'in-review' | 'archived';

export type UserRole = 'staff' | 'clinical-lead' | 'hr' | 'compliance' | 'it-admin';

export interface PolicySearchResult {
  id: string;
  policyNumber: string;
  title: string;
  category: string;
  subCategory: string;
  owner: string;
  status: PolicyStatus;
  effectiveDate: string | null;
  reviewDate: string | null;
  legalReview: boolean;
  score: number;
  highlights?: {
    title?: string[];
    policyText?: string[];
    procedureText?: string[];
    purpose?: string[];
    scope?: string[];
  };
}

export interface PolicyDocument {
  id: string;
  policyNumber: string;
  title: string;
  category: string;
  subCategory: string;
  owner: string;
  status: PolicyStatus;
  effectiveDate: string | null;
  reviewDate: string | null;
  legalReview: boolean;
  corridorRef: string;
  chapStandard: string;
  scope: string;
  purpose: string;
  policyText: string;
  procedureText: string;
  fullText: string;
  blobUrl: string;
  blobPath: string;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  followUpSuggestions: string[];
  disclaimer: string;
}

export interface Citation {
  policyNumber: string;
  title: string;
  category: string;
  relevantExcerpt: string;
  blobUrl: string;
}

export const CATEGORIES = [
  '1.xx Administration',
  '2.xx Human Resources',
  '3.1 Clinical Operations',
  '3.2 Patient Care & Rights',
  '3.3 Safety & Infection Control',
  '3.4 Privacy & Health Information',
  '3.5 Quality & Compliance',
  '3.6 Financial & Billing',
  '4.xx Volunteer',
] as const;

export const STATUS_LABELS: Record<PolicyStatus, string> = {
  published: 'Published',
  draft: 'Draft',
  'in-review': 'In Review',
  archived: 'Archived',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  staff: 'Staff',
  'clinical-lead': 'Clinical Lead',
  hr: 'Human Resources',
  compliance: 'Compliance',
  'it-admin': 'IT Admin',
};
