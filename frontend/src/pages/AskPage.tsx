// src/pages/AskPage.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { askQuestion } from '../api/client';
import type { AskResponse } from '../types/policy';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  response?: AskResponse;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'What is the process for reporting a medication error?',
  'What are the patient rights at admission?',
  'How do we handle a potential HIPAA breach?',
  'What are the criteria for general inpatient care?',
  'What is the whistleblower protection policy?',
  'How often must care plans be updated?',
];

export function AskPage() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function submit(question: string) {
    if (!question.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: question,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await askQuestion(instance, question);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.answer,
        response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I was unable to process your question. Please try again or contact the Compliance Director.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>
          Ask the Policy Assistant
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
          Ask questions in plain language. Answers are sourced directly from Luminary Hospice policies.
        </p>
      </div>

      {/* Chat history */}
      <div style={{
        background: 'var(--white)', borderRadius: 'var(--radius)',
        border: '1px solid var(--gray-200)', minHeight: 400, maxHeight: 540,
        overflowY: 'auto', padding: 20, marginBottom: 16,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {messages.length === 0 && (
          <div>
            <div style={{ textAlign: 'center', padding: '20px 0 16px', color: 'var(--gray-400)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Ask me anything about Luminary policies</div>
              <div style={{ fontSize: 12 }}>I'll find the relevant policies and cite my sources</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => submit(q)}
                  style={{
                    background: 'var(--teal-light)', color: 'var(--teal-dark)',
                    padding: '10px 14px', borderRadius: 'var(--radius)',
                    textAlign: 'left', fontSize: 13, fontWeight: 400,
                    border: '1px solid rgba(45,106,106,.2)',
                    lineHeight: 1.4,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} onNavigate={navigate} />
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, background: 'var(--teal)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--white)', fontSize: 14, flexShrink: 0,
            }}>L</div>
            <div style={{
              background: 'var(--gray-100)', padding: '12px 16px',
              borderRadius: '0 12px 12px 12px', display: 'flex', gap: 6, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, background: 'var(--teal)',
                  borderRadius: '50%', animation: `bounce .9s ${i * 0.15}s infinite`,
                }} />
              ))}
              <style>{`@keyframes bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask a policy question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit(input)}
          disabled={loading}
          style={{ flex: 1, height: 44, fontSize: 15 }}
        />
        <button
          className="btn-primary"
          onClick={() => submit(input)}
          disabled={loading || !input.trim()}
          style={{ height: 44, padding: '0 20px' }}
        >
          {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Ask →'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8 }}>
        Answers are based solely on published Luminary Hospice policies.
        For specific clinical or employment situations, consult your supervisor or the Compliance Director.
      </p>
    </div>
  );
}

function ChatMessage({ message, onNavigate }: { message: Message; onNavigate: (path: string) => void }) {
  const isUser = message.type === 'user';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? 'var(--gray-200)' : 'var(--teal)',
        color: isUser ? 'var(--gray-600)' : 'var(--white)',
        fontSize: 13, fontWeight: 700,
      }}>
        {isUser ? '👤' : 'L'}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '80%' }}>
        <div style={{
          background: isUser ? 'var(--teal)' : 'var(--gray-100)',
          color: isUser ? 'var(--white)' : 'var(--gray-800)',
          padding: '12px 16px', fontSize: 14, lineHeight: 1.6,
          borderRadius: isUser ? '12px 0 12px 12px' : '0 12px 12px 12px',
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>

        {/* Citations */}
        {message.response?.citations && message.response.citations.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Sources cited
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {message.response.citations.map(c => (
                <div
                  key={c.policyNumber}
                  onClick={() => onNavigate(`/policy/${c.policyNumber}`)}
                  style={{
                    background: 'var(--white)', border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius)', padding: '10px 14px',
                    cursor: 'pointer', transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--gray-200)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                      color: 'var(--teal)', background: 'var(--teal-light)',
                      padding: '1px 5px', borderRadius: 3,
                    }}>{c.policyNumber}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</span>
                  </div>
                  {c.relevantExcerpt && (
                    <p style={{ fontSize: 12, color: 'var(--gray-600)', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{c.relevantExcerpt.slice(0, 150)}{c.relevantExcerpt.length > 150 ? '...' : ''}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follow-up suggestions */}
        {message.response?.followUpSuggestions && message.response.followUpSuggestions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Related questions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {message.response.followUpSuggestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(`/ask?q=${encodeURIComponent(q)}`)}
                  style={{
                    background: 'transparent', color: 'var(--teal)',
                    border: '1px solid var(--teal)', padding: '4px 10px',
                    borderRadius: 9999, fontSize: 12,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        {message.response?.disclaimer && (
          <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8, fontStyle: 'italic' }}>
            {message.response.disclaimer}
          </p>
        )}
      </div>
    </div>
  );
}
