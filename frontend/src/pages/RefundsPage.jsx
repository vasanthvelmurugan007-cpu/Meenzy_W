import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { C, FONT } from '../constants.js';
import { Landmark, RefreshCw, CheckCircle2, XCircle, Calendar, ShieldCheck } from 'lucide-react';

export default function RefundsPage() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRefunds = async () => {
    setLoading(true);
    try {
      const data = await api.meenzy.refunds();
      setRefunds(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch refund log.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, []);

  const handleUpdateStatus = async (id, status) => {
    if (!window.confirm(`Are you sure you want to mark this refund as ${status}?`)) {
      return;
    }
    setUpdatingId(id);
    try {
      await api.meenzy.updateRefundStatus(id, status);
      fetchRefunds();
    } catch (err) {
      alert('Failed to update refund status.');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return { bg: '#FEF3C7', text: '#D97706', label: 'Pending Payout' };
      case 'COMPLETED': return { bg: '#ECFDF5', text: '#059669', label: 'Paid Out ✅' };
      case 'REJECTED': return { bg: '#FEE2E2', text: '#DC2626', label: 'Rejected ❌' };
      default: return { bg: '#F1F5F9', text: '#475569', label: status };
    }
  };

  return (
    <div style={{ padding: '24px 30px', fontFamily: FONT, color: '#1E293B', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Landmark size={24} style={{ color: '#DC2626' }} /> MEENZY Refunds ledger
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
            Approve or reject customer-initiated refund payout logs.
          </p>
        </div>
        <button
          onClick={fetchRefunds}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
            background: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Main Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Refund Requests Ledger</span>
        </div>
        
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading refunds ledger…</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#EF4444', fontSize: 13 }}>{error}</div>
        ) : refunds.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No refund logs registered. Click "Refund 💵" on a out-of-stock customer choice to seed!</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 20px' }}>Customer Phone</th>
                  <th style={{ padding: '12px 20px' }}>Failed Catch Item</th>
                  <th style={{ padding: '12px 20px' }}>Refund Value (INR)</th>
                  <th style={{ padding: '12px 20px' }}>Requested At</th>
                  <th style={{ padding: '12px 20px' }}>Payout Status</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center' }}>Ledger Operations</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((ref) => {
                  const status = getStatusColor(ref.refund_status);
                  const isPending = ref.refund_status === 'PENDING';
                  return (
                    <tr key={ref.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600 }}>+{ref.customer_phone}</td>
                      <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 500 }}>{ref.item_name}</td>
                      <td style={{ padding: '14px 20px', color: '#059669', fontWeight: 700 }}>₹{ref.refund_amount}</td>
                      <td style={{ padding: '14px 20px', color: '#64748B' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={13} /> {new Date(ref.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          background: status.bg,
                          color: status.text
                        }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        {isPending ? (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button
                              disabled={updatingId !== null}
                              onClick={() => handleUpdateStatus(ref.id, 'COMPLETED')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: 'none',
                                background: '#10B981',
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                              onMouseLeave={e => e.currentTarget.style.background = '#10B981'}
                            >
                              <ShieldCheck size={12} /> Approve Payout
                            </button>
                            <button
                              disabled={updatingId !== null}
                              onClick={() => handleUpdateStatus(ref.id, 'REJECTED')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: '1px solid #EF4444',
                                background: '#fff',
                                color: '#EF4444',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                            >
                              <XCircle size={12} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
