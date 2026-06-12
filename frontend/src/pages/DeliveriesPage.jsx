import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { AlertTriangle, CheckCircle, Package, RefreshCw, XCircle, Clock, MapPin, Navigation } from 'lucide-react';
import Map, { Marker, NavigationControl, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { C, FONT } from '../constants';

export default function DeliveriesPage() {
  const [orders, setOrders] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [bulkAssignAgentId, setBulkAssignAgentId] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  
  const [viewState, setViewState] = useState({
    longitude: 77.5946,
    latitude: 12.9716,
    zoom: 11
  });

  useEffect(() => {
    fetchOrders();
    fetchAgents();
    
    // Silent polling every 10 seconds
    const intervalId = setInterval(() => {
      fetchAgents(true);
      fetchOrders(true);
    }, 10000);
    
    return () => clearInterval(intervalId);
  }, []);

  async function fetchAgents(silent = false) {
    try {
      const data = await api.agents.list();
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents', err);
    }
  }

  async function fetchOrders(silent = false) {
    try {
      if (!silent) setLoading(true);
      const data = await api.deliveries.list();
      setOrders(data.orders || []);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError('Failed to load deliveries. ' + err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleReattempt(id) {
    if (!confirm('Reattempt delivery for this order?')) return;
    try {
      await api.deliveries.reattempt(id);
      fetchOrders();
    } catch (err) {
      alert('Failed to reattempt: ' + err.message);
    }
  }

  async function handleCancel(id) {
    if (!confirm('Cancel order and restock items?')) return;
    try {
      await api.deliveries.cancel(id);
      fetchOrders();
    } catch (err) {
      alert('Failed to cancel: ' + err.message);
    }
  }

  async function handleStatusUpdate(id, newStatus) {
    if (newStatus === 'DELIVERED') {
      const otp = window.prompt(`Enter the 4-digit OTP provided by the customer to mark this order as Delivered:`);
      if (otp === null) return;
      if (!otp.match(/^\d{4}$/)) {
        alert('Invalid OTP format. Must be exactly 4 digits.');
        return;
      }
      try {
        await api.deliveries.verifyDelivery(id, otp);
        fetchOrders();
      } catch (err) {
        alert('OTP Verification Failed: ' + err.message);
      }
      return;
    }

    if (!confirm(`Update order status to ${newStatus}?`)) return;
    try {
      await api.deliveries.updateStatus(id, newStatus);
      fetchOrders();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  }

  async function handleAssignAgent(id, agentId) {
    if (!agentId) return;
    try {
      await api.deliveries.assignAgent(id, agentId);
      setSelectedOrder(null);
      setAssignAgentId('');
      fetchOrders();
    } catch (err) {
      alert('Failed to assign agent: ' + err.message);
    }
  }

  const toggleOrderSelection = (id) => {
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOrderIds(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedOrderIds.size === sortedOrders.length && sortedOrders.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(sortedOrders.map(o => o.id)));
    }
  };

  async function handleBulkAssign() {
    if (!bulkAssignAgentId) return;
    const orderIdsArray = Array.from(selectedOrderIds);
    let count;
    
    if (orderIdsArray.length > 0) {
      count = orderIdsArray.length;
    } else {
      count = orders.filter(o => !o.assigned_agent_id && ['CREATED','CONFIRMED','VERIFIED_READY','PACKED'].includes(o.status)).length;
    }

    if (count === 0) {
      alert('No orders ready to be dispatched!');
      return;
    }

    const msg = orderIdsArray.length > 0 
      ? `Are you sure you want to assign the ${count} SELECTED orders to this driver?`
      : `Are you sure you want to assign ALL ${count} unassigned orders to this driver?`;

    if (!confirm(msg)) return;
    
    try {
      const res = await api.deliveries.bulkAssign(bulkAssignAgentId, orderIdsArray.length > 0 ? orderIdsArray : []);
      alert(`Successfully assigned ${res.assignedCount} orders!`);
      setBulkAssignAgentId('');
      setSelectedOrderIds(new Set());
      fetchOrders();
    } catch (err) {
      alert('Failed to bulk assign: ' + err.message);
    }
  }

  const getStatusBadge = (status) => {
    const baseStyle = { padding: '4px 8px', borderRadius: 12, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 };
    switch (status) {
      case 'DELIVERY_FAILED_DISPUTED': return <span style={{ ...baseStyle, background: '#fee2e2', color: '#991b1b' }}><AlertTriangle size={14}/> Disputed</span>;
      case 'CANCELLED': return <span style={{ ...baseStyle, background: '#f3f4f6', color: '#1f2937' }}><XCircle size={14}/> Cancelled</span>;
      case 'DELIVERED': return <span style={{ ...baseStyle, background: '#dcfce7', color: '#166534' }}><CheckCircle size={14}/> Delivered</span>;
      case 'DISPATCHED_TO_3PL': return <span style={{ ...baseStyle, background: '#dbeafe', color: '#1e40af' }}><Package size={14}/> Dispatched</span>;
      default: return <span style={{ ...baseStyle, background: '#fef3c7', color: '#92400e' }}><Clock size={14}/> {status.replace(/_/g, ' ')}</span>;
    }
  };

  const disputedOrders = orders.filter(o => o.status === 'DELIVERY_FAILED_DISPUTED');

  const getPincode = (address) => {
    if (!address) return 'Unknown';
    const match = String(address).match(/\b\d{6}\b/);
    return match ? match[0] : 'Unknown';
  };

  const getAgentName = (agentId) => {
    if (!agentId) return 'Z_Unassigned';
    const agent = agents.find(a => String(a.id) === String(agentId));
    return agent ? agent.name : 'Z_Unknown';
  };

  // Sort orders by Pincode first, then by Agent Name
  const sortedOrders = [...orders].sort((a, b) => {
    const pinA = getPincode(a.address_line);
    const pinB = getPincode(b.address_line);
    if (pinA !== pinB) return pinA.localeCompare(pinB);
    
    const agentA = getAgentName(a.assigned_agent_id);
    const agentB = getAgentName(b.assigned_agent_id);
    return agentA.localeCompare(agentB);
  });

  const cardStyle = {
    background: C.cardBg, padding: 20, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, flex: 1
  };

  return (
    <div style={{ padding: 30, maxWidth: 1200, margin: '0 auto', fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Delivery Ecosystem Dashboard</h1>
        <button onClick={fetchOrders} style={{ 
          padding: '8px 12px', background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 6, 
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSecondary, cursor: 'pointer', boxShadow: C.shadowSm 
        }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171', borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Admin Visual Dispatch Map */}
      <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} /> Live Dispatch Map
          </h2>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f3f4f6', padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary }}>Bulk Assign:</span>
            <select
              value={bulkAssignAgentId}
              onChange={(e) => setBulkAssignAgentId(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12, outline: 'none' }}
            >
              <option value="">Select an agent...</option>
              {agents.filter(a => a.is_active).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button 
              onClick={handleBulkAssign}
              disabled={!bulkAssignAgentId}
              style={{ padding: '6px 12px', background: bulkAssignAgentId ? '#10b981' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 4, cursor: bulkAssignAgentId ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}
            >
              {selectedOrderIds.size > 0 ? `Assign ${selectedOrderIds.size} Selected` : 'Assign All Unassigned'}
            </button>
          </div>
        </div>

        <div style={{ height: 400, borderRadius: 8, overflow: 'hidden', position: 'relative', border: `1px solid ${C.border}` }}>
          <Map
            {...viewState}
            onLoad={e => e.target.resize()}
            onMove={evt => setViewState(evt.viewState)}
            mapStyle={`mapbox://styles/mapbox/streets-v12`}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
            
            {/* Draw Unassigned Orders */}
            {orders.filter(o => (o.status === 'CONFIRMED' || o.status === 'CREATED') && !o.assigned_agent_id && o.lat && o.lng).map(order => (
              <Marker key={order.id} longitude={parseFloat(order.lng)} latitude={parseFloat(order.lat)} anchor="bottom" onClick={e => { e.originalEvent.stopPropagation(); setSelectedOrder(order); }}>
                <div style={{ background: '#ef4444', color: '#fff', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', border: '2px solid #fff', cursor: 'pointer' }}>
                  <Package size={14} />
                </div>
              </Marker>
            ))}

            {/* Popup for Selected Order */}
            {selectedOrder && (
              <Popup
                longitude={parseFloat(selectedOrder.lng)}
                latitude={parseFloat(selectedOrder.lat)}
                anchor="top"
                closeOnClick={false}
                onClose={() => setSelectedOrder(null)}
                style={{ fontFamily: FONT }}
              >
                <div style={{ padding: 8, minWidth: 200 }}>
                  <p style={{ fontWeight: 700, margin: '0 0 4px 0', fontSize: 13 }}>Order #{selectedOrder.wix_order_id}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 12px 0' }}>{selectedOrder.address_line}</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <select
                      value={assignAgentId}
                      onChange={(e) => setAssignAgentId(e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12, outline: 'none' }}
                    >
                      <option value="">Select an agent...</option>
                      {agents.filter(a => a.is_active).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    
                    <button 
                      onClick={() => handleAssignAgent(selectedOrder.id, assignAgentId)}
                      disabled={!assignAgentId}
                      style={{ padding: '6px', background: assignAgentId ? '#2563eb' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 4, cursor: assignAgentId ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}
                    >
                      Assign Driver
                    </button>
                  </div>
                </div>
              </Popup>
            )}

            {/* Draw Active Agents */}
            {agents.filter(a => a.last_lat && a.last_lng).map(agent => {
              const isActive = agent.last_location_update && (new Date() - new Date(agent.last_location_update) < 5 * 60 * 1000); // Updated in last 5 mins
              return (
                <Marker key={agent.id} longitude={parseFloat(agent.last_lng)} latitude={parseFloat(agent.last_lat)} anchor="bottom">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ background: '#fff', color: '#374151', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', marginBottom: 2 }}>
                      {agent.name.split(' ')[0]}
                    </div>
                    <div style={{ background: isActive ? '#10b981' : '#6b7280', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', border: '2px solid #fff' }}>
                      <Navigation size={14} style={{ transform: 'rotate(45deg)' }} />
                    </div>
                  </div>
                </Marker>
              );
            })}
          </Map>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13, color: C.textSecondary, fontWeight: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: '#ef4444', borderRadius: '50%' }} /> Unassigned Orders</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: '#10b981', borderRadius: '50%' }} /> Active Agent (Online)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 12, height: 12, background: '#6b7280', borderRadius: '50%' }} /> Agent Offline (&gt;5m)</div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: C.textSecondary, fontWeight: 600, margin: '0 0 8px 0' }}>Total Orders</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0 }}>{orders.length}</p>
        </div>
        <div style={{ ...cardStyle, background: '#fef2f2', borderColor: '#fecaca' }}>
          <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14}/> Exception Queue</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#991b1b', margin: 0 }}>{disputedOrders.length}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: C.textSecondary, fontWeight: 600, margin: '0 0 8px 0' }}>Pending Dispatch</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0 }}>{orders.filter(o => o.status === 'VERIFIED_READY').length}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: C.textSecondary, fontWeight: 600, margin: '0 0 8px 0' }}>Cancelled</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0 }}>{orders.filter(o => o.status === 'CANCELLED').length}</p>
        </div>
      </div>

      {/* Exception Queue */}
      {disputedOrders.length > 0 && (
        <div style={{ background: C.cardBg, borderLeft: '4px solid #ef4444', borderRadius: '0 12px 12px 0', boxShadow: C.shadowSm, overflow: 'hidden' }}>
          <div style={{ padding: 16, background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} /> Action Required: Delivery Exceptions
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {disputedOrders.map((order, idx) => (
              <div key={order.id} style={{ 
                padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                borderBottom: idx === disputedOrders.length - 1 ? 'none' : `1px solid ${C.border}`
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, color: C.text, margin: '0 0 4px 0', fontSize: 15 }}>
                    Order #{order.wix_order_id} <span style={{ fontSize: 13, fontWeight: 500, color: C.textSecondary, marginLeft: 8 }}>Phone: {order.user_phone}</span>
                  </p>
                  <p style={{ fontSize: 13, color: C.textSecondary, margin: '0 0 8px 0' }}>Address: {order.address_line}</p>
                  <div style={{ fontSize: 13, color: C.textSecondary }}>
                    <span style={{ fontWeight: 600, color: C.text }}>Items: </span>
                    {order.items.map(i => `${i.product_name} (x${i.quantity})`).join(', ')}
                  </div>
                  {order.latest_job && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                      Rider: {order.latest_job.rider_name || 'Unknown'} | Provider ID: {order.latest_job.provider_job_id} | Job Status: {order.latest_job.status}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleReattempt(order.id)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Reattempt Delivery
                  </button>
                  <button onClick={() => handleCancel(order.id)} style={{ padding: '8px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Cancel & Restock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Orders Table */}
      <div style={{ background: C.cardBg, boxShadow: C.shadowSm, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>All Delivery Orders</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: C.surfaceAlt, fontSize: 11, textTransform: 'uppercase', color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '12px 20px', fontWeight: 600, width: 40 }}>
                  <input 
                    type="checkbox" 
                    checked={selectedOrderIds.size === sortedOrders.length && sortedOrders.length > 0}
                    onChange={toggleAllSelection}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Order ID</th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Pincode</th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Agent</th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Value</th>
                <th style={{ padding: '12px 20px', fontWeight: 600 }}>Date</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: 13, color: C.text }}>
              {loading && orders.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '30px 20px', textAlign: 'center', color: C.textMuted }}>Loading deliveries...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '30px 20px', textAlign: 'center', color: C.textMuted }}>No orders found.</td></tr>
              ) : (
                sortedOrders.map(order => (
                  <tr key={order.id} style={{ borderBottom: `1px solid ${C.border}`, background: selectedOrderIds.has(order.id) ? '#eff6ff' : 'transparent' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '12px 20px', fontWeight: 600 }}>{order.wix_order_id}</td>
                    <td style={{ padding: '12px 20px', fontWeight: 700, color: '#3b82f6' }}>{getPincode(order.address_line)}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <select 
                        value={order.status}
                        onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', outline: 'none', fontWeight: 600, color: '#374151' }}
                      >
                        <option value="CREATED">Created</option>
                        <option value="PENDING_VERIFICATION">Pending Verification</option>
                        <option value="VERIFIED_READY">Verified Ready</option>
                        <option value="PACKED">Packed</option>
                        <option value="DISPATCHED_TO_3PL">Dispatched</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="DELIVERY_FAILED_DISPUTED">Disputed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <select
                        value={order.assigned_agent_id || ''}
                        onChange={(e) => handleAssignAgent(order.id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', outline: 'none' }}
                      >
                        <option value="">Unassigned</option>
                        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '12px 20px', color: C.textSecondary }}>{order.user_phone}</td>
                    <td style={{ padding: '12px 20px', fontWeight: 600 }}>₹{order.total_price}</td>
                    <td style={{ padding: '12px 20px', color: C.textMuted }}>{new Date(order.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
