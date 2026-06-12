// src/config.ts
// Central config — all env vars validated at startup

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  storage: {
    connectionString: required('STORAGE_CONNECTION_STRING'),
    accountName: required('STORAGE_ACCOUNT_NAME'),
    containers: {
      published: 'policies-published',
      draft: 'policies-draft',
      archive: 'policies-archive',
    },
  },
  search: {
    endpoint: required('SEARCH_ENDPOINT'),
    indexName: optional('SEARCH_INDEX_NAME', 'policies'),
  },
  openAi: {
    endpoint: required('OPENAI_ENDPOINT'),
    deploymentName: optional('OPENAI_DEPLOYMENT_NAME', 'gpt-4o'),
    embeddingDeployment: optional('OPENAI_EMBEDDING_DEPLOYMENT', 'text-embedding-3-large'),
  },
  auth: {
    tenantId: required('TENANT_ID'),
    appClientId: required('APP_CLIENT_ID'),
    groups: {
      itAdmin: required('IT_ADMIN_GROUP_ID'),
      hr: required('HR_GROUP_ID'),
      compliance: required('COMPLIANCE_GROUP_ID'),
      clinicalLeads: required('CLINICAL_LEADS_GROUP_ID'),
    },
  },
} as const;
