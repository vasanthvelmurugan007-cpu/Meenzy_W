import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { TrendingUp, RefreshCw, AlertTriangle, TrendingDown } from 'lucide-react';
import { C, FONT } from '../constants';

export default function DemandForecastPage() {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchForecast();
  }, []);

  const fetchForecast = async () => {
    try {
      setLoading(true);
      const data = await api.meenzy.forecast();
      setForecast(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 30, maxWidth: 1000, margin: '0 auto', fontFamily: FONT }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>Demand Forecasting</h1>
          <p style={{ color: C.textSecondary, margin: 0 }}>Predictive catch requirements based on the last 7 days of preorders.</p>
        </div>
        <button onClick={fetchForecast} style={{ 
          padding: '8px 12px', background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 6, 
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSecondary, cursor: 'pointer', boxShadow: C.shadowSm 
        }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171', borderRadius: 8, marginBottom: 20 }}>
          <AlertTriangle size={16} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          {error}
        </div>
      )}

      <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0 }}>AI Forecast & Recommendations</h2>
        </div>
        <div style={{ padding: 24, fontSize: 15, lineHeight: 1.6, color: '#1f2937', whiteSpace: 'pre-wrap' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.textMuted }}>Analyzing 14-day history and generating AI forecast...</div>
          ) : forecast?.forecast ? (
            forecast.forecast
          ) : (
            <div style={{ textAlign: 'center', color: C.textMuted }}>No data available.</div>
          )}
        </div>
      </div>

    </div>
  );
}
