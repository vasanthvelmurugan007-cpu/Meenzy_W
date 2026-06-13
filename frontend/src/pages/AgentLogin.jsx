import React, { useState } from 'react';
import { api } from '../api';
import { Navigation, ArrowRight } from 'lucide-react';
import { FONT } from '../constants';

export default function AgentLogin({ onLogin, onGoToRegister }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.agentAuth.login(phone, pin);
      onLogin(data.agent, data.token);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your phone number and PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: FONT, background: '#f3f4f6', height: '100vh', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: '40px 30px', borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ background: '#3b82f6', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Navigation size={32} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1f2937' }}>Agent Portal</h1>
          <p style={{ color: '#6b7280', margin: '8px 0 0 0', fontSize: 14 }}>Sign in to manage deliveries</p>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600, color: '#374151' }}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              required
              style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 16, outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600, color: '#374151' }}>6-Digit PIN</label>
            <input
              type="password"
              pattern="[0-9]*"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              required
              style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 16, outline: 'none', letterSpacing: 4 }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#3b82f6', color: '#fff', padding: 14, borderRadius: 8, border: 'none',
              fontSize: 16, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button 
            onClick={onGoToRegister}
            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            New agent? Register here
          </button>
        </div>
      </div>
    </div>
  );
}
