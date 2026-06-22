import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { CheckCircle, BarChart2, DollarSign, Package, RefreshCw } from 'lucide-react';
import { C, FONT } from '../constants';

export default function DeliveredAnalyticsPage() {
  const [data, setData] = useState({ totalRevenue: 0, demandStats: [], deliveredOrders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    try {
      setLoading(true);
      const res = await api.analytics.delivered();
      setData({
        totalRevenue: res.totalRevenue || 0,
        demandStats: res.demandStats || [],
        deliveredOrders: res.deliveredOrders || []
      });
      setError(null);
    } catch (err) {
      setError('Failed to load delivered analytics. ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = {
    background: C.cardBg, padding: 24, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadowSm, flex: 1
  };

  return (
    <div style={{ padding: 30, maxWidth: 1200, margin: '0 auto', fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={28} color="#10b981" /> Delivered Analytics
        </h1>
        <button onClick={fetchAnalytics} disabled={loading} style={{ 
          padding: '8px 16px', background: '#f3f4f6', border: `1px solid #d1d5db`, borderRadius: 8, 
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600 
        }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh Data
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', border: '1px solid #f87171', borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px 0', opacity: 0.9 }}>Total Revenue (Delivered)</p>
            <DollarSign size={20} opacity={0.8} />
          </div>
          <p style={{ fontSize: 36, fontWeight: 800, margin: 0 }}>₹{data.totalRevenue.toLocaleString('en-IN')}</p>
        </div>

        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px 0', opacity: 0.9 }}>Total Delivered Orders</p>
            <Package size={20} opacity={0.8} />
          </div>
          <p style={{ fontSize: 36, fontWeight: 800, margin: 0 }}>{data.deliveredOrders.length}</p>
        </div>
      </div>

      {/* Analytics Row */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Demand Stats Chart */}
        <div style={{ ...cardStyle, flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={18} /> High Demand Items (Delivered)
          </h2>
          
          {data.demandStats.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 14 }}>No demand data available yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.demandStats.map((stat, idx) => {
                const maxQty = data.demandStats[0].total_quantity || 1;
                const percentage = (stat.total_quantity / maxQty) * 100;
                
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: C.text }}>
                      <span>{stat.product_name || 'Unknown Item'}</span>
                      <span>{stat.total_quantity} kg</span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${percentage}%`, height: '100%', background: '#3b82f6', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delivered Orders Table */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, background: '#f8fafc' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Delivered Orders Log</h2>
        </div>
        
        {loading && data.deliveredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading delivered orders...</div>
        ) : data.deliveredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No delivered orders yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: C.surfaceAlt, fontSize: 12, textTransform: 'uppercase', color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '16px 24px', fontWeight: 600 }}>Order ID</th>
                  <th style={{ padding: '16px 24px', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '16px 24px', fontWeight: 600 }}>Items</th>
                  <th style={{ padding: '16px 24px', fontWeight: 600 }}>Total Value</th>
                  <th style={{ padding: '16px 24px', fontWeight: 600 }}>Delivered On</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: 14, color: C.text }}>
                {data.deliveredOrders.map(order => {
                  const dateObj = new Date(order.updated_at || order.created_at);
                  const displayDate = isNaN(dateObj) ? 'N/A' : dateObj.toLocaleString('en-IN', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                  });

                  return (
                    <tr key={order.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '16px 24px', fontWeight: 600 }}>
                        {order.wix_order_id || String(order.id).split('-')[0].toUpperCase()}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{order.customer_name || 'Unknown'}</span>
                          <span style={{ fontSize: 12, color: C.textSecondary }}>{order.user_phone}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 24px', color: C.textSecondary, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {Array.isArray(order.items) && order.items.length > 0 
                          ? order.items.map(i => `${i.product_name} (${i.quantity}kg)`).join(', ') 
                          : '-'}
                      </td>
                      <td style={{ padding: '16px 24px', fontWeight: 700, color: '#10b981' }}>
                        ₹{order.total_price || 0}
                      </td>
                      <td style={{ padding: '16px 24px', color: C.textSecondary, fontSize: 13 }}>
                        {displayDate}
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
