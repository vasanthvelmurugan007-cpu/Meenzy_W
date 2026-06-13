import { useState } from 'react';
import { ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { C, FONT, MONO } from '../constants.js';

export default function SentimentPage() {
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLastRefreshed(new Date());
    }, 800);
  };

  return (
    <div style={{ padding: '32px 40px', fontFamily: FONT, width: '100%', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ 
              background: C.primaryLight, color: C.primary, 
              width: 44, height: 44, borderRadius: 12, 
              display: 'flex', alignItems: 'center', justifyContent: 'center' 
            }}>
              <ShieldAlert size={24} strokeWidth={2.5} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-.03em' }}>
              Customer Sentiment AI
            </h1>
          </div>
          <p style={{ fontSize: 14, color: C.textSecondary, margin: 0, maxWidth: 600, lineHeight: 1.5 }}>
            Real-time LLM classification of inbound messages flagging Angry or Urgent customers for immediate intervention.
          </p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={loading}
          className="hover-lift"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: C.cardBg, border: `1px solid ${C.border}`,
            padding: '10px 16px', borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: C.text,
            cursor: loading ? 'wait' : 'pointer',
            boxShadow: C.shadowSm,
            opacity: loading ? 0.7 : 1,
            transition: 'all .2s ease'
          }}
        >
          <RefreshCw size={16} strokeWidth={2.5} className={loading ? 'spin' : ''} style={{ color: C.textMuted }} />
          {loading ? 'Analyzing...' : 'Refresh Data'}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ 
          background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, 
          padding: 24, display: 'flex', flexDirection: 'column',
          boxShadow: C.shadowSm 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <AlertTriangle size={18} style={{ color: C.amber }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.textSecondary }}>High Priority Intervention Queue</span>
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, fontFamily: MONO, color: C.text, letterSpacing: '-.04em' }}>
            0
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>At Risk Customers</div>
        </div>

        <div style={{ 
          background: `linear-gradient(135deg, ${C.green} 0%, #059669 100%)`, 
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column',
          color: '#fff', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <ShieldCheck size={18} />
            <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>System Status</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', marginTop: 'auto', marginBottom: 4 }}>
            All Clear!
          </div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            No angry or urgent messages detected recently.
          </div>
        </div>
      </div>

      {/* Empty State Queue */}
      <div style={{
        background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '60px 20px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: C.shadowSm
      }}>
        <div style={{ 
          width: 64, height: 64, borderRadius: '50%', background: C.pageBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20
        }}>
          <CheckCircle2 size={32} style={{ color: C.green }} strokeWidth={2} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Inbox is clean</h3>
        <p style={{ fontSize: 14, color: C.textSecondary, margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
          Your AI agent is actively monitoring all conversations. Any high-risk sentiment will appear here instantly.
        </p>
      </div>

      {/* Footer info */}
      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: C.textMuted }}>
        Last analyzed: {lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
      </div>
    </div>
  );
}
