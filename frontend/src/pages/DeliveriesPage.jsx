import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { AlertTriangle, CheckCircle, Package, RefreshCw, XCircle, Clock, MapPin, Navigation, Sparkles, Trash2 } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Marker, NavigationControl, Popup, Source, Layer } from 'react-map-gl';
import { C, FONT } from '../constants';

const PINCODE_ZONES = {
  // Chennai North
  '600011': '1. Chennai North (Perambur, TVK Nagar)',
  '600082': '1. Chennai North (Perambur, TVK Nagar)',
  '600039': '1. Chennai North (Perambur, TVK Nagar)',
  '600021': '1. Chennai North (Royapuram, Washermanpet)',
  '600013': '1. Chennai North (Royapuram, Washermanpet)',
  '600081': '1. Chennai North (Tondiarpet)',
  '600019': '1. Chennai North (Thiruvottiyur)',
  
  // Chennai Central
  '600001': '2. Chennai Central (Parrys, George Town)',
  '600002': '2. Chennai Central (Mount Road)',
  '600003': '2. Chennai Central (Park Town)',
  '600004': '2. Chennai Central (Mylapore, Mandaveli)',
  '600028': '2. Chennai Central (Mylapore, Mandaveli)',
  '600005': '2. Chennai Central (Triplicane)',
  '600006': '2. Chennai Central (Nungambakkam)',
  '600008': '2. Chennai Central (Egmore)',
  '600014': '2. Chennai Central (Royapettah)',
  '600017': '2. Chennai Central (T. Nagar)',
  '600018': '2. Chennai Central (Teynampet, Alwarpet)',
  '600024': '2. Chennai Central (Kodambakkam)',
  
  // Chennai West
  '600040': '3. Chennai West (Anna Nagar)',
  '600102': '3. Chennai West (Anna Nagar West)',
  '600030': '3. Chennai West (Shenoy Nagar)',
  '600029': '3. Chennai West (Aminjikarai)',
  '600026': '3. Chennai West (Vadapalani)',
  '600078': '3. Chennai West (KK Nagar)',
  '600083': '3. Chennai West (KK Nagar)',
  '600092': '3. Chennai West (Virugambakkam)',
  '600087': '3. Chennai West (Valasaravakkam)',
  '600116': '3. Chennai West (Porur)',
  
  // Chennai South
  '600020': '4. Chennai South (Adyar, Besant Nagar)',
  '600090': '4. Chennai South (Adyar, Besant Nagar)',
  '600032': '4. Chennai South (Guindy)',
  '600041': '4. Chennai South (Thiruvanmiyur)',
  '600042': '4. Chennai South (Velachery)',
  '600088': '4. Chennai South (Madipakkam)',
  '600091': '4. Chennai South (Madipakkam)',
  '600061': '4. Chennai South (Nanganallur)',
  
  // OMR / ECR
  '600096': '5. OMR (Perungudi)',
  '600097': '5. OMR (Thoraipakkam)',
  '600119': '5. OMR (Sholinganallur)',
  '600115': '5. ECR (Neelankarai, Injambakkam)',
  '600043': '5. ECR (Palavakkam)',
  '600044': '5. Chennai Suburbs (Chromepet)',
  '600045': '5. Chennai Suburbs (Tambaram)',
  '600047': '5. Chennai Suburbs (Villivakkam)',
};

const getZoneName = (pin) => {
  return PINCODE_ZONES[pin] || `99. Unmapped Zone (Pincode: ${pin})`;
};

export default function DeliveriesPage() {
  const [orders, setOrders] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [bulkAssignAgentId, setBulkAssignAgentId] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  
  // AI Map State
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [isAiClustering, setIsAiClustering] = useState(false);
  
  const [viewState, setViewState] = useState({
    longitude: 80.2707,
    latitude: 13.0827,
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

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to permanently delete this order? This action cannot be undone.')) return;
    try {
      await api.deliveries.delete(id);
      fetchOrders();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
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

  async function toggleHeatmap() {
    if (!showHeatmap) {
      if (!heatmapData) {
        try {
          const json = await api.forecasting.heatmap();
          if (json.ok) setHeatmapData(json.data);
          else alert('Failed to load AI Heatmap');
        } catch (e) {
          console.error(e);
          alert('Error loading heatmap');
        }
      }
    }
    setShowHeatmap(!showHeatmap);
  }

  async function handleAiDispatch() {
    if (!confirm('Are you sure you want to let the AI automatically cluster and assign all unassigned orders to the nearest available agents?')) return;
    setIsAiClustering(true);
    try {
      const json = await api.deliveries.aiDispatch();
      if (json.ok) {
        alert(`🤖 AI Auto-Dispatch Complete!\nSuccessfully clustered and assigned ${json.assignedCount} orders!`);
        fetchOrders();
      } else {
        alert('AI Dispatch failed: ' + (json.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Error running AI Dispatch');
    } finally {
      setIsAiClustering(false);
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
    return agent && agent.name ? String(agent.name) : 'Z_Unknown';
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

  const ordersByZone = {};
  sortedOrders.forEach(o => {
    const pin = getPincode(o.address_line);
    const zone = getZoneName(pin);
    if (!ordersByZone[zone]) ordersByZone[zone] = [];
    ordersByZone[zone].push(o);
  });
  const zones = Object.keys(ordersByZone).sort();

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
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleAiDispatch}
                disabled={isAiClustering}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', border: 'none', borderRadius: 4, cursor: isAiClustering ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 4px rgba(99,102,241,0.3)' }}
              >
                <Sparkles size={14} /> {isAiClustering ? 'Clustering...' : 'AI Auto-Dispatch'}
              </button>
              <button
                onClick={toggleHeatmap}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: showHeatmap ? '#ef4444' : '#f3f4f6', color: showHeatmap ? '#fff' : '#374151', border: showHeatmap ? 'none' : '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {showHeatmap ? 'Hide Demand Heatmap' : 'Show Demand Heatmap'}
              </button>
            </div>
            
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
            mapLib={maplibregl}
            initialViewState={viewState}
            onLoad={e => e.target.resize()}
            mapStyle={`https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json`}
            transformRequest={(url, resourceType) => {
              if (url.includes('api.olamaps.io')) {
                const olaToken = import.meta.env.VITE_OLA_MAPS_KEY || import.meta.env.VITE_MAPBOX_TOKEN;
                return { url: `${url}${url.includes('?') ? '&' : '?'}api_key=${olaToken}` };
              }
            }}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
            
            {/* AI Heatmap Layer */}
            {showHeatmap && heatmapData && (
              <Source type="geojson" data={heatmapData}>
                <Layer 
                  id="demand-heatmap" 
                  type="heatmap" 
                  paint={{
                    'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
                    'heatmap-color': [
                      'interpolate',
                      ['linear'],
                      ['heatmap-density'],
                      0, 'rgba(33,102,172,0)',
                      0.2, 'rgb(103,169,207)',
                      0.4, 'rgb(209,229,240)',
                      0.6, 'rgb(253,219,199)',
                      0.8, 'rgb(239,138,98)',
                      1, 'rgb(178,24,43)'
                    ],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, 20],
                    'heatmap-opacity': 0.8
                  }} 
                />
              </Source>
            )}

            {/* Draw All Map Orders (Hide if heatmap is showing for cleaner UI) */}
            {!showHeatmap && orders.map((order, idx) => {
              let lat = parseFloat(order.lat);
              let lng = parseFloat(order.lng);
              if (isNaN(lat) || isNaN(lng)) {
                // Default to Chennai center + slight spiral jitter so unmapped orders fan out and don't perfectly overlap
                const angle = idx * 0.5;
                const radius = 0.005 + (idx * 0.0005);
                lat = 13.0827 + (radius * Math.cos(angle));
                lng = 80.2707 + (radius * Math.sin(angle));
              }
              const isUnassigned = ['CREATED','CONFIRMED','VERIFIED_READY','PACKED'].includes(order.status) && !order.assigned_agent_id;
              const isDelivered = order.status === 'DELIVERED';
              const isAssigned = !!order.assigned_agent_id && !isDelivered && order.status !== 'CANCELLED' && order.status !== 'DELIVERY_FAILED_DISPUTED';
              const isIssue = order.status === 'DELIVERY_FAILED_DISPUTED' || order.status === 'CANCELLED';
              
              let bgColor = '#ef4444'; // Red (Unassigned)
              if (selectedOrderIds.has(order.id)) bgColor = '#3b82f6'; // Blue (Selected)
              else if (isDelivered) bgColor = '#10b981'; // Green
              else if (isAssigned) bgColor = '#6366f1'; // Indigo
              else if (isIssue) bgColor = '#f59e0b'; // Yellow
              
              return (
              <Marker key={order.id} longitude={lng} latitude={lat} anchor="bottom" onClick={e => { e.originalEvent.stopPropagation(); setSelectedOrder(order); }}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: isDelivered ? 0.7 : 1 }}>
                  {isUnassigned && (
                    <div style={{ 
                      position: 'absolute', top: -8, right: -8, zIndex: 10, background: '#fff', borderRadius: '50%', padding: 2, display: 'flex', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                      <input 
                        type="checkbox"
                        checked={selectedOrderIds.has(order.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleOrderSelection(order.id);
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', margin: 0, width: 14, height: 14 }}
                      />
                    </div>
                  )}
                  <div style={{ background: bgColor, color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', border: '2px solid #fff', cursor: 'pointer' }}>
                    {isDelivered ? <CheckCircle size={14} /> : (isIssue ? <AlertTriangle size={14} /> : <Package size={14} />)}
                  </div>
                </div>
              </Marker>
            )})}

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
                  <p style={{ fontWeight: 700, margin: '0 0 4px 0', fontSize: 13 }}>Order #{selectedOrder.wix_order_id || String(selectedOrder.id).split('-')[0].toUpperCase()}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px 0' }}>{selectedOrder.address_line}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', margin: '0 0 4px 0' }}>Status: {selectedOrder.status}</p>
                  {selectedOrder.assigned_agent_id && (
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', margin: '0 0 8px 0' }}>Agent: {getAgentName(selectedOrder.assigned_agent_id)}</p>
                  )}
                  {(!selectedOrder.assigned_agent_id && ['CREATED','CONFIRMED','VERIFIED_READY','PACKED'].includes(selectedOrder.status)) && (
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
                  )}
                </div>
              </Popup>
            )}

            {/* Draw Active Agents */}
            {agents.filter(a => a.last_lat && a.last_lng && !isNaN(parseFloat(a.last_lat)) && !isNaN(parseFloat(a.last_lng))).map(agent => {
              const isActive = agent.last_location_update && (new Date() - new Date(agent.last_location_update) < 5 * 60 * 1000); // Updated in last 5 mins
              return (
                <Marker key={agent.id} longitude={parseFloat(agent.last_lng)} latitude={parseFloat(agent.last_lat)} anchor="bottom">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ background: '#fff', color: '#374151', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', marginBottom: 2 }}>
                      {(agent.name || 'Agent').split(' ')[0]}
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
                    Order #{order.wix_order_id || String(order.id).split('-')[0].toUpperCase()} <span style={{ fontSize: 13, fontWeight: 500, color: C.textSecondary, marginLeft: 8 }}>Phone: {order.user_phone}</span>
                  </p>
                  <p style={{ fontSize: 13, color: C.textSecondary, margin: '0 0 8px 0' }}>Address: {order.address_line}</p>
                  <div style={{ fontSize: 13, color: C.textSecondary }}>
                    <span style={{ fontWeight: 600, color: C.text }}>Items: </span>
                    {Array.isArray(order.items) && order.items.length > 0 ? order.items.map(i => `${i.product_name} (x${i.quantity})`).join(', ') : '-'}
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
                  <button onClick={() => handleDelete(order.id)} style={{ padding: '8px 16px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Orders Table grouped by Zone */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {zones.length === 0 ? (
          <div style={{ background: C.cardBg, padding: 30, textAlign: 'center', borderRadius: 12, border: `1px solid ${C.border}`, color: C.textMuted }}>
            {loading ? 'Loading deliveries...' : 'No orders found.'}
          </div>
        ) : (
          zones.map(zone => {
            const zoneOrders = ordersByZone[zone];
            const unassignedOrders = zoneOrders.filter(o => !o.assigned_agent_id && ['CREATED','CONFIRMED','VERIFIED_READY','PACKED'].includes(o.status));
            const unassignedIds = unassignedOrders.map(o => o.id);
            const zoneSafeId = zone.replace(/\W+/g, '-');
            
            return (
              <div key={zone} style={{ background: C.cardBg, boxShadow: C.shadowSm, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={18} /> {zone.replace(/^\d+\.\s*/, '')} <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 500 }}>({zoneOrders.length} Orders, {unassignedOrders.length} Unassigned)</span>
                  </h2>
                  
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {unassignedOrders.length > 0 && (
                      <button 
                        onClick={async () => {
                          if (!confirm(`Are you sure you want AI to automatically balance and assign these ${unassignedOrders.length} unassigned orders in ${zone}?`)) return;
                          try {
                            const res = await api.deliveries.aiAssignZone(unassignedIds);
                            alert(`Success! AI Assigned ${res.assignedCount} orders to ${res.assignedAgentName}.`);
                            fetchOrders();
                          } catch (err) {
                            alert('AI Assign Failed: ' + err.message);
                          }
                        }}
                        style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)' }}
                      >
                        <Sparkles size={14} /> AI Assign Zone
                      </button>
                    )}
                    {unassignedOrders.length > 0 && <div style={{ width: 1, height: 20, background: '#cbd5e1' }} />}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        id={`select-${zoneSafeId}`}
                        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 12, outline: 'none' }}
                      >
                        <option value="">Manual Agent...</option>
                        {agents.filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <button 
                        onClick={async () => {
                          const selectEl = document.getElementById(`select-${zoneSafeId}`);
                          const agentId = selectEl.value;
                          if (!agentId) { alert('Please select an agent first'); return; }
                          
                          const selectedInZone = zoneOrders.filter(o => selectedOrderIds.has(o.id)).map(o => o.id);
                          const idsToAssign = selectedInZone.length > 0 ? selectedInZone : unassignedIds;
                          
                          if (idsToAssign.length === 0) {
                            alert('No unassigned orders to assign. Please select specific orders using the checkboxes to manually assign them.');
                            return;
                          }
                          
                          if (!confirm(`Assign ${idsToAssign.length} orders in ${zone} to this agent?`)) return;
                          try {
                            const res = await api.deliveries.bulkAssign(agentId, idsToAssign);
                            alert(`Successfully assigned ${res.assignedCount} orders!`);
                            selectEl.value = '';
                            setSelectedOrderIds(new Set());
                            fetchOrders();
                          } catch (err) {
                            alert('Manual bulk assign failed: ' + err.message);
                          }
                        }}
                        style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: C.surfaceAlt, fontSize: 11, textTransform: 'uppercase', color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                        <th style={{ padding: '12px 20px', fontWeight: 600, width: 40 }}>
                          <input 
                            type="checkbox" 
                            checked={zoneOrders.length > 0 && zoneOrders.every(o => selectedOrderIds.has(o.id))}
                            onChange={() => {
                              const newSet = new Set(selectedOrderIds);
                              const allChecked = zoneOrders.every(o => newSet.has(o.id));
                              zoneOrders.forEach(o => allChecked ? newSet.delete(o.id) : newSet.add(o.id));
                              setSelectedOrderIds(newSet);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Order ID</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Agent</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Customer</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Items</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Value</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Payment</th>
                        <th style={{ padding: '12px 20px', fontWeight: 600 }}>Date</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontSize: 13, color: C.text }}>
                      {zoneOrders.map(order => (
                        <tr key={order.id} style={{ borderBottom: `1px solid ${C.border}`, background: selectedOrderIds.has(order.id) ? '#eff6ff' : 'transparent' }}>
                          <td style={{ padding: '12px 20px' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedOrderIds.has(order.id)}
                              onChange={() => toggleOrderSelection(order.id)}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {order.wix_order_id || String(order.id).split('-')[0].toUpperCase()}
                            <button 
                              onClick={() => handleDelete(order.id)} 
                              style={{ padding: '4px', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center' }}
                              title="Delete Order"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
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
                              <option value="POSTPONED">Postponed</option>
                              <option value="CANCELLED_REFUND">Cancelled (Refund)</option>
                              <option value="PENDING_REPLACEMENT">Pending Replacement</option>
                              <option value="SWAPPED">Swapped</option>
                              <option value="CANCELLED">Cancelled</option>
                            </select>
                            {order.delivery_instructions && (
                              <div style={{ marginTop: 6, fontSize: 11, color: '#7C3AED', fontWeight: 600, whiteSpace: 'pre-wrap' }}>
                                {order.delivery_instructions}
                              </div>
                            )}
                            {order.notes && (
                              <div style={{ marginTop: 4, fontSize: 11, color: '#EF4444', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                                {order.notes}
                              </div>
                            )}
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
                          <td style={{ padding: '12px 20px', color: C.textSecondary }}>
                            {order.customer_name ? (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: C.text }}>{order.customer_name}</span>
                                <span style={{ fontSize: 11 }}>{order.user_phone}</span>
                              </div>
                            ) : (
                              order.user_phone
                            )}
                          </td>
                          <td style={{ padding: '12px 20px', color: C.text }}>
                            {Array.isArray(order.items) && order.items.length > 0 ? order.items.map(i => `${i.product_name} (${i.quantity}kg)`).join(', ') : '-'}
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 600 }}>₹{order.total_price}</td>
                          <td style={{ padding: '12px 20px' }}>
                            <span style={{
                              padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: order.payment_status === 'PAID' ? '#dcfce7' : '#fee2e2',
                              color: order.payment_status === 'PAID' ? '#16a34a' : '#ef4444'
                            }}>
                              {order.payment_status === 'PAID' ? 'ONLINE' : 'COD'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px', color: C.textMuted }}>{new Date(order.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
