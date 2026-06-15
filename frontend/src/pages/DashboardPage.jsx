import { useState, useEffect } from 'react';
import { api } from '../api';
import { C, FONT } from '../constants';
import { LayoutDashboard, Users, Package, TrendingUp } from 'lucide-react';

export default function DashboardPage({ user, onPageChange }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autopilotMode, setAutopilotMode] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const [res, settings] = await Promise.all([
          api.meenzyDashboard(),
          api.getMeenzySettings().catch(() => ({}))
        ]);
        setStats(res);
        setAutopilotMode(settings.ai_autopilot_mode === true || settings.ai_autopilot_mode === 'true');
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return <div style={{ padding: 24, fontFamily: FONT }}>Loading Dashboard...</div>;
  }

  if (!stats) {
    return <div style={{ padding: 24, fontFamily: FONT, color: 'red' }}>Failed to load data.</div>;
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: FONT, background: C.pageBg, minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="spring-pop" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: C.text }}>
          Meenzy Admin Dashboard
        </h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.cardBg, padding: '8px 16px', borderRadius: 999, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: !autopilotMode ? C.primary : C.textSecondary }}>Manual Mode</span>
          <button 
            disabled={toggling}
            onClick={async () => {
              const nextVal = !autopilotMode;
              setToggling(true);
              try {
                await api.updateMeenzySetting('ai_autopilot_mode', nextVal);
                setAutopilotMode(nextVal);
              } catch(e) {
                alert('Failed to update mode');
              }
              setToggling(false);
            }}
            style={{ 
              width: 44, height: 24, borderRadius: 12, background: autopilotMode ? '#10b981' : '#cbd5e1',
              border: 'none', cursor: toggling ? 'wait' : 'pointer', position: 'relative', transition: 'background 0.2s', padding: 0
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2,
              left: autopilotMode ? 22 : 2, transition: 'left 0.2s', boxShadow: C.shadowSm
            }} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: autopilotMode ? '#10b981' : C.textSecondary }}>AI Autopilot</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="spring-pop hover-lift" style={{ background: C.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
          <div style={{ color: C.textSecondary, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
            <TrendingUp size={16} color={C.primary} />
            Today's Orders
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{stats.todayOrders}</div>
        </div>
        
        <div className="spring-pop hover-lift" style={{ background: C.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
          <div style={{ color: C.textSecondary, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
            <Package size={16} color={C.amber} />
            Active Deliveries
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{stats.activeDeliveries}</div>
        </div>

        <div className="spring-pop hover-lift" style={{ background: C.cardBg, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadowSm }}>
          <div style={{ color: C.textSecondary, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 600 }}>
            <Users size={16} color={C.aqua} />
            Active Drivers
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{stats.activeDrivers}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        <div className="spring-pop" style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadowSm }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Top Items Today</h3>
          </div>
          <div style={{ padding: 20 }}>
            {stats.topItems && stats.topItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.topItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: C.text }}>{item.ordered_item}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.total_qty} kg</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: C.textMuted }}>No orders today.</div>
            )}
          </div>
        </div>

        <div className="spring-pop" style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadowSm }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Orders by Pincode</h3>
          </div>
          <div style={{ padding: 20 }}>
            {stats.pincodeStats && stats.pincodeStats.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.pincodeStats.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: idx !== stats.pincodeStats.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 14, color: C.text }}>📍 {item.pincode}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.primary, background: C.primaryLight, padding: '4px 10px', borderRadius: 999 }}>{item.order_count} orders</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: C.textMuted }}>No pincode data available.</div>
            )}
          </div>
        </div>

        <div className="spring-pop" style={{ background: C.cardBg, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadowSm }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>Recent Preorders</h3>
          </div>
          <div style={{ padding: 20 }}>
            {stats.recentOrders && stats.recentOrders.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.recentOrders.slice(0, 5).map((order, idx) => (
                  <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: idx !== Math.min(stats.recentOrders.length, 5) - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{order.customer_phone}</div>
                      <div style={{ fontSize: 12, color: C.textSecondary, fontWeight: 500 }}>{order.quantity}kg {order.ordered_item}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: order.order_status === 'DELIVERED' ? '#dcfce7' : '#fef9c3', color: order.order_status === 'DELIVERED' ? '#166534' : '#854d0e', display: 'inline-block', fontWeight: 600 }}>
                        {order.order_status}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, fontWeight: 500 }}>{order.driver_name || 'Unassigned'}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: C.textMuted }}>No recent orders.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
