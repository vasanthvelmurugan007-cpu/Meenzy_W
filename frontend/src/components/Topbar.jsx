import { useState, useRef, useEffect } from 'react';
import { LogOut, User, Settings, AlertTriangle, Menu, X } from 'lucide-react';
import { C, FONT } from '../constants.js';
import { api } from '../api.js';

export default function Topbar({ user, onLogout, onNavigate, isMobile, mobileMenuOpen, setMobileMenuOpen }) {
  const [userOpen, setUserOpen] = useState(false);
  const [unhealthyAccounts, setUnhealthyAccounts] = useState([]);
  const ref = useRef(null);



  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Poll account health every 60s so the banner appears within a minute
  // of Meta rejecting a token. Cleared instantly when token is updated.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api.whatsappAccounts.list()
        .then(accs => { if (!cancelled) setUnhealthyAccounts(accs.filter(a => a.healthStatus === 'invalid_token')); })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <>
    {unhealthyAccounts.length > 0 && (
      <div
        onClick={() => onNavigate('admin-settings')}
        style={{
          background: '#A32D2D', color: '#fff', padding: '8px 16px',
          fontSize: 12, fontFamily: FONT, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 500,
        }}
      >
        <AlertTriangle size={14} />
        <span>
          Access token expired for {unhealthyAccounts.map(a => a.displayName).join(', ')} — click to update in Settings → WhatsApp Accounts
        </span>
      </div>
    )}
    <div style={{
      height: 56,
      background: C.headerBg,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 0,
      paddingRight: 20,
      borderBottom: `1px solid ${C.headerBorder}`,
      flexShrink: 0,
      zIndex: 100,
      position: 'relative',
    }}>
      {isMobile && (
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 15px', display: 'flex', alignItems: 'center' }}
        >
          {mobileMenuOpen ? <X size={24} color={C.headerText} /> : <Menu size={24} color={C.headerText} />}
        </button>
      )}
      {/* Logo area — aligns with sidebar */}
      <button
        onClick={() => onNavigate('chats')}
        style={{
          width: isMobile ? 'auto' : 224,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: isMobile ? 0 : 15,
          gap: 8,
          borderRight: isMobile ? 'none' : `1px solid ${C.headerBorder}`,
          height: '100%',
          background: 'transparent',
          border: 'none',
          borderRightWidth: isMobile ? 0 : 1,
          borderRightStyle: 'solid',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <img
          src="/forgemind-logo.gif"
          alt="Meenzy Logo"
          style={{ height: 36, width: 36, objectFit: 'contain', flexShrink: 0 }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
        <div style={{ lineHeight: 1.1 }}>
          <div style={{
            fontSize: 16,
            fontWeight: 900,
            color: C.headerText,
            fontFamily: FONT,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            MEEN
            <span style={{
              background: C.primary,
              color: '#fff',
              padding: '2px 7px',
              borderRadius: 6,
              lineHeight: 1.2,
              display: 'inline-block',
            }}>ZY</span>
          </div>
        </div>
      </button>

      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>


        {/* User avatar */}
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => setUserOpen(p => !p)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #534AB7, #7B72E0)',
              border: userOpen ? '2px solid #fff' : `1.5px solid ${C.headerBorder}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              fontFamily: FONT,
              transition: 'border .15s',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            {(user.displayName || user.username).charAt(0).toUpperCase()}
          </button>

          {userOpen && (
            <div style={{
              position: 'absolute',
              top: 44,
              right: 0,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              boxShadow: C.shadowMd,
              padding: 6,
              minWidth: 180,
              zIndex: 200,
            }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {user.displayName || user.username}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  Owner
                </div>
              </div>
              <button
                onClick={() => { setUserOpen(false); onNavigate('admin-settings'); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.text,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  marginBottom: 4,
                }}
              >
                <Settings size={14} />
                Settings
              </button>
              <button
                onClick={() => { setUserOpen(false); onLogout(); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: C.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
