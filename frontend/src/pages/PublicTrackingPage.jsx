import React, { useState, useEffect } from 'react';

import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Package, Navigation, Phone, CheckCircle, Clock, Check, Map as MapIcon, MapPin } from 'lucide-react';

const FONT = "'Inter', sans-serif";

export default function PublicTrackingPage() {
  // Parse URL natively since we don't have a Router context
  const hash = window.location.hash || '';
  const orderIdMatch = hash.match(/^#\/track\/([^?]+)/);
  const orderId = orderIdMatch ? orderIdMatch[1] : null;
  const searchParams = new URLSearchParams(hash.split('?')[1] || '');
  const phoneVerification = searchParams.get('phone');

  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN;

  useEffect(() => {
    fetchTrackingData();
    // Poll every 10 seconds to get updated agent location
    const interval = setInterval(() => {
      fetchTrackingData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [orderId, phoneVerification]);

  async function fetchTrackingData(silent = false) {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/tracking/${orderId}?phone=${phoneVerification}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setOrderData(data.order);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError('Failed to load tracking data. Please ensure you clicked the exact link from your SMS/WhatsApp.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Fetch route when coordinates are available
  useEffect(() => {
    if (orderData && orderData.agent?.lat && orderData.agent?.lng && orderData.lat && orderData.lng && mapToken) {
      fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${orderData.agent.lng},${orderData.agent.lat};${orderData.lng},${orderData.lat}?geometries=geojson&access_token=${mapToken}`
      )
        .then(r => r.json())
        .then(data => {
          if (data.routes && data.routes.length > 0) {
            setRouteGeoJSON(data.routes[0].geometry);
          }
        })
        .catch(console.error);
    }
  }, [orderData?.agent?.lat, orderData?.agent?.lng, orderData?.lat, orderData?.lng, mapToken]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: FONT }}>Loading your live delivery status...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', fontFamily: FONT, color: 'red' }}>{error}</div>;
  if (!orderData) return null;

  const isDelivered = orderData.status === 'DELIVERED';
  const hasAgentLocation = orderData.agent && orderData.agent.lat && orderData.agent.lng;

  // Status mapping
  const isOutForDelivery = ['DISPATCHED_TO_3PL', 'DELIVERED'].includes(orderData.status || '');
  const steps = [
    { label: 'Order Confirmed', completed: true },
    { label: 'Out for Delivery', completed: isOutForDelivery },
    { label: 'Delivered', completed: isDelivered }
  ];

  const canRenderMap = hasAgentLocation && mapToken;

  return (
    <div style={{ fontFamily: FONT, background: '#f9fafb', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1f2937' }}>Meenzy Fresh Catch</h1>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Package size={14} /> Order #{(orderData.id || orderId || '').slice(-6)}
        </div>
      </div>

      {/* Map Section */}
      <div style={{ flex: 1, position: 'relative', background: '#e5e7eb', minHeight: 300 }}>
        {canRenderMap ? (
          <Map
            initialViewState={{
              longitude: parseFloat(orderData.agent.lng),
              latitude: parseFloat(orderData.agent.lat),
              zoom: 14
            }}
            mapStyle={`mapbox://styles/mapbox/streets-v12`}
            mapboxAccessToken={mapToken}
          >
            <NavigationControl position="top-right" />
            
            {routeGeoJSON && (
              <Source type="geojson" data={{ type: 'Feature', properties: {}, geometry: routeGeoJSON }}>
                <Layer
                  id="route-line"
                  type="line"
                  layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                  paint={{ 'line-color': '#3b82f6', 'line-width': 4, 'line-dasharray': [2, 2] }}
                />
              </Source>
            )}
            
            {/* Delivery Destination Marker */}
            {orderData.lat && orderData.lng && (
              <Marker longitude={parseFloat(orderData.lng)} latitude={parseFloat(orderData.lat)} anchor="bottom">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ background: '#ef4444', color: '#fff', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', border: '2px solid #fff' }}>
                    <MapPin size={16} />
                  </div>
                </div>
              </Marker>
            )}
            
            {/* Agent Marker */}
            <Marker longitude={parseFloat(orderData.agent.lng)} latitude={parseFloat(orderData.agent.lat)} anchor="bottom">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ background: '#10b981', color: '#fff', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', border: '2px solid #fff' }}>
                  <Navigation size={16} style={{ transform: 'rotate(45deg)' }} />
                </div>
              </div>
            </Marker>
          </Map>
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#6b7280', padding: 20, textAlign: 'center' }}>
            <MapIcon size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Live Map Unavailable</p>
            <p style={{ margin: '8px 0 0 0', fontSize: 14 }}>
              {!mapToken ? "Map system is currently offline." : "We will show the live map once the driver is dispatched."}
            </p>
          </div>
        )}
      </div>

      {/* Order Info Card (Bottom Sheet style on mobile) */}
      <div style={{ background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, marginTop: -20, position: 'relative', zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: isDelivered ? '#ecfdf5' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDelivered ? '#10b981' : '#3b82f6' }}>
            {isDelivered ? <CheckCircle size={24} /> : <Clock size={24} />}
          </div>
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 800, color: '#1f2937' }}>
              {isDelivered ? 'Order Delivered!' : 'Arriving Soon'}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
              {isDelivered ? 'Enjoy your fresh catch!' : (orderData.status || '').replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        {/* Progress Timeline */}
        <div style={{ margin: '0 0 24px 0', padding: '0 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 14, left: 20, right: 20, height: 4, background: '#e5e7eb', zIndex: 0, borderRadius: 2 }} />
            <div style={{ position: 'absolute', top: 14, left: 20, width: isDelivered ? 'calc(100% - 40px)' : isOutForDelivery ? 'calc(50% - 20px)' : '0%', height: 4, background: '#10b981', zIndex: 1, borderRadius: 2, transition: 'width 0.5s ease' }} />
            
            {steps.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: 80 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: step.completed ? '#10b981' : '#fff', border: step.completed ? '2px solid #10b981' : '2px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: step.completed ? '#fff' : '#d1d5db', marginBottom: 8, transition: 'all 0.3s ease', boxShadow: step.completed ? '0 0 0 4px rgba(16, 185, 129, 0.1)' : 'none' }}>
                  {step.completed ? <Check size={16} strokeWidth={3} /> : <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1d5db' }} />}
                </div>
                <span style={{ fontSize: 11, fontWeight: step.completed ? 700 : 500, color: step.completed ? '#1f2937' : '#9ca3af', textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {orderData.agent && !isDelivered && (
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#4b5563', fontSize: 16 }}>
              {(orderData.agent.name || 'A').charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 2px 0', fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{orderData.agent.name || 'Agent'}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{orderData.agent.vehicle || 'Delivery Partner'}</p>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Delivery Details</h3>
          <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#4b5563', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#1f2937', minWidth: 60 }}>Address:</span> {orderData.address}
          </p>
          <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#1f2937', minWidth: 60 }}>Phone:</span> {orderData.phone}
          </p>

          <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 12 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Items</h3>
            {Array.isArray(orderData.items) && orderData.items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', marginBottom: 4 }}>
                <span>{item.quantity}x {item.product_name}</span>
                <span style={{ fontWeight: 600 }}>₹{item.price}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #d1d5db', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15, color: '#1f2937' }}>
              <span>Total to Pay</span>
              <span>₹{orderData.total_price}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
