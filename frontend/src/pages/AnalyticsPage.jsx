import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { C, FONT } from '../constants';
import { TrendingUp, Award, Map as MapIcon, BarChart3, AlertCircle } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [analyticsRes, heatmapRes] = await Promise.all([
          api.meenzyAnalytics(),
          api.forecasting.heatmap().catch(() => ({ data: null }))
        ]);
        
        setData(analyticsRes);
        if (heatmapRes && heatmapRes.data) {
          setHeatmapData(heatmapRes.data);
        }
      } catch (err) {
        setError('Failed to load analytics: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div style={{ padding: 40, fontFamily: FONT }}>Loading analytics...</div>;
  if (error) return <div style={{ padding: 40, color: 'red', fontFamily: FONT }}>{error}</div>;
  if (!data) return null;

  // Compute total revenue and orders
  const totalRevenue = data.salesTrend.reduce((sum, day) => sum + parseFloat(day.total_revenue || 0), 0);
  const totalOrders = data.salesTrend.reduce((sum, day) => sum + parseInt(day.total_orders || 0, 10), 0);

  return (
    <div style={{ fontFamily: FONT, background: '#f3f4f6', minHeight: '100vh', padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#111827' }}>Analytics & Heatmap</h1>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>Track your sales trends and AI demand zones.</p>
          </div>
        </div>

        {/* Top KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 32 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ background: '#dcfce7', padding: 12, borderRadius: 12, color: '#16a34a' }}>
              <TrendingUp size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>7-Day Revenue</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>₹{totalRevenue.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ background: '#e0e7ff', padding: 12, borderRadius: 12, color: '#4f46e5' }}>
              <BarChart3 size={24} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>7-Day Orders</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>{totalOrders}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 32 }}>
          
          {/* Sales Trend Chart (Simple CSS Bars) */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="#3b82f6" />
              Daily Revenue Trend
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 250, paddingTop: 20 }}>
              {data.salesTrend.length === 0 ? (
                <div style={{ width: '100%', textAlign: 'center', color: '#9ca3af', alignSelf: 'center' }}>No sales data for the last 7 days.</div>
              ) : (
                data.salesTrend.map((day, idx) => {
                  const maxRev = Math.max(...data.salesTrend.map(d => parseFloat(d.total_revenue || 0)));
                  const rev = parseFloat(day.total_revenue || 0);
                  const heightPct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                  const dateLabel = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%' }}>
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div 
                          title={`₹${rev} on ${dateLabel}`}
                          style={{ 
                            width: '80%', 
                            height: `${heightPct}%`, 
                            background: 'linear-gradient(to top, #3b82f6, #60a5fa)', 
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.3s ease'
                          }} 
                        />
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>{dateLabel}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Top Products List */}
          <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Award size={18} color="#f59e0b" />
              Most Popular Items
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.popularItems.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>No items sold yet.</div>
              ) : (
                data.popularItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 24, height: 24, background: '#fef3c7', color: '#d97706', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                        {idx + 1}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{item.product_name}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{item.total_quantity} kg</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Full Width Mapbox AI Demand Heatmap */}
        <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapIcon size={18} color="#ec4899" />
            Live AI Demand Heatmap
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#6b7280' }}>
            This map highlights high-density order areas based on recent WhatsApp and Wix activity. Use this to target your Facebook and Instagram Ads.
          </p>

          <div style={{ height: 500, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {heatmapData ? (
              <Map
                mapLib={maplibregl}
                initialViewState={{ longitude: 80.2707, latitude: 13.0827, zoom: 11 }}
                mapStyle={`https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json`}
                transformRequest={(url, resourceType) => {
                  if (url.includes('api.olamaps.io')) {
                    const olaToken = import.meta.env.VITE_OLA_MAPS_KEY || import.meta.env.VITE_MAPBOX_TOKEN;
                    return { url: `${url}${url.includes('?') ? '&' : '?'}api_key=${olaToken}` };
                  }
                }}
              >
                <NavigationControl position="top-right" />
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
              </Map>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', color: '#9ca3af' }}>
                <AlertCircle size={24} style={{ marginRight: 8 }} />
                Insufficient geocoded data to generate heatmap
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
