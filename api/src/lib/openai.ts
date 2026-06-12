// src/lib/openai.ts
// Azure OpenAI client — embeddings for indexing + RAG chat completions

import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { config } from '../config.js';
import type { PolicyDocument, AskResponse, Citation } from '../types/policy.js';

function getClient(): AzureOpenAI {
  // Use managed identity (no key required)
  const credential = new DefaultAzureCredential();
  const scope = 'https://cognitiveservices.azure.com/.default';
  const azureADTokenProvider = getBearerTokenProvider(credential, scope);

  return new AzureOpenAI({
    azureADTokenProvider,
    endpoint: config.openAi.endpoint,
    apiVersion: '2024-10-01-preview',
  });
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  // Truncate to ~8000 tokens to stay within model limits
  const truncated = text.slice(0, 32000);
  const response = await client.embeddings.create({
    model: config.openAi.embeddingDeployment,
    input: truncated,
  });
  return response.data[0].embedding;
}

const SYSTEM_PROMPT = `You are the Luminary Hospice Policy Assistant — a trusted resource for employees to understand organizational policies.

RULES YOU MUST FOLLOW:
1. Answer ONLY from the policy documents provided in the context below. Do not use general knowledge.
2. Always cite the specific policy number (e.g., "3.2.01") and exact policy title for every claim you make.
3. If the answer cannot be found in the provided policies, say exactly: "I was unable to find a policy that addresses this question. Please contact the Compliance Director or your supervisor."
4. Do NOT provide advice about specific clinical situations, individual employment decisions, or legal interpretations.
5. If a question involves legal rights, medical decisions, or disciplinary actions, direct the employee to HR, the Compliance Director, or their supervisor.
6. Keep your answer clear and direct. Use plain language — not legal or clinical jargon where avoidable.
7. Do not speculate, extrapolate, or infer beyond what the policies explicitly state.`;

export async function generateAnswer(
  question: string,
  relevantPolicies: PolicyDocument[],
): Promise<AskResponse> {
  if (relevantPolicies.length === 0) {
    return {
      answer: 'I was unable to find a policy that addresses this question. Please contact the Compliance Director or your supervisor.',
      citations: [],
      followUpSuggestions: [],
      disclaimer: 'This answer is based solely on published Luminary Hospice policies. For specific situations, consult your supervisor or the Compliance Director.',
    };
  }

  const client = getClient();

  // Build context from retrieved policies
  const contextBlocks = relevantPolicies.map(p =>
    `--- POLICY ${p.policyNumber}: ${p.title} ---\n` +
    `Category: ${p.category}\n` +
    (p.purpose ? `Purpose: ${p.purpose}\n` : '') +
    (p.policyText ? `Policy: ${p.policyText}\n` : '') +
    (p.procedureText ? `Procedure: ${p.procedureText}\n` : ''),
  ).join('\n\n');

  const userMessage = `CONTEXT POLICIES:\n${contextBlocks}\n\nEMPLOYEE QUESTION: ${question}`;

  const response = await client.chat.completions.create({
    model: config.openAi.deploymentName,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,   // Low temperature for factual, consistent answers
    max_tokens: 1000,
  });

  const answer = response.choices[0]?.message?.content ?? 'Unable to generate an answer.';

  // Build citations from the policies we used
  const citations: Citation[] = relevantPolicies.slice(0, 3).map(p => ({
    policyNumber: p.policyNumber,
    title: p.title,
    category: p.category,
    relevantExcerpt: p.policyText?.slice(0, 300) ?? p.purpose?.slice(0, 300) ?? '',
    blobUrl: p.blobUrl,
  }));

  // Generate follow-up suggestions
  const followUpResponse = await client.chat.completions.create({
    model: config.openAi.deploymentName,
    messages: [
      {
        role: 'system',
        content: 'Generate 2-3 brief follow-up questions an employee might ask after reading the answer provided. Return as a JSON array of strings. No other text.',
      },
      {
        role: 'user',
        content: `Original question: ${question}\nAnswer given: ${answer}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  let followUpSuggestions: string[] = [];
  try {
    const raw = followUpResponse.choices[0]?.message?.content ?? '[]';
    followUpSuggestions = JSON.parse(raw) as string[];
  } catch {
    followUpSuggestions = [];
  }

  return {
    answer,
    citations,
    followUpSuggestions,
    disclaimer: 'This answer is based solely on published Luminary Hospice policies. For specific situations, consult your supervisor or the Compliance Director.',
  };
}
