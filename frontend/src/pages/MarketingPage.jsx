import React, { useState } from 'react';
import { api } from '../api';
import { Megaphone, Image as ImageIcon, Send, Calendar, Clock } from 'lucide-react';
import { C, FONT } from '../constants';

export default function MarketingPage() {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!file) {
      alert('Please select an image first.');
      return;
    }

    try {
      setBroadcasting(true);
      setStatus('Uploading image to Meta and queuing messages...');
      
      const formData = new FormData();
      formData.append('media', file);
      formData.append('caption', caption);

      const res = await fetch('/api/admin/marketing/broadcast', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Broadcast failed');
      
      setStatus(`✅ Success! Broadcast queued for ${data.queuedCount} customers.`);
      setFile(null);
      setCaption('');
    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleWeekendReminders = async () => {
    if (!confirm('This will send a WhatsApp template to all past weekend buyers. Continue?')) return;
    setStatus('Triggering weekend reminders...');
    try {
      const res = await fetch('/api/admin/marketing/weekend-reminders', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trigger failed');
      setStatus(`✅ Success! Weekend reminders queued for ${data.queuedCount} customers.`);
    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 30, maxWidth: 800, margin: '0 auto', fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
        <Megaphone size={28} color="#8b5cf6" />
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0 }}>Marketing & Broadcasts</h1>
      </div>

      {status && (
        <div style={{ padding: 16, background: status.includes('Error') ? '#fef2f2' : '#ecfdf5', color: status.includes('Error') ? '#991b1b' : '#065f46', borderRadius: 8, marginBottom: 24, fontWeight: 600, border: `1px solid ${status.includes('Error') ? '#fca5a5' : '#6ee7b7'}` }}>
          {status}
        </div>
      )}

      {/* Phase 2: Morning Catch Broadcast */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Clock size={20} color="#f59e0b" />
          <h2 style={{ fontSize: 18, margin: 0, color: '#1f2937' }}>Morning "Fresh Catch" Broadcast</h2>
        </div>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
          Upload a photo of today's fresh seafood from Kasimedu harbor. This will be instantly sent via WhatsApp to <strong>all past customers</strong> to drive immediate morning sales.
        </p>

        <form onSubmit={handleBroadcast}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>1. Select Photo</label>
            <div style={{ border: '2px dashed #d1d5db', borderRadius: 8, padding: 24, textAlign: 'center', background: '#f9fafb', cursor: 'pointer' }} onClick={() => document.getElementById('file-upload').click()}>
              {file ? (
                <div style={{ fontWeight: 600, color: '#10b981' }}>📸 {file.name} (Selected)</div>
              ) : (
                <div style={{ color: '#6b7280' }}>
                  <ImageIcon size={24} style={{ marginBottom: 8 }} /><br/>
                  Click to browse image
                </div>
              )}
              <input id="file-upload" type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>2. Broadcast Caption</label>
            <textarea 
              value={caption} 
              onChange={e => setCaption(e.target.value)} 
              placeholder="e.g. Fresh Seer Fish just arrived! Reply 'Buy 1kg' to place your order instantly."
              style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #d1d5db', minHeight: 100, fontSize: 14, fontFamily: FONT, outline: 'none', boxSizing: 'border-box' }}
              required
            />
          </div>

          <button type="submit" disabled={broadcasting} style={{ padding: '12px 24px', background: broadcasting ? '#9ca3af' : '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: broadcasting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {broadcasting ? 'Broadcasting...' : <><Send size={18} /> Blast to All Customers</>}
          </button>
        </form>
      </div>

      {/* Phase 5: Weekend Reminders */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Calendar size={20} color="#10b981" />
          <h2 style={{ fontSize: 18, margin: 0, color: '#1f2937' }}>Sunday Subscription Reminders</h2>
        </div>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
          Manually trigger the weekend subscription reminder sequence. This finds all customers who ordered in previous weekends and sends them a template asking if they want their usual Sunday order.
        </p>
        <button onClick={handleWeekendReminders} style={{ padding: '10px 20px', background: '#fff', color: '#10b981', border: '1px solid #10b981', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          Test Weekend Reminders Now
        </button>
      </div>
    </div>
  );
}
