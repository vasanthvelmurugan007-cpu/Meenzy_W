import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { UserPlus, Trash2, Edit, Save, X, Navigation } from 'lucide-react';
import { C, FONT } from '../constants';

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', phone: '', vehicle_info: '' });
  const [bonusModal, setBonusModal] = useState({ isOpen: false, agentId: null, agentName: '', amount: '', reason: '' });

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    try {
      setLoading(true);
      const data = await api.agents.list();
      // Leaderboard sorting: Sort by total_deliveries descending
      const sorted = data.sort((a, b) => (parseInt(b.total_deliveries) || 0) - (parseInt(a.total_deliveries) || 0));
      setAgents(sorted);
    } catch (err) {
      setError('Failed to load agents.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.agents.create(newAgent);
      setIsAdding(false);
      setNewAgent({ name: '', phone: '', vehicle_info: '' });
      fetchAgents();
    } catch (err) {
      alert('Failed to create agent: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to remove this agent?')) return;
    try {
      await api.agents.delete(id);
      fetchAgents();
    } catch (err) {
      alert('Failed to delete agent: ' + err.message);
    }
  }

  async function handleMarkPaid(id, amount) {
    if (!amount || amount <= 0) {
      alert('Wallet balance is zero or negative. Nothing to pay.');
      return;
    }
    if (!confirm(`Mark ₹${amount} as paid to this agent? This will reset their wallet balance.`)) return;
    try {
      const res = await fetch(`/api/admin/agents/${id}/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ amount })
      });
      if (!res.ok) throw new Error(await res.text());
      fetchAgents();
      alert('Payment recorded successfully!');
    } catch (err) {
      alert('Failed to record payment: ' + err.message);
    }
  }

  async function handleGrantBonus(e) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/agents/${bonusModal.agentId}/bonuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ amount: bonusModal.amount, reason: bonusModal.reason })
      });
      if (!res.ok) throw new Error(await res.text());
      setBonusModal({ isOpen: false, agentId: null, agentName: '', amount: '', reason: '' });
      fetchAgents();
      alert('Bonus awarded successfully!');
    } catch (err) {
      alert('Failed to award bonus: ' + err.message);
    }
  }

  const inputStyle = {
    padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', outline: 'none', fontSize: 14, fontFamily: FONT, width: '100%', boxSizing: 'border-box', marginBottom: 12
  };

  return (
    <div style={{ padding: 30, maxWidth: 1000, margin: '0 auto', fontFamily: FONT }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Navigation size={24} color="#3b82f6" /> Delivery Agents
        </h1>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {isAdding ? <X size={16} /> : <UserPlus size={16} />}
          {isAdding ? 'Cancel' : 'Add Agent'}
        </button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 20 }}>{error}</div>}

      {isAdding && (
        <form onSubmit={handleCreate} style={{ background: '#fff', padding: 24, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: 24, border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: 16, margin: '0 0 16px 0', color: '#1f2937' }}>New Agent Details</h2>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 4 }}>Full Name</label>
              <input style={inputStyle} value={newAgent.name} onChange={e => setNewAgent({...newAgent, name: e.target.value})} placeholder="e.g. Rahul Sharma" required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 4 }}>Phone Number</label>
              <input style={inputStyle} value={newAgent.phone} onChange={e => setNewAgent({...newAgent, phone: e.target.value})} placeholder="e.g. 919876543210" required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 4 }}>Vehicle Info</label>
              <input style={inputStyle} value={newAgent.vehicle_info} onChange={e => setNewAgent({...newAgent, vehicle_info: e.target.value})} placeholder="e.g. Honda Activa (KA-01-AB-1234)" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" style={{ padding: '8px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
              Save Agent
            </button>
          </div>
        </form>
      )}

      {bonusModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleGrantBonus} style={{ background: '#fff', padding: 24, borderRadius: 12, width: 400, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Award Bonus to {bonusModal.agentName}</h2>
              <button type="button" onClick={() => setBonusModal({...bonusModal, isOpen: false})} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20}/></button>
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Bonus Amount (₹)</label>
            <input style={inputStyle} type="number" required value={bonusModal.amount} onChange={e => setBonusModal({...bonusModal, amount: e.target.value})} placeholder="e.g. 500" />
            
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Reason (Optional)</label>
            <input style={inputStyle} value={bonusModal.reason} onChange={e => setBonusModal({...bonusModal, reason: e.target.value})} placeholder="e.g. Most deliveries this week" />
            
            <button type="submit" style={{ width: '100%', padding: 12, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
              Grant Bonus
            </button>
          </form>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f9fafb', fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>
              <th style={{ padding: '16px 24px', fontWeight: 600 }}>Rank</th>
              <th style={{ padding: '16px 24px', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '16px 24px', fontWeight: 600 }}>Deliveries</th>
              <th style={{ padding: '16px 24px', fontWeight: 600 }}>Vehicle</th>
              <th style={{ padding: '16px 24px', fontWeight: 600 }}>Wallet</th>
              <th style={{ padding: '16px 24px', fontWeight: 600 }}>Live Location</th>
              <th style={{ padding: '16px 24px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading...</td></tr>
            ) : agents.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No agents found. Click "Add Agent" to create one.</td></tr>
            ) : (
              agents.map((agent, index) => (
                <tr key={agent.id} style={{ borderTop: '1px solid #e5e7eb', background: index === 0 ? '#fdf8e3' : index === 1 ? '#f3f4f6' : index === 2 ? '#fef3c7' : 'transparent' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 800, color: index === 0 ? '#d97706' : index === 1 ? '#6b7280' : index === 2 ? '#92400e' : '#9ca3af' }}>
                    #{index + 1}
                  </td>
                  <td style={{ padding: '16px 24px', fontWeight: 600, color: '#1f2937' }}>
                    {agent.name}
                    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>{agent.phone}</div>
                  </td>
                  <td style={{ padding: '16px 24px', fontWeight: 700, color: '#3b82f6', fontSize: 16 }}>{agent.total_deliveries}</td>
                  <td style={{ padding: '16px 24px', color: '#4b5563' }}>{agent.vehicle_info || '-'}</td>
                  <td style={{ padding: '16px 24px', fontWeight: 700, color: agent.wallet_balance > 0 ? '#10b981' : '#6b7280' }}>
                    ₹{agent.wallet_balance}
                  </td>
                  <td style={{ padding: '16px 24px', color: '#4b5563', fontSize: 13 }}>
                    {agent.last_lat ? (
                      <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%' }}></div> Active
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>Offline</span>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setBonusModal({ isOpen: true, agentId: agent.id, agentName: agent.name, amount: '', reason: '' })} style={{ padding: '6px 12px', background: '#ede9fe', color: '#6d28d9', border: '1px solid #8b5cf6', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      + Bonus
                    </button>
                    {agent.wallet_balance > 0 && (
                      <button onClick={() => handleMarkPaid(agent.id, parseFloat(agent.wallet_balance))} style={{ padding: '6px 12px', background: '#ecfdf5', color: '#059669', border: '1px solid #10b981', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Pay out
                      </button>
                    )}
                    <button onClick={() => handleDelete(agent.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
