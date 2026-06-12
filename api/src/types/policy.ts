// src/types/policy.ts
// Shared type definitions across indexer and API

export type PolicyStatus = 'published' | 'draft' | 'in-review' | 'archived';

export type PolicyCategory =
  | '1.xx Administration'
  | '2.xx Human Resources'
  | '3.1 Clinical Operations'
  | '3.2 Patient Care & Rights'
  | '3.3 Safety & Infection Control'
  | '3.4 Privacy & Health Information'
  | '3.5 Quality & Compliance'
  | '3.6 Financial & Billing'
  | '4.xx Volunteer';

export type UserRole = 'staff' | 'clinical-lead' | 'hr' | 'compliance' | 'it-admin';

// The document stored in Azure AI Search
export interface PolicyDocument {
  id: string;                   // Unique — derived from policyNumber
  policyNumber: string;         // e.g. "3.2.01"
  title: string;
  category: string;
  subCategory: string;
  owner: string;
  status: PolicyStatus;
  effectiveDate: string | null; // ISO date
  reviewDate: string | null;    // ISO date
  legalReview: boolean;
  corridorRef: string;          // Original Corridor policy number
  chapStandard: string;
  scope: string;
  purpose: string;
  policyText: string;
  procedureText: string;
  fullText: string;             // All sections concatenated for search
  blobUrl: string;              // SAS URL to original docx
  blobPath: string;             // Container/blob path
  contentVector: number[];      // 3072-dim embedding from text-embedding-3-large
}

// What the search API returns to the frontend
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

// What the ask/RAG endpoint returns
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

// Upload metadata sent with a document upload
export interface UploadMetadata {
  policyNumber: string;
  title: string;
  category: PolicyCategory;
  subCategory?: string;
  owner: string;
  status: PolicyStatus;
  effectiveDate?: string;
  reviewDate?: string;
  legalReview: boolean;
  corridorRef?: string;
  chapStandard?: string;
}

// Parsed sections from a docx
export interface ParsedPolicy {
  scope: string;
  purpose: string;
  definitions: string;
  policyText: string;
  procedureText: string;
  references: string;
  stateAddendum: string;
  fullText: string;
}

// JWT claims we care about
export interface UserClaims {
  oid: string;       // Object ID
  name: string;
  email: string;
  groups: string[];  // Group object IDs
  role: UserRole;
}
