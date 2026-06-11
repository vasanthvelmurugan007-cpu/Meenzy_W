import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { Package, CheckCircle, MapPin, Phone, CreditCard, Clock, LogIn, Navigation, ArrowRight, Sparkles, Moon, Sun, Camera } from 'lucide-react';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { C, FONT } from '../constants';
import AgentLogin from './AgentLogin';
import AgentRegister from './AgentRegister';

const SwipeButton = ({ onSwipeComplete, label }) => {
  const [position, setPosition] = useState(0);
  const [completed, setCompleted] = useState(false);
  const trackRef = useRef(null);

  const handleMove = (clientX) => {
    if (completed || !trackRef.current) return;
    const track = trackRef.current.getBoundingClientRect();
    const handleWidth = 56;
    let newPos = clientX - track.left - handleWidth / 2;
    if (newPos < 0) newPos = 0;
    const maxPos = track.width - handleWidth;
    if (newPos >= maxPos) {
      newPos = maxPos;
      setCompleted(true);
      onSwipeComplete();
    }
    setPosition(newPos);
  };

  const handlePointerDown = (e) => {
    if (completed) return;
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (e.buttons !== 1) return; // Only if mouse down/touching
    handleMove(e.clientX);
  };

  const handlePointerUp = (e) => {
    if (!completed) {
      setPosition(0);
    }
    e.target.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      ref={trackRef}
      style={{
        width: '100%', height: 56, background: completed ? '#10b981' : '#e5e7eb',
        borderRadius: 28, position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)', transition: 'background 0.3s'
      }}
    >
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: completed ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 16,
        userSelect: 'none'
      }}>
        {completed ? 'Delivered!' : label}
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          width: 56, height: 56, background: '#fff', borderRadius: '50%',
          position: 'absolute', top: 0, left: position, cursor: 'grab',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', touchAction: 'none',
          transition: e => e.buttons !== 1 ? 'left 0.3s' : 'none'
        }}
      >
        <ArrowRight size={24} color={completed ? '#10b981' : '#3b82f6'} />
      </div>
    </div>
  );
};

export default function AgentPortalPage() {
  const [agentToken, setAgentToken] = useState(() => localStorage.getItem('agentToken'));
  const [selectedAgent, setSelectedAgent] = useState(() => {
    const saved = localStorage.getItem('agentProfile');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [showRegister, setShowRegister] = useState(false);
  const [orders, setOrders] = useState([]);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('available'); // 'available' or 'my_deliveries'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [agentStats, setAgentStats] = useState({ totalDeliveries: 0, totalEarnings: 0, walletBalance: 0, totalPaid: 0 });
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('agentDarkMode') === 'true');
  const [podImages, setPodImages] = useState({}); // { orderId: base64String }
  const [showModifyModal, setShowModifyModal] = useState(null);
  const [rejectItems, setRejectItems] = useState({});
  const lastSyncTime = useRef(0);

  const toggleDarkMode = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    localStorage.setItem('agentDarkMode', nextMode.toString());
  };

  const theme = {
    bg: isDarkMode ? '#111827' : '#f3f4f6',
    cardBg: isDarkMode ? '#1f2937' : '#fff',
    text: isDarkMode ? '#f9fafb' : '#1f2937',
    subText: isDarkMode ? '#9ca3af' : '#6b7280',
    border: isDarkMode ? '#374151' : '#e5e7eb',
    accentBg: isDarkMode ? '#374151' : '#f9fafb'
  };

  const handleCameraCapture = (orderId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPodImages(prev => ({ ...prev, [orderId]: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // Haversine distance calculator (returns km)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  
  // Map and Routing State
  const mapRef = useRef(null);
  const [agentLocation, setAgentLocation] = useState(null); // {lat, lng}
  const [routeGeojson, setRouteGeojson] = useState(null);

  // Fallback map center if no GPS
  const [viewState, setViewState] = useState({
    longitude: 77.5946,
    latitude: 12.9716,
    zoom: 11
  });

  // We no longer fetch a public list of agents.
  // 1. Session check on mount
  useEffect(() => {
    if (agentToken && !selectedAgent) {
      // Validate session and fetch profile
      api.agentAuth.me(agentToken)
        .then(res => {
          setSelectedAgent(res.agent);
          localStorage.setItem('agentProfile', JSON.stringify(res.agent));
        })
        .catch(err => {
          handleLogout();
        });
    }
  }, [agentToken, selectedAgent]);

  // 2. Fetch Orders for Selected Agent
  useEffect(() => {
    if (selectedAgent && agentToken) {
      if (activeTab === 'my_deliveries') {
        fetchOrders();
      } else {
        fetchAvailableOrders();
      }
      fetchStats();
    }
  }, [selectedAgent, agentToken, activeTab]);

  async function fetchStats() {
    if (!agentToken || !selectedAgent) return;
    try {
      const data = await api.agentPortal.getStats(selectedAgent.id, agentToken);
      if (data.ok) {
        setAgentStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  }

  async function fetchOrders() {
    if (!agentToken || !selectedAgent) return;
    try {
      setLoading(true);
      const data = await api.agentPortal.getOrders(selectedAgent.id, agentToken);
      setOrders(data.orders || []);
    } catch (err) {
      if (err.message.includes('Unauthorized')) handleLogout();
      else setError('Failed to load your orders.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableOrders() {
    if (!agentToken) return;
    try {
      setLoading(true);
      const data = await api.agentPortal.getAvailableOrders(agentToken);
      setAvailableOrders(data.orders || []);
    } catch (err) {
      if (err.message.includes('Unauthorized')) handleLogout();
      else setError('Failed to load available orders.');
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimOrder(orderId) {
    if (!agentToken || !selectedAgent) return;
    try {
      setLoading(true);
      await api.agentPortal.claimOrder(selectedAgent.id, orderId, agentToken);
      alert('Order claimed successfully! It is now in My Deliveries.');
      // Switch tab and fetch
      setActiveTab('my_deliveries');
    } catch (err) {
      alert('Failed to claim order: ' + err.message);
    } finally {
      setLoading(false);
      fetchAvailableOrders(); // refresh in case it failed
    }
  }

  // 3. Track Agent GPS Location
  useEffect(() => {
    if (!selectedAgent) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setAgentLocation(coords);
        setViewState(prev => ({ ...prev, longitude: coords.lng, latitude: coords.lat }));
        
        // Sync to backend every 15 seconds
        const now = Date.now();
        if (now - lastSyncTime.current > 15000 && agentToken) {
          lastSyncTime.current = now;
          api.agentPortal.updateLocation(selectedAgent.id, coords.lat, coords.lng, agentToken)
            .catch(err => console.warn('Failed to sync location:', err));
        }
      },
      (err) => console.warn('GPS Error:', err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [selectedAgent]);

  // 4. Calculate Optimal Route via OSRM
  useEffect(() => {
    if (!selectedAgent || orders.length === 0) return;
    
    async function calculateRoute() {
      // Collect valid coordinates
      const stops = [];
      if (agentLocation) {
        stops.push(`${agentLocation.lng},${agentLocation.lat}`);
      }
      
      orders.forEach(o => {
        if (o.lng && o.lat) stops.push(`${o.lng},${o.lat}`);
      });

      if (stops.length < 2) return; // Need at least a start and an end

      try {
        const coordString = stops.join(';');
        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
        const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?overview=full&geometries=geojson&access_token=${mapboxToken}`);
        const data = await res.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          setRouteGeojson({
            type: 'Feature',
            properties: {},
            geometry: data.routes[0].geometry
          });
          
          // Fit map bounds to the exact coordinates of the route
          if (mapRef.current && data.routes[0].geometry.coordinates.length > 0) {
            const coords = data.routes[0].geometry.coordinates;
            const lngs = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);

            // Add slight padding so route isn't flush against the edges
            mapRef.current.fitBounds(
              [[minLng, minLat], [maxLng, maxLat]],
              { padding: 40, duration: 1000 }
            );
          } else if (!agentLocation && stops.length > 0) {
            // Fallback
            const firstStop = stops[0].split(',');
            setViewState(prev => ({ ...prev, longitude: parseFloat(firstStop[0]), latitude: parseFloat(firstStop[1]) }));
          }
        }
      } catch (err) {
        console.error('OSRM Route Calculation Failed:', err);
      }
    }

    calculateRoute();
  }, [orders, agentLocation]);

  const [optimizing, setOptimizing] = useState(false);

  async function handleOptimizeRoute() {
    if (orders.length < 2) return;
    setOptimizing(true);
    try {
      const data = {
        currentLat: agentLocation?.lat,
        currentLng: agentLocation?.lng,
        orders: orders
      };
      const res = await api.agentPortal.optimizeRoute(selectedAgent.id, data, agentToken);
      
      if (res.ok && res.sequence) {
        // Reorder the local state based on the AI's returned sequence of IDs
        const sorted = [...orders].sort((a, b) => {
          const idxA = res.sequence.indexOf(a.id);
          const idxB = res.sequence.indexOf(b.id);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        setOrders(sorted);
      }
    } catch (err) {
      alert('AI Optimization failed: ' + err.message);
    } finally {
      setOptimizing(false);
    }
  }

  async function handlePaymentToggle(orderId, currentStatus) {
    const newStatus = currentStatus === 'PENDING' ? 'COLLECTED' : 'PENDING';
    try {
      await api.agentPortal.updatePayment(selectedAgent.id, orderId, newStatus, agentToken);
      fetchOrders();
    } catch (err) {
      alert('Payment update failed: ' + err.message);
    }
  }

  async function handleMarkDelivered(orderId, podImage = null) {
    const otp = window.prompt(`Enter the 4-digit OTP provided by the customer to mark order as Delivered:`);
    if (!otp) return;
    if (!otp.match(/^\d{4}$/)) {
      alert('Invalid OTP format. Must be exactly 4 digits.');
      return;
    }
    try {
      await api.agentPortal.verifyDelivery(selectedAgent.id, orderId, otp, podImage, agentToken);
      fetchOrders();
      fetchStats(); // Update earnings after a successful delivery
    } catch (err) {
      alert('OTP Verification Failed: ' + err.message);
    }
  }

  const handleAuthSuccess = (agent, token) => {
    setAgentToken(token);
    setSelectedAgent(agent);
    localStorage.setItem('agentToken', token);
    localStorage.setItem('agentProfile', JSON.stringify(agent));
    setShowRegister(false);
  };

  const handleLogout = () => {
    setAgentToken(null);
    setSelectedAgent(null);
    setOrders([]);
    localStorage.removeItem('agentToken');
    localStorage.removeItem('agentProfile');
  };

  if (!agentToken || !selectedAgent) {
    if (showRegister) {
      return <AgentRegister onRegister={handleAuthSuccess} onGoToLogin={() => setShowRegister(false)} />;
    }
    return <AgentLogin onLogin={handleAuthSuccess} onGoToRegister={() => setShowRegister(true)} />;
  }

  return (
    <div style={{ fontFamily: FONT, background: theme.bg, minHeight: '100vh', paddingBottom: 40, color: theme.text, transition: 'background 0.3s' }}>
      {/* Header & Tabs */}
      <div style={{ background: theme.cardBg, padding: '20px 20px 0 20px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, zIndex: 10, transition: 'background 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 600, margin: '0 auto', paddingBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: theme.text }}>Agent Portal</h1>
            <p style={{ color: theme.subText, margin: '4px 0 0 0', fontSize: 13 }}>{selectedAgent.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <button onClick={toggleDarkMode} style={{ background: 'transparent', border: 'none', color: theme.subText, cursor: 'pointer', display: 'flex' }}>
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <LogIn size={16} style={{ transform: 'rotate(180deg)' }} /> Log out
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 20, maxWidth: 600, margin: '0 auto' }}>
          <button 
            onClick={() => setActiveTab('available')}
            style={{ 
              padding: '12px 0', border: 'none', background: 'transparent', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              color: activeTab === 'available' ? '#10b981' : '#6b7280',
              borderBottom: activeTab === 'available' ? '3px solid #10b981' : '3px solid transparent'
            }}
          >
            Available Orders
          </button>
          <button 
            onClick={() => setActiveTab('my_deliveries')}
            style={{ 
              padding: '12px 0', border: 'none', background: 'transparent', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              color: activeTab === 'my_deliveries' ? '#3b82f6' : '#6b7280',
              borderBottom: activeTab === 'my_deliveries' ? '3px solid #3b82f6' : '3px solid transparent'
            }}
          >
            My Deliveries ({orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('wallet')}
            style={{ 
              padding: '12px 0', border: 'none', background: 'transparent', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              color: activeTab === 'wallet' ? '#8b5cf6' : '#6b7280',
              borderBottom: activeTab === 'wallet' ? '3px solid #8b5cf6' : '3px solid transparent'
            }}
          >
            Wallet
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div style={{ background: '#10b981', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{agentStats.totalDeliveries}</div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>Deliveries</div>
        </div>
        <div style={{ width: 1, height: 40, background: '#fff', opacity: 0.3 }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>₹{agentStats.walletBalance}</div>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>Wallet Balance</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
        {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 20 }}>{error}</div>}
        
        {activeTab === 'available' && (
          <div>
            {loading && availableOrders.length === 0 ? <p style={{ textAlign: 'center', color: '#6b7280' }}>Finding available orders...</p> : null}
            {availableOrders.length === 0 && !loading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: theme.cardBg, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                <Package size={48} color={theme.subText} style={{ margin: '0 auto 16px' }} />
                <h3 style={{ margin: '0 0 8px 0', color: theme.text }}>No orders nearby</h3>
                <p style={{ margin: 0, color: theme.subText, fontSize: 14 }}>There are no unassigned orders currently available.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[...availableOrders]
                  .map(o => ({ ...o, distance: calculateDistance(agentLocation?.lat, agentLocation?.lng, o.lat, o.lng) }))
                  .sort((a, b) => (a.distance || 9999) - (b.distance || 9999))
                  .map(order => (
                  <div key={order.id} style={{ background: theme.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: theme.text }}>Order #{order.wix_order_id || order.id}</div>
                        <div style={{ color: theme.subText, fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={14} /> 
                          {order.distance !== null ? `${order.distance.toFixed(1)} km away` : 'Location unknown'}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#10b981', fontSize: 16 }}>₹{order.total_price}</div>
                    </div>
                    <div style={{ color: theme.text, fontSize: 14, background: theme.accentBg, padding: 10, borderRadius: 8 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Delivery Address:</div>
                      {order.address_line || 'No address provided'}
                    </div>
                    <button 
                      onClick={() => handleClaimOrder(order.id)}
                      disabled={loading}
                      style={{ background: '#10b981', color: '#fff', border: 'none', padding: 12, borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 4 }}
                    >
                      {loading ? 'Claiming...' : 'Claim Order'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'my_deliveries' && (
          <>
            {/* Dynamic MapLibre Map */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: 24, border: '1px solid #e5e7eb', height: 350, position: 'relative' }}>
          <Map
            ref={mapRef}
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            mapStyle={`mapbox://styles/mapbox/streets-v12`}
            mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
          >
            <NavigationControl position="top-right" />
            
            {/* Draw The Driving Route */}
            {routeGeojson && (
              <Source id="route" type="geojson" data={routeGeojson}>
                <Layer 
                  id="route-line"
                  type="line"
                  layout={{
                    'line-join': 'round',
                    'line-cap': 'round'
                  }}
                  paint={{
                    'line-color': '#3b82f6',
                    'line-width': 4,
                    'line-opacity': 0.8
                  }}
                />
              </Source>
            )}

            {/* Agent Live Location Marker */}
            {agentLocation && (
              <Marker longitude={agentLocation.lng} latitude={agentLocation.lat} anchor="bottom">
                <div style={{ width: 24, height: 24, background: '#ef4444', border: '3px solid #fff', borderRadius: '50%', boxShadow: '0 0 10px rgba(0,0,0,0.3)' }} />
              </Marker>
            )}

            {/* Customer Order Markers */}
            {orders.map((o, index) => {
              if (!o.lat || !o.lng) return null;
              return (
                <Marker key={o.id} longitude={parseFloat(o.lng)} latitude={parseFloat(o.lat)} anchor="bottom">
                  <div style={{ background: '#10b981', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, boxShadow: '0 2px 5px rgba(0,0,0,0.2)', border: '2px solid #fff' }}>
                    {index + 1}
                  </div>
                </Marker>
              );
            })}
          </Map>
        </div>

        {orders.length > 1 && (
          <button 
            onClick={handleOptimizeRoute} 
            disabled={optimizing}
            style={{ 
              width: '100%', padding: '14px 20px', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', 
              color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, 
              cursor: optimizing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', gap: 8, marginBottom: 24, boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
            }}
          >
            <Sparkles size={18} /> {optimizing ? 'AI is analyzing route...' : 'Optimize Sequence with AI'}
          </button>
        )}

        {loading ? <p style={{ textAlign: 'center' }}>Loading orders...</p> : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: theme.cardBg, borderRadius: 16 }}>
            <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ margin: 0, color: theme.text }}>All Done!</h2>
            <p style={{ color: theme.subText, margin: '8px 0 0' }}>You have no pending deliveries.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map((order, index) => (
              <div key={order.id} style={{ background: theme.cardBg, borderRadius: 16, padding: 20, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                      Stop {index + 1}
                    </span>
                    <h3 style={{ margin: '8px 0 4px 0', fontSize: 18, color: theme.text, fontWeight: 800 }}>Order #{order.wix_order_id}</h3>
                    <p style={{ margin: 0, color: theme.subText, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={14} /> {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>₹{order.total_price}</div>
                    <div style={{ fontSize: 12, color: theme.subText, fontWeight: 600 }}>Total Value</div>
                    <button 
                      onClick={() => setShowModifyModal(order)}
                      style={{ marginTop: 8, padding: '4px 8px', borderRadius: 4, border: `1px solid ${theme.border}`, background: theme.accentBg, color: theme.text, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Modify Order
                    </button>
                  </div>
                </div>

                <div style={{ background: theme.accentBg, padding: 12, borderRadius: 8, marginBottom: 16, border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <MapPin size={18} color="#ef4444" style={{ marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Delivery Address</div>
                      <div style={{ fontSize: 14, color: theme.subText, lineHeight: 1.5 }}>
                        {order.address_line}
                        {!order.lat && <span style={{ display: 'block', color: '#f59e0b', fontSize: 12, marginTop: 4 }}>⚠️ Exact GPS location not found</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                  <a href={`tel:+${order.user_phone}`} style={{ flex: 1, minWidth: '30%', padding: '10px 0', background: theme.accentBg, color: theme.text, borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Phone size={16} /> Call
                  </a>
                  <a href={`https://wa.me/${order.user_phone}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: '30%', padding: '10px 0', background: '#dcfce7', color: '#166534', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    WhatsApp
                  </a>
                  {order.lat && order.lng && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: '30%', padding: '10px 0', background: '#e0e7ff', color: '#3730a3', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Navigation size={16} /> Navigate
                    </a>
                  )}
                </div>

                <hr style={{ border: 'none', borderTop: `1px dashed ${theme.border}`, margin: '0 0 20px 0' }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={20} color={order.payment_status === 'COLLECTED' ? '#10b981' : '#f59e0b'} />
                    <span style={{ fontWeight: 700, color: theme.text }}>Payment</span>
                  </div>
                  <button 
                    onClick={() => handlePaymentToggle(order.id, order.payment_status)}
                    style={{ 
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                      background: order.payment_status === 'COLLECTED' ? '#10b981' : (isDarkMode ? '#3f2a14' : '#fef3c7'),
                      color: order.payment_status === 'COLLECTED' ? '#fff' : (isDarkMode ? '#fcd34d' : '#92400e'),
                    }}
                  >
                    {order.payment_status === 'COLLECTED' ? '✓ COLLECTED' : 'MARK COLLECTED'}
                  </button>
                </div>
                
                {/* POD Image Upload */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', width: '100%', padding: 12, background: podImages[order.id] ? '#dcfce7' : theme.accentBg, color: podImages[order.id] ? '#166534' : theme.text, border: `1px dashed ${podImages[order.id] ? '#10b981' : theme.border}`, borderRadius: 8, textAlign: 'center', fontWeight: 600, cursor: 'pointer' }}>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleCameraCapture(order.id, e)} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Camera size={18} /> {podImages[order.id] ? 'Photo Captured ✓ (Tap to retake)' : 'Take Delivery Photo (Optional)'}
                    </div>
                  </label>
                  {podImages[order.id] && (
                    <img src={podImages[order.id]} alt="POD Preview" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} />
                  )}
                </div>

                <SwipeButton 
                  label="Swipe to Deliver" 
                  onSwipeComplete={() => handleMarkDelivered(order.id, podImages[order.id])} 
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'wallet' && (
          <div style={{ background: theme.cardBg, borderRadius: 16, padding: 20, border: `1px solid ${theme.border}`, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CreditCard size={32} color="#8b5cf6" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: theme.text, margin: '0 0 8px 0' }}>Your Wallet</h2>
            <p style={{ color: theme.subText, fontSize: 14, margin: '0 0 24px 0' }}>Manage your delivery earnings and payouts.</p>
            
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Available Balance</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>₹{agentStats.walletBalance}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Total Ever Earned</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#334155' }}>₹{agentStats.totalEarnings}</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Total Payouts</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#334155' }}>₹{agentStats.totalPaid}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: theme.subText, marginTop: 24, fontStyle: 'italic' }}>
              Payouts are settled directly to your bank account. Contact admin to mark balance as paid.
            </p>
          </div>
        )}
        </>
        )}

        {showModifyModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: theme.cardBg, borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, border: `1px solid ${theme.border}` }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: theme.text, fontWeight: 800 }}>Modify Order #{showModifyModal.wix_order_id}</h2>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: theme.subText }}>Customer returning items? Specify rejected quantities below.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
                {showModifyModal.items && showModifyModal.items.map((item, idx) => (
                  <div key={idx} style={{ background: theme.accentBg, padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${theme.border}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{item.product_name}</div>
                      <div style={{ fontSize: 12, color: theme.subText }}>Ordered: {item.quantity} | ₹{item.price}/ea</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: theme.subText }}>REJECT QTY</label>
                      <input 
                        type="number" 
                        min="0" 
                        max={item.quantity}
                        value={rejectItems[item.product_name] || ''}
                        onChange={(e) => setRejectItems({ ...rejectItems, [item.product_name]: parseInt(e.target.value) || 0 })}
                        style={{ width: 50, padding: '6px', borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.text, textAlign: 'center' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  onClick={() => { setShowModifyModal(null); setRejectItems({}); }}
                  style={{ flex: 1, padding: 12, background: theme.accentBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleModifyOrder(showModifyModal.id)}
                  style={{ flex: 1, padding: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Bill
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
