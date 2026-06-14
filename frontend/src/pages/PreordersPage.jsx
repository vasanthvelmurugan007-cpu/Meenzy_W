import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { C, FONT } from '../constants.js';
import { ShoppingBag, AlertTriangle, RefreshCw, CheckCircle2, Calendar, FileText, Trash2, Megaphone } from 'lucide-react';

export default function PreordersPage() {
  const [preorders, setPreorders] = useState([]);
  const [bulkQuotes, setBulkQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [alertSuccess, setAlertSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('preorders');
  const [quotePrices, setQuotePrices] = useState({});

    const [agents, setAgents] = useState([]);
  const [assigningId, setAssigningId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [preordersData, quotesData, agentsData] = await Promise.all([
        api.meenzy.preorders(),
        api.meenzy.bulkQuotes(),
        api.agents.list()
      ]);
      setPreorders(preordersData);
      setBulkQuotes(quotesData);
      setAgents(agentsData.filter(a => a.is_active));
      setError(null);
    } catch (err) {
      setError('Failed to fetch data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignAgent = async (orderId, agentId) => {
    setAssigningId(orderId);
    try {
      await api.meenzy.assignDriver(orderId, agentId);
      setPreorders(preorders.map(p => p.id === orderId ? { ...p, driver_id: agentId || null } : p));
    } catch (err) {
      alert('Failed to assign driver.');
      console.error(err);
    } finally {
      setAssigningId(null);
    }
  };

  const exportToExcel = () => {
    if (preorders.length === 0) return;
    const headers = ['Order ID', 'Customer Phone', 'Ordered Item', 'Quantity (kg)', 'Delivery Date', 'Order Status', 'Driver'];
    const rows = preorders.map(order => [
      order.id,
      `+${order.customer_phone}`,
      order.ordered_item,
      parseFloat(order.quantity),
      new Date(order.delivery_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      order.order_status,
      agents.find(a => a.id === order.driver_id)?.name || 'Unassigned'
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(val => {
          const stringVal = val === null || val === undefined ? '' : String(val);
          if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
            return `"${stringVal.replace(/"/g, '""')}"`;
          }
          return stringVal;
        }).join(',')
      )
    ].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Meenzy_Preorders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendBroadcast = async () => {
    if (!window.confirm('Are you sure you want to trigger the Catalog Broadcast now? This will send the catch of the day menu to all active contacts.')) {
      return;
    }
    setTriggering(true);
    setAlertSuccess(null);
    try {
      const res = await api.meenzy.triggerBroadcast();
      setAlertSuccess(`Catalog Broadcast successfully sent to ${res.sent_broadcasts || 0} active contacts!`);
    } catch (err) {
      alert('Failed to send catalog broadcast. Make sure you have active contacts added in your Contacts database.');
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const handleTriggerFailure = async (itemName) => {
    if (!window.confirm(`Are you sure you want to trigger an inventory failure alert for "${itemName}"? This will send interactive buttons to all impacted customers.`)) {
      return;
    }
    setTriggering(true);
    setAlertSuccess(null);
    try {
      const res = await api.meenzy.triggerFailure(itemName);
      setAlertSuccess(`Alert sent! Sent interactive choices to ${res.alerted_customers || 0} customers.`);
      fetchData();
    } catch (err) {
      alert('Failed to trigger failure alert.');
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const handleTriggerConfirm = async (itemName) => {
    if (!window.confirm(`Are you sure you want to trigger an order confirmation for "${itemName}"? This will send a WhatsApp confirmation message to all customers waiting for this item.`)) {
      return;
    }
    setTriggering(true);
    setAlertSuccess(null);
    try {
      const res = await api.meenzy.triggerConfirm(itemName);
      setAlertSuccess(`Order confirmed! Sent confirmation messages to ${res.alerted_customers || 0} customers.`);
      fetchData();
    } catch (err) {
      alert('Failed to trigger confirmation alert.');
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm('Are you sure you want to delete this preorder? This action cannot be undone.')) {
      return;
    }
    try {
      await api.meenzy.delete(id);
      fetchData();
    } catch (err) {
      alert('Failed to delete preorder.');
      console.error(err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING_CONFIRMATION': return { bg: '#FEF3C7', text: '#D97706', label: 'Pending Choice' };
      case 'AWAITING_FAILURE_SWAP': return { bg: '#FEE2E2', text: '#EF4444', label: 'Awaiting Resolution' };
      case 'REFUND_REQUESTED': return { bg: '#FEE2E2', text: '#DC2626', label: 'Refund Requested' };
      case 'SWAPPED': return { bg: '#E0F2FE', text: '#0284C7', label: 'Item Swapped' };
      case 'POSTPONED': return { bg: '#F3E8FF', text: '#7C3AED', label: 'Postponed' };
      default: return { bg: '#E1F5FE', text: '#0288D1', label: status };
    }
  };

  return (
    <div style={{ padding: '24px 30px', fontFamily: FONT, color: '#1E293B', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingBag size={24} style={{ color: C.primary }} /> MEENZY Preorders Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
            Real-time tracking of fresh catches preordered via WhatsApp.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSendBroadcast}
            disabled={triggering}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#4F46E5',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: triggering ? 'not-allowed' : 'pointer',
              opacity: triggering ? 0.6 : 1,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { if (!triggering) e.currentTarget.style.background = '#4338CA'; }}
            onMouseLeave={e => { if (!triggering) e.currentTarget.style.background = '#4F46E5'; }}
          >
            <Megaphone size={14} /> Send Catalog Broadcast
          </button>
          <button
            onClick={exportToExcel}
            disabled={preorders.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#10B981',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: preorders.length === 0 ? 'not-allowed' : 'pointer',
              opacity: preorders.length === 0 ? 0.6 : 1,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { if (preorders.length > 0) e.currentTarget.style.background = '#059669'; }}
            onMouseLeave={e => { if (preorders.length > 0) e.currentTarget.style.background = '#10B981'; }}
          >
            <FileText size={14} /> Export to Excel
          </button>
          <button
            onClick={fetchData}
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
      </div>

      {alertSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, color: '#065F46', fontSize: 13 }}>
          <CheckCircle2 size={16} /> {alertSuccess}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #E2E8F0', paddingBottom: 10 }}>
        <button
          onClick={() => setActiveTab('preorders')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 16,
            fontWeight: activeTab === 'preorders' ? 700 : 500,
            color: activeTab === 'preorders' ? '#1E293B' : '#64748B',
            cursor: 'pointer',
            paddingBottom: 4,
            borderBottom: activeTab === 'preorders' ? `3px solid ${C.primary}` : '3px solid transparent'
          }}
        >
          Regular Preorders
        </button>
        <button
          onClick={() => setActiveTab('quotes')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 16,
            fontWeight: activeTab === 'quotes' ? 700 : 500,
            color: activeTab === 'quotes' ? '#1E293B' : '#64748B',
            cursor: 'pointer',
            paddingBottom: 4,
            borderBottom: activeTab === 'quotes' ? `3px solid ${C.primary}` : '3px solid transparent'
          }}
        >
          Bulk Quote Requests {bulkQuotes.filter(q => q.status === 'pending_review').length > 0 && `(${bulkQuotes.filter(q => q.status === 'pending_review').length})`}
        </button>
      </div>

      {activeTab === 'preorders' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
          {/* Left Side: Preorders Table */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Preorder Log</span>
            </div>
            
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading preorders…</div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#EF4444', fontSize: 13 }}>{error}</div>
            ) : preorders.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No preorders found in database. Send a WhatsApp starting with "order" to seed!</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                      <th style={{ padding: '12px 20px' }}>Customer Phone</th>
                      <th style={{ padding: '12px 20px' }}>Ordered Item</th>
                      <th style={{ padding: '12px 20px' }}>Quantity (kg)</th>
                      <th style={{ padding: '12px 20px' }}>Delivery Date</th>
                      <th style={{ padding: '12px 20px' }}>Order Status</th>
                      <th style={{ padding: '12px 20px' }}>Assign Agent</th>
                      <th style={{ padding: '12px 20px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preorders.map((order) => {
                      const status = getStatusColor(order.order_status);
                      return (
                        <tr key={order.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}>
                          <td style={{ padding: '14px 20px', fontWeight: 600 }}>+{order.customer_phone}</td>
                          <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 500 }}>{order.ordered_item}</td>
                          <td style={{ padding: '14px 20px', color: '#475569' }}>{parseFloat(order.quantity)} kg</td>
                          <td style={{ padding: '14px 20px', color: '#64748B' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Calendar size={13} /> {new Date(order.delivery_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: status.bg, color: status.text }}>
                              {status.label}
                            </span>
                            {order.notes && (
                              <div style={{ marginTop: 8, fontSize: 11, color: '#EF4444', fontStyle: 'italic', maxWidth: 150, wordWrap: 'break-word' }}>
                                {order.notes}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <select
                              value={order.driver_id || ''}
                              onChange={(e) => handleAssignAgent(order.id, e.target.value)}
                              disabled={assigningId === order.id}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid #CBD5E1',
                                background: '#F8FAFC',
                                fontSize: 12,
                                color: '#334155',
                                cursor: 'pointer',
                                outline: 'none'
                              }}
                            >
                              <option value="">Unassigned</option>
                              {agents.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                              {order.order_status !== 'confirmed' && (
                                <button
                                  onClick={async () => {
                                    if (!window.confirm('Send WhatsApp confirmation and generate tracking link for this order?')) return;
                                    try {
                                      await api.meenzy.confirmOrder(order.id);
                                      fetchData();
                                    } catch(e) {
                                      alert('Failed to confirm order');
                                    }
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: '#10B981', cursor: 'pointer', padding: 6, borderRadius: 6, transition: 'background 0.2s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#ECFDF5'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  title="Confirm Order & Send Tracking"
                                >
                                  <CheckCircle2 size={15} />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteOrder(order.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94A3B8',
                                  cursor: 'pointer',
                                  padding: 6,
                                  borderRadius: 6,
                                  transition: 'background 0.2s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                title="Delete Order"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Side: Procurement Alerts & Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} style={{ color: '#EAB308' }} /> Procurement Manager Alerts
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                If a fresh haul fails quality check or is unavailable, trigger an alert to send WhatsApp Interactive Reply Buttons to impacted preorder customers.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from(new Set(preorders.map(order => (order.ordered_item || '').split('-')[0].split('/')[0].trim()))).filter(Boolean).map((item) => (
                  <div key={item} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid #F1F5F9', marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{item}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        disabled={triggering}
                        onClick={() => handleTriggerFailure(item)}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid #FEE2E2',
                          background: '#FEF2F2',
                          color: '#991B1B',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#FEE2E2';
                          e.currentTarget.style.borderColor = '#FCA5A5';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#FEF2F2';
                          e.currentTarget.style.borderColor = '#FEE2E2';
                        }}
                        title={`Fail ${item}`}
                      >
                        <span>Fail</span>
                        <AlertTriangle size={13} />
                      </button>
                      <button
                        disabled={triggering}
                        onClick={() => handleTriggerConfirm(item)}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid #D1FAE5',
                          background: '#ECFDF5',
                          color: '#065F46',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#D1FAE5';
                          e.currentTarget.style.borderColor = '#6EE7B7';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#ECFDF5';
                          e.currentTarget.style.borderColor = '#D1FAE5';
                        }}
                        title={`Confirm ${item}`}
                      >
                        <span>Confirm</span>
                        <CheckCircle2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                
                {preorders.length === 0 && (
                  <div style={{ padding: 12, textAlign: 'center', color: '#94A3B8', fontSize: 12, border: '1px dashed #CBD5E1', borderRadius: 8 }}>
                    No pending items
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Bulk Quote Requests</span>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading quotes…</div>
          ) : bulkQuotes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No bulk quote requests yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '12px 20px' }}>Customer Phone</th>
                    <th style={{ padding: '12px 20px' }}>Fish Name</th>
                    <th style={{ padding: '12px 20px' }}>Quantity (kg)</th>
                    <th style={{ padding: '12px 20px' }}>Delivery Date</th>
                    <th style={{ padding: '12px 20px' }}>Occasion</th>
                    <th style={{ padding: '12px 20px' }}>Status</th>
                    <th style={{ padding: '12px 20px' }}>Custom Price Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkQuotes.map((quote) => (
                    <tr key={quote.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '14px 20px', fontWeight: 600 }}>+{quote.customer_phone}</td>
                      <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 500 }}>{quote.fish_name}</td>
                      <td style={{ padding: '14px 20px', color: '#475569' }}>{parseFloat(quote.quantity_kg)} kg</td>
                      <td style={{ padding: '14px 20px', color: '#64748B' }}>{quote.delivery_date}</td>
                      <td style={{ padding: '14px 20px', color: '#64748B' }}>{quote.occasion}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: quote.status === 'pending_review' ? '#FEF3C7' : '#D1FAE5',
                          color: quote.status === 'pending_review' ? '#D97706' : '#065F46'
                        }}>
                          {quote.status === 'pending_review' ? 'Pending Review' : 'Quoted'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {quote.status === 'pending_review' ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="number"
                              placeholder="Total ₹"
                              value={quotePrices[quote.id] || ''}
                              onChange={(e) => setQuotePrices({...quotePrices, [quote.id]: e.target.value})}
                              style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                            />
                            <button
                              disabled={triggering || !quotePrices[quote.id]}
                              onClick={async () => {
                                setTriggering(true);
                                try {
                                  await api.meenzy.submitBulkQuote(quote.id, quotePrices[quote.id]);
                                  fetchData();
                                } catch(e) {
                                  alert('Failed to submit quote');
                                } finally {
                                  setTriggering(false);
                                }
                              }}
                              style={{
                                padding: '6px 12px', borderRadius: 6, border: 'none', background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!quotePrices[quote.id] || triggering) ? 0.6 : 1
                              }}
                            >
                              Send Quote
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>₹{quote.quoted_price}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
