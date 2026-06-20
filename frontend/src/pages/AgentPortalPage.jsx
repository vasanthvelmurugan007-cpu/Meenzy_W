import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { Package, CheckCircle, MapPin, Phone, CreditCard, Clock, LogIn, Navigation, ArrowRight, Sparkles, Moon, Sun, Camera, Trash2 } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl/maplibre';

// Helper to decode Google Polyline from Ola Maps
function decodePolyline(str, precision = 5) {
  let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null;
  let latitude_change, longitude_change, factor = Math.pow(10, precision);
  while (index < str.length) {
    byte = null; shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    shift = result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change; lng += longitude_change;
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}
import { C, FONT } from '../constants';
import AgentLogin from './AgentLogin';
import AgentRegister from './AgentRegister';
import { io } from 'socket.io-client';

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
  const [activeTab, setActiveTab] = useState('my_deliveries');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [agentStats, setAgentStats] = useState({ totalDeliveries: 0, totalEarnings: 0, walletBalance: 0, totalPaid: 0, earningsByDay: [] });
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('agentDarkMode') === 'true');
  const [podImages, setPodImages] = useState({}); // { orderId: base64String }
  const [showModifyModal, setShowModifyModal] = useState(null);
  const [rejectItems, setRejectItems] = useState({});
  const lastSyncTime = useRef(0);

  // Temporary test stops state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearchLocation = async () => {
    if (!searchQuery) return;
    setSearching(true);
    try {
      const olaMapsToken = import.meta.env.VITE_OLA_MAPS_KEY || import.meta.env.VITE_OLA_MAPS_API_KEY || import.meta.env.VITE_MAPBOX_TOKEN;
      const res = await fetch(`https://api.olamaps.io/places/v1/geocode?address=${encodeURIComponent(searchQuery)}&api_key=${olaMapsToken}`);
      const data = await res.json();
      const features = (data.geocodingResults || []).map(p => ({
        id: p.place_id || Math.random().toString(),
        place_name: p.formatted_address,
        center: [p.geometry.location.lng, p.geometry.location.lat]
      }));
      setSearchResults(features);
    } catch (err) {
      console.error('Geocoding failed', err);
    } finally {
      setSearching(false);
    }
  };

  const addTestStop = (feature) => {
    const [lng, lat] = feature.center;
    const fakeOrder = {
      id: 'test_stop_' + Date.now(),
      wix_order_id: 'TEST-' + Math.floor(Math.random() * 1000),
      created_at: new Date().toISOString(),
      total_price: 0,
      address_line: feature.place_name,
      lat: lat,
      lng: lng,
      payment_status: 'COLLECTED',
      user_phone: '0000000000'
    };
    setOrders(prev => [...prev, fakeOrder]);
    setSearchResults([]);
    setSearchQuery('');
  };

  const removeTestStop = (id) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  };

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
  const initialFitDone = useRef(false);
  const [agentLocation, setAgentLocation] = useState(null); // {lat, lng}
  const [allRoutes, setAllRoutes] = useState([]); // Store alternative routes
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [etas, setEtas] = useState({}); // { orderId: '10:15 AM' }
  const [currentInstruction, setCurrentInstruction] = useState(null);
  const [isDriveMode, setIsDriveMode] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [lastBearing, setLastBearing] = useState(0);

  const isDriveModeRef = useRef(isDriveMode);
  useEffect(() => {
    isDriveModeRef.current = isDriveMode;
    // Instantly snap to agent when Drive Mode is turned ON
    if (isDriveMode && agentLocation) {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [agentLocation.lng, agentLocation.lat],
          zoom: 18,
          pitch: 60,
          bearing: lastBearing,
          duration: 1000
        });
      }
    }
  }, [isDriveMode, agentLocation, lastBearing]);

  // Fallback map center if no GPS
  const [viewState, setViewState] = useState({
    longitude: 77.5946,
    latitude: 12.9716,
    zoom: 11
  });

  // We no longer fetch a public list of agents.
  // 1. Session check on mount
  useEffect(() => {
    if (agentToken) {
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
  }, [agentToken]);

  // 2. Fetch Orders for Selected Agent
  useEffect(() => {
    if (selectedAgent && agentToken) {
      fetchOrders();
      fetchStats();

      // Connect to Socket.io for real-time order routing
      const socket = io(import.meta.env.VITE_BACKEND_URL || window.location.origin, {
        path: '/socket.io'
      });

      socket.on('connect', () => {
        console.log('[AgentPortal] Connected to live routing socket');
        socket.emit('join_delivery_agents');
      });

      socket.on('new_order', (newOrder) => {
        console.log('[AgentPortal] Live order received:', newOrder);
        setOrders(prev => {
          // Avoid duplicate appends
          if (prev.some(o => o.id === newOrder.id)) return prev;
          return [...prev, newOrder];
        });
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [selectedAgent, agentToken]);

  async function fetchStats(silent = false) {
    if (!agentToken || !selectedAgent) return;
    try {
      const data = await api.agentPortal.getStats(selectedAgent.id, agentToken);
      if (data.ok) {
        setAgentStats(data.stats);
        localStorage.setItem(`agentStatsCache_${selectedAgent.id}`, JSON.stringify(data.stats));
      }
    } catch (err) {
      console.error('Failed to load stats', err);
      const cached = localStorage.getItem(`agentStatsCache_${selectedAgent.id}`);
      if (cached) {
        setAgentStats(JSON.parse(cached));
      } else if (err.message && err.message.includes('401')) {
        handleLogout();
      }
    }
  }

  async function fetchOrders(silent = false) {
    if (!agentToken || !selectedAgent) return;
    try {
      if (!silent) setLoading(true);
      const data = await api.agentPortal.getOrders(selectedAgent.id, agentToken);
      let newOrders = data.orders || [];
      
      // Prevent race conditions by instantly applying the optimized sequence
      const latestSequence = optimizedSequenceRef.current;
      if (latestSequence && latestSequence.length > 0) {
        newOrders.sort((a, b) => {
          const idxA = latestSequence.indexOf(a.id);
          const idxB = latestSequence.indexOf(b.id);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
      }
      setOrders(newOrders);
      localStorage.setItem(`agentOrdersCache_${selectedAgent.id}`, JSON.stringify(newOrders));
    } catch (err) {
      const cached = localStorage.getItem(`agentOrdersCache_${selectedAgent?.id}`);
      if (cached) {
        setOrders(JSON.parse(cached));
      } else {
        if (err.message.includes('Unauthorized') || err.message.includes('401')) handleLogout();
        else if (!silent) setError('Failed to load your orders.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }



  // 3. Track Agent GPS Location
  useEffect(() => {
    if (!selectedAgent) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        
        setAgentLocation(prevLoc => {
          let bearing = lastBearing;
          if (prevLoc) {
            const dist = calculateDistance(prevLoc.lat, prevLoc.lng, coords.lat, coords.lng);
            if (dist > 0.002) { // update bearing if moved more than 2 meters
              const y = Math.sin((coords.lng - prevLoc.lng) * Math.PI / 180) * Math.cos(coords.lat * Math.PI / 180);
              const x = Math.cos(prevLoc.lat * Math.PI / 180) * Math.sin(coords.lat * Math.PI / 180) -
                        Math.sin(prevLoc.lat * Math.PI / 180) * Math.cos(coords.lat * Math.PI / 180) * Math.cos((coords.lng - prevLoc.lng) * Math.PI / 180);
              bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
              setLastBearing(bearing);
            }
          }
          
          if (isDriveModeRef.current) {
            if (mapRef.current) {
              mapRef.current.easeTo({
                center: [coords.lng, coords.lat],
                zoom: 18,
                pitch: 60,
                bearing,
                duration: 1000
              });
            }
          }
          
          return coords;
        });
        
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
        const origin = stops[0].split(',').reverse().join(','); // lat,lng
        const destination = stops[stops.length-1].split(',').reverse().join(',');
        const waypoints = stops.slice(1, -1).map(s => s.split(',').reverse().join(',')).join('|');
        
        const res = await api.agentPortal.olaRouting({
          origin,
          destination,
          waypoints: waypoints || undefined
        }, agentToken);
        
        const data = res;
        
        if (data.status === 'SUCCESS' && data.routes && data.routes.length > 0) {
          // Normalize Ola Maps response to match our expected format
          const normalizedRoutes = data.routes.map(r => ({
            geometry: { type: 'LineString', coordinates: decodePolyline(r.overview_polyline) },
            legs: r.legs || [],
            duration: (r.legs || []).reduce((acc, l) => acc + l.duration, 0)
          }));
          
          setAllRoutes(normalizedRoutes);
          setSelectedRouteIndex(0);
          const route = normalizedRoutes[0];

          // Fit map bounds if not in drive mode
          if (!isDriveModeRef.current) {
            if (mapRef.current && route.geometry.coordinates.length > 0) {
              const coords = route.geometry.coordinates;
              const lngs = coords.map(c => c[0]);
              const lats = coords.map(c => c[1]);
              const minLng = Math.min(...lngs);
              const maxLng = Math.max(...lngs);
              const minLat = Math.min(...lats);
              const maxLat = Math.max(...lats);

              if (!initialFitDone.current) {
                mapRef.current.fitBounds(
                  [[minLng, minLat], [maxLng, maxLat]],
                  { padding: 40, duration: 1000, maxZoom: 15 }
                );
                initialFitDone.current = true;
              }
            } else if (!agentLocation && stops.length > 0) {
              const firstStop = stops[0].split(',');
              if (!initialFitDone.current) {
                if (mapRef.current) {
                  mapRef.current.flyTo({ center: [parseFloat(firstStop[0]), parseFloat(firstStop[1])], zoom: 14 });
                } else {
                  setViewState(prev => ({ ...prev, longitude: parseFloat(firstStop[0]), latitude: parseFloat(firstStop[1]) }));
                }
                initialFitDone.current = true;
              }
            }
          }
        }
      } catch (err) {
        console.error('OSRM Route Calculation Failed:', err);
      }
    }

    calculateRoute();
  }, [orders, agentLocation]);

  // Recalculate ETAs when route selection changes
  useEffect(() => {
    if (allRoutes.length === 0) return;
    const route = allRoutes[selectedRouteIndex];
    if (route && route.legs && route.legs.length > 0) {
      let currentTime = Date.now();
      const newEtas = {};
      
      if (route.legs[0].steps && route.legs[0].steps.length > 0) {
        const firstStep = route.legs[0].steps[0];
        setCurrentInstruction(firstStep.bannerInstructions?.length ? firstStep.bannerInstructions[0].primary.text : firstStep.maneuver.instruction);
      }

      if (route.legs[0].steps && route.legs[0].steps.length > 0) {
        const firstStep = route.legs[0].steps[0];
        setCurrentInstruction(firstStep.instructions || firstStep.maneuver?.instruction || 'Drive to destination');
      }

      let validOrderIndex = 0;
      const validOrders = orders.filter(o => o.lat && o.lng);

      route.legs.forEach(leg => {
        currentTime += (leg.duration * 1000) + (5 * 60 * 1000); // drive time + 5 min dropoff
        if (validOrders[validOrderIndex]) {
           newEtas[validOrders[validOrderIndex].id] = new Date(currentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
           validOrderIndex++;
        }
      });
      setEtas(newEtas);
    }
  }, [allRoutes, selectedRouteIndex, orders]);

  const [optimizing, setOptimizing] = useState(false);
  const [optimizedSequence, setOptimizedSequence] = useState(null);
  const optimizedSequenceRef = useRef(null);

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
        setOptimizedSequence(res.sequence);
        optimizedSequenceRef.current = res.sequence;
        
        // Immediately apply to current state to trigger redraw without waiting for next auto-sync
        const sorted = [...orders].sort((a, b) => {
          const idxA = res.sequence.indexOf(a.id);
          const idxB = res.sequence.indexOf(b.id);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        setOrders(sorted);
      } else {
        alert('Could not optimize sequence. Try again.');
      }
    } catch (err) {
      console.error(err);
      alert('Optimization failed. Server error.');
    } finally {
      setOptimizing(false);
    }
  }

  async function handleStartRoute() {
    if (orders.length === 0) return;
    
    // Generate the Google Maps URL
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1${agentLocation ? `&origin=${agentLocation.lat},${agentLocation.lng}` : ''}&destination=${orders[orders.length-1].lat ? `${orders[orders.length-1].lat},${orders[orders.length-1].lng}` : ''}&waypoints=${orders.slice(0, -1).filter(o => o.lat && o.lng).map(o => `${o.lat},${o.lng}`).join('|')}`;
    
    // Attempt to notify backend to trigger WhatsApp templates
    try {
      setOptimizing(true); // Reuse optimizing state for loading indicator
      await api.agentPortal.startRoute(selectedAgent.id, { orders }, agentToken);
    } catch (err) {
      console.error('Failed to send WhatsApp templates on start route:', err);
    } finally {
      setOptimizing(false);
      // Open maps immediately after
      window.open(googleMapsUrl, '_blank');
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
    const order = orders.find(o => o.id === orderId);
    if (order && order.lat && order.lng && agentLocation) {
      const dist = calculateDistance(agentLocation.lat, agentLocation.lng, parseFloat(order.lat), parseFloat(order.lng));
      if (dist > 0.1) {
        const distMeters = Math.round(dist * 1000);
        const force = window.confirm(`Geo-fence Warning: You are ${distMeters} meters away from the delivery location! Expected within 100m.\n\nClick OK to Force Override (Test Mode) or Cancel.`);
        if (!force) return;
      }
    }

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
    <div style={{ fontFamily: FONT, background: theme.bg, height: '100vh', overflowY: 'auto', paddingBottom: 40, color: theme.text, transition: 'background 0.3s' }}>
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
            style={{ 
              padding: '12px 0', border: 'none', background: 'transparent', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              color: '#3b82f6',
              borderBottom: '3px solid #3b82f6'
            }}
          >
            My Deliveries Dashboard ({orders.length})
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

      {/* Day-Wise Earnings */}
      {agentStats.earningsByDay && agentStats.earningsByDay.length > 0 && (
        <div style={{ background: theme.accentBg, padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.subText, textTransform: 'uppercase', marginBottom: 8 }}>Recent Earnings</div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {agentStats.earningsByDay.map((day, idx) => (
              <div key={idx} style={{ background: theme.cardBg, padding: '8px 16px', borderRadius: 8, border: `1px solid ${theme.border}`, minWidth: 100, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: theme.subText, marginBottom: 4 }}>{day.date}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>₹{day.earnings}</div>
                <div style={{ fontSize: 10, color: theme.subText }}>{day.deliveries} orders</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
        {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 20 }}>{error}</div>}
        
        <div style={{ background: theme.cardBg, padding: 16, borderRadius: 12, marginBottom: 16, border: `1px solid ${theme.border}` }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Add Test Stop</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input 
              type="text" 
              placeholder="Search location..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.accentBg, color: theme.text }}
            />
            <button onClick={handleSearchLocation} disabled={searching} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8 }}>
              {searching ? '...' : 'Search'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
              {searchResults.map(f => (
                <div key={f.id} onClick={() => addTestStop(f)} style={{ padding: 8, background: theme.accentBg, borderRadius: 6, fontSize: 13, cursor: 'pointer', border: `1px solid ${theme.border}` }}>
                  {f.place_name}
                </div>
              ))}
            </div>
          )}
          
          {orders.filter(o => o.id.startsWith('test_stop_')).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.subText, marginBottom: 8, textTransform: 'uppercase' }}>Active Test Stops</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {orders.filter(o => o.id.startsWith('test_stop_')).map(stop => (
                  <div key={stop.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, background: theme.bg, borderRadius: 6, fontSize: 13, border: `1px solid ${theme.border}` }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8 }}>{stop.address_line}</span>
                    <button onClick={() => removeTestStop(stop.id)} style={{ padding: 4, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dynamic MapLibre Map */}
        <div style={{ 
          background: '#fff', 
          borderRadius: isDriveMode ? 0 : 16, 
          overflow: 'hidden', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
          marginBottom: isDriveMode ? 0 : 24, 
          border: '1px solid #e5e7eb', 
          height: isDriveMode ? '100vh' : 400, 
          position: isDriveMode ? 'fixed' : 'relative',
          top: isDriveMode ? 0 : 'auto',
          left: isDriveMode ? 0 : 'auto',
          right: isDriveMode ? 0 : 'auto',
          bottom: isDriveMode ? 0 : 'auto',
          zIndex: isDriveMode ? 9999 : 1
        }}>
          
          {/* Turn-by-Turn Instruction Banner */}
          {currentInstruction && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, background: 'rgba(17, 24, 39, 0.9)', color: '#fff', padding: '12px 16px', borderRadius: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12, backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              <Navigation size={20} color="#3b82f6" />
              <div style={{ fontWeight: 700, fontSize: 14 }}>{currentInstruction}</div>
            </div>
          )}

          {/* Drive Mode Toggle */}
          <button 
            onClick={() => setIsDriveMode(!isDriveMode)}
            style={{ position: 'absolute', top: currentInstruction ? 70 : 12, right: 12, zIndex: 10, background: isDriveMode ? '#10b981' : theme.cardBg, color: isDriveMode ? '#fff' : theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Navigation size={14} /> {isDriveMode ? 'Drive Mode ON' : 'Start Drive Mode'}
          </button>
          
          <Map
            ref={mapRef}
            mapLib={maplibregl}
            initialViewState={viewState}
            mapStyle={`https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json`}
            transformRequest={(url, resourceType) => {
              if (url.includes('api.olamaps.io')) {
                const olaToken = import.meta.env.VITE_OLA_MAPS_KEY || import.meta.env.VITE_OLA_MAPS_API_KEY || import.meta.env.VITE_MAPBOX_TOKEN;
                return { url: `${url}${url.includes('?') ? '&' : '?'}api_key=${olaToken}` };
              }
            }}
          >
            <NavigationControl position="bottom-right" />
            
            {/* Draw The Driving Routes (Render unselected first, so selected is on top) */}
            {[...allRoutes].reverse().map((route, reversedIndex) => {
              const originalIndex = allRoutes.length - 1 - reversedIndex;
              const isSelected = originalIndex === selectedRouteIndex;
              return (
                <Source key={`route-source-${originalIndex}`} id={`route-${originalIndex}`} type="geojson" data={{ type: 'Feature', properties: {}, geometry: route.geometry }}>
                  <Layer 
                    id={`route-line-${originalIndex}`}
                    source={`route-${originalIndex}`}
                    type="line"
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round'
                    }}
                    paint={{
                      'line-color': isSelected ? '#3b82f6' : '#9ca3af',
                      'line-width': isSelected ? 5 : 3,
                      'line-opacity': isSelected ? 1 : 0.6
                    }}
                  />
                </Source>
              );
            })}

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
                  <div onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                    {etas[o.id] && (
                      <div style={{ background: '#3b82f6', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 10, marginBottom: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                        {etas[o.id]}
                      </div>
                    )}
                    <div style={{ background: '#10b981', color: '#fff', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, boxShadow: '0 2px 5px rgba(0,0,0,0.2)', border: selectedOrder?.id === o.id ? '3px solid #3b82f6' : '2px solid #fff' }}>
                      {index + 1}
                    </div>
                  </div>
                </Marker>
              );
            })}

            {/* Interactive Popup Overlay inside Map Container */}
            {selectedOrder && (
              <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, background: theme.cardBg, borderRadius: 16, padding: 16, zIndex: 20, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: theme.text }}>Order #{selectedOrder.wix_order_id || String(selectedOrder.id).split('-')[0].toUpperCase()}</h4>
                    {selectedOrder.customer_name && <p style={{ margin: '4px 0 0 0', fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{selectedOrder.customer_name}</p>}
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: theme.subText, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{selectedOrder.address_line}</p>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} style={{ background: theme.accentBg, border: 'none', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={`tel:+${selectedOrder.user_phone}`} style={{ flex: 1, padding: '8px 0', background: '#e0e7ff', color: '#3730a3', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Phone size={14} /> Call
                  </a>
                  <a href={`https://wa.me/${selectedOrder.user_phone}`} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '8px 0', background: '#dcfce7', color: '#166534', borderRadius: 8, textAlign: 'center', textDecoration: 'none', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    WhatsApp
                  </a>
                </div>
              </div>
            )}
          </Map>
          
          {/* Alternative Routes Selector Overlay */}
          {allRoutes.length > 1 && (
            <div style={{ position: 'absolute', bottom: 35, left: 12, right: 50, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {allRoutes.map((route, idx) => (
                <button 
                  key={idx}
                  onClick={() => setSelectedRouteIndex(idx)}
                  style={{ 
                    flex: '0 0 auto', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: 'none',
                    background: selectedRouteIndex === idx ? '#3b82f6' : theme.cardBg, 
                    color: selectedRouteIndex === idx ? '#fff' : theme.text,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontWeight: 700, fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center'
                  }}
                >
                  <div>Route {idx + 1}</div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>{Math.round(route.duration / 60)} min</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {orders.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            <button 
              onClick={handleOptimizeRoute} 
              disabled={optimizing}
              style={{ 
                width: '100%', padding: '14px 20px', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', 
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, 
                cursor: optimizing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', gap: 8, boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
              }}
            >
              <Sparkles size={18} /> {optimizing ? 'AI is analyzing route...' : 'Optimize Sequence with AI'}
            </button>
            
            <button 
              onClick={handleStartRoute}
              disabled={optimizing}
              style={{ 
                width: '100%', padding: '14px 20px', background: '#10b981', 
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, 
                cursor: optimizing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', gap: 8, boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Navigation size={18} /> Start Driving (Multi-Stop Maps)
            </button>
          </div>
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
                    <h3 style={{ margin: '8px 0 4px 0', fontSize: 18, color: theme.text, fontWeight: 800 }}>Order #{order.wix_order_id || String(order.id).split('-')[0].toUpperCase()}</h3>
                    {order.customer_name && <p style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{order.customer_name}</p>}
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
                    <CreditCard size={20} color={order.payment_status === 'PAID' ? '#10b981' : (order.payment_status === 'COLLECTED' ? '#10b981' : '#f59e0b')} />
                    <span style={{ fontWeight: 700, color: theme.text }}>
                      Payment {order.payment_status === 'COD' && <span style={{ color: '#ef4444' }}>(COD)</span>}
                    </span>
                  </div>
                  {order.payment_status === 'PAID' ? (
                    <div style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
                      ✓ PAID ONLINE
                    </div>
                  ) : (
                    <button 
                      onClick={() => handlePaymentToggle(order.id, order.payment_status)}
                      style={{ 
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                        background: order.payment_status === 'COLLECTED' ? '#10b981' : (isDarkMode ? '#3f2a14' : '#fef3c7'),
                        color: order.payment_status === 'COLLECTED' ? '#fff' : (isDarkMode ? '#fcd34d' : '#92400e'),
                      }}
                    >
                      {order.payment_status === 'COLLECTED' ? '✓ COLLECTED CASH' : (order.payment_status === 'COD' ? 'COLLECT CASH (COD)' : 'MARK COLLECTED')}
                    </button>
                  )}
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


        {showModifyModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: theme.cardBg, borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, border: `1px solid ${theme.border}` }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: theme.text, fontWeight: 800 }}>Modify Order #{showModifyModal.wix_order_id || String(showModifyModal.id).split('-')[0].toUpperCase()}</h2>
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
