import { useState } from 'react';
import { Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';
import { C, FONT } from '../constants.js';

export default function LoginGate({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required.'); return; }
    setError('');
    setLoading(true);
    try {
      const { user } = await api.auth.login(email, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      fontFamily: FONT,
      backgroundImage: 'url("/seafood_bg.png")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
    }}>
      {/* Dark overlay to make the card pop */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(2px)',
        zIndex: 0,
      }} />

      <div className="spring-pop" style={{
        width: '100%',
        maxWidth: 440,
        background: C.cardBg,
        borderRadius: 24,
        padding: '48px',
        boxShadow: C.shadowLg,
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32, justifyContent: 'center' }}>
          <img
            src="/forgemind-logo.gif"
            alt="Meenzy Logo"
            style={{ height: 48, width: 48, objectFit: 'contain' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: C.text,
            }}>
              Meenzy <span style={{ color: C.primary }}>Fresh</span>
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.textSecondary,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginTop: 4,
            }}>
              Admin Portal
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, justifyContent: 'center' }}>
          <Lock size={14} color={C.primary} />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.primary,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Secure Login
          </span>
        </div>
        
        <h2 style={{
          fontSize: 24,
          fontWeight: 700,
          color: C.text,
          marginBottom: 32,
          letterSpacing: '-0.02em',
          textAlign: 'center'
        }}>
          Welcome back
        </h2>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: 18 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.textSecondary,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Email
            </div>
            <input
              type="email"
              placeholder="admin@meenzy.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 12,
                border: `1.5px solid ${C.border}`,
                fontSize: 14,
                fontFamily: FONT,
                outline: 'none',
                background: C.surfaceAlt,
                color: C.text,
                transition: 'border .15s',
              }}
              onFocus={e => { e.target.style.borderColor = C.primary; e.target.style.background = C.surface; }}
              onBlur={e => { e.target.style.borderColor = C.border; e.target.style.background = C.surfaceAlt; }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 28 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.textSecondary,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Password
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 16px',
                  borderRadius: 12,
                  border: `1.5px solid ${C.border}`,
                  fontSize: 14,
                  fontFamily: FONT,
                  outline: 'none',
                  background: C.surfaceAlt,
                  color: C.text,
                  transition: 'border .15s',
                }}
                onFocus={e => { e.target.style.borderColor = C.primary; e.target.style.background = C.surface; }}
                onBlur={e => { e.target.style.borderColor = C.border; e.target.style.background = C.surfaceAlt; }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error && (
            <div style={{
              background: C.primaryLight,
              color: '#A32D2D',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 13,
              marginBottom: 20,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            className="hover-lift"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 999, // Pill shape
              border: 'none',
              background: C.primary,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: FONT,
              transition: 'opacity .15s, background .15s, transform .2s',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.primaryHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.primary; }}
          >
            <LogIn size={18} />
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        @media (max-width: 500px) {
          .spring-pop { 
            border-radius: 0 !important;
            height: 100% !important;
            max-width: 100% !important;
            padding: 40px 24px !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
}
