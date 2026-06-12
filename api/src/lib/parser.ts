// src/lib/parser.ts
// Extracts structured sections from Luminary policy docx files.
// Policies follow the fixed template:
//   SCOPE → PURPOSE → DEFINITIONS → POLICY → PROCEDURE → REFERENCES → STATE ADDENDUM

import mammoth from 'mammoth';
import type { ParsedPolicy } from '../types/policy.js';

const SECTION_HEADERS = [
  'SCOPE',
  'PURPOSE',
  'DEFINITIONS',
  'POLICY',
  'PROCEDURE',
  'REFERENCES',
  'STATE ADDENDUM',
  'STATE ADDENDUM — TENNESSEE',
] as const;

type SectionKey = 'scope' | 'purpose' | 'definitions' | 'policyText' | 'procedureText' | 'references' | 'stateAddendum';

const HEADER_TO_KEY: Record<string, SectionKey> = {
  SCOPE: 'scope',
  PURPOSE: 'purpose',
  DEFINITIONS: 'definitions',
  POLICY: 'policyText',
  PROCEDURE: 'procedureText',
  REFERENCES: 'references',
  'STATE ADDENDUM': 'stateAddendum',
  'STATE ADDENDUM — TENNESSEE': 'stateAddendum',
};

function normalizeHeader(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, ' ');
}

function isSectionHeader(text: string): string | null {
  const normalized = normalizeHeader(text);
  for (const header of SECTION_HEADERS) {
    if (normalized === header || normalized.startsWith(header)) {
      return header;
    }
  }
  return null;
}

export async function parseDocxBuffer(buffer: Buffer): Promise<ParsedPolicy> {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value;

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const sections: Partial<Record<SectionKey, string[]>> = {};
  let currentSection: SectionKey | null = null;

  for (const line of lines) {
    const matchedHeader = isSectionHeader(line);
    if (matchedHeader) {
      currentSection = HEADER_TO_KEY[matchedHeader];
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }

    // Skip metadata table lines (Category, Effective Date, etc.)
    if (line.match(/^(Category|Effective Date|Review Date|Owner|Legal Review|Source)\s*[:—]/i)) {
      continue;
    }

    if (currentSection) {
      sections[currentSection] = sections[currentSection] ?? [];
      sections[currentSection]!.push(line);
    }
  }

  const join = (key: SectionKey) => (sections[key] ?? []).join(' ').replace(/\s+/g, ' ').trim();

  const scope = join('scope');
  const purpose = join('purpose');
  const definitions = join('definitions');
  const policyText = join('policyText');
  const procedureText = join('procedureText');
  const references = join('references');
  const stateAddendum = join('stateAddendum');

  const fullText = [scope, purpose, definitions, policyText, procedureText]
    .filter(Boolean)
    .join(' ');

  return {
    scope,
    purpose,
    definitions,
    policyText,
    procedureText,
    references,
    stateAddendum,
    fullText,
  };
}

// Extract the policy number and title from the filename or document heading.
// Expected filename pattern: e.g. "3.2.01_Patient_Rights.docx"
export function extractMetaFromFilename(filename: string): { policyNumber: string; title: string } {
  const base = filename.replace(/\.docx$/i, '');
  const parts = base.split('_');

  // First part should be the policy number (e.g. "3.2.01")
  const policyNumber = parts[0] ?? '';
  const title = parts.slice(1).join(' ').replace(/-/g, ' ').trim();

  return { policyNumber, title };
}
