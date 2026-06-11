import React, { useState } from 'react';
import { Bot, Save, AlertTriangle } from 'lucide-react';
import { C, FONT } from '../constants';

export default function AiAgentBuilderPage() {
  const [prompt, setPrompt] = useState(
    `You are an AI order intake agent for Meenzy Fresh Seafood.\n` +
    `Extract the seafood items and quantities from the user's message.\n` +
    `Map the items to standard names (e.g., "vanjaram" -> "Seer Fish", "prawn" -> "White Prawns").\n` +
    `Return the result strictly as a JSON array of objects, with keys "item" (string) and "qty" (number in kg).\n` +
    `For example: [{"item": "Seer Fish", "qty": 2.5}]\n` +
    `If no order is found or it's too vague, return an empty array [].\n` +
    `Output ONLY valid JSON. No markdown formatting.`
  );

  return (
    <div style={{ padding: 30, maxWidth: 800, margin: '0 auto', fontFamily: FONT }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Bot size={28} color={C.primary} />
        LLM Chatbot Upgrade (Order Intake)
      </h1>
      <p style={{ color: C.textSecondary, marginBottom: 24 }}>
        Configure the Gemini 1.5 Flash Master System Prompt used to parse natural language orders from customers and insert them directly into the preorders system.
      </p>

      <div style={{ background: C.cardBg, padding: 24, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0 }}>System Prompt Configuration</h2>
        </div>
        
        <textarea 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ width: '100%', padding: 16, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'monospace', minHeight: 250, backgroundColor: '#f9fafb', color: '#374151', lineHeight: 1.5 }}
        />

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: 13 }}>
            <AlertTriangle size={16} /> 
            Changes here are simulated in this view. To persist, update LLM_INTAKE_PROMPT in your .env file.
          </div>
          <button style={{ padding: '10px 20px', background: C.primary, color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Save size={16} /> Save Prompt
          </button>
        </div>
      </div>
    </div>
  );
}
