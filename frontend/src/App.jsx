import { useState, useEffect } from 'react';
import { api } from './api.js';
import { C, FONT } from './constants.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import LoginGate from './components/LoginGate.jsx';
import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatsPage from './components/ChatsPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ChatbotBuilderPage from './pages/ChatbotBuilderPage.jsx';
import TemplateBuilderPage from './pages/TemplateBuilderPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import BulkMessagePage from './pages/BulkMessagePage.jsx';
import AdminSettingsPage from './pages/AdminSettingsPage.jsx';
import MediaLibraryPage from './pages/MediaLibraryPage.jsx';
import PipelinesPage from './pages/PipelinesPage.jsx';
import PreordersPage from './pages/PreordersPage.jsx';
import RefundsPage from './pages/RefundsPage.jsx';
import PublicCatalog from './pages/PublicCatalog.jsx';

import DeliveriesPage from './pages/DeliveriesPage.jsx';
import AgentsPage from './pages/AgentsPage.jsx';
import AgentPortalPage from './pages/AgentPortalPage.jsx';
import PublicTrackingPage from './pages/PublicTrackingPage.jsx';
import BatchAgentPage from './pages/BatchAgentPage.jsx';
import DemandForecastPage from './pages/DemandForecastPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import DeliveredAnalyticsPage from './pages/DeliveredAnalyticsPage.jsx';
import SmartCampaignsPage from './pages/SmartCampaignsPage.jsx';
import MarketingPage from './pages/MarketingPage.jsx';
import SentimentPage from './pages/SentimentPage.jsx';

import B2BPortal from './pages/B2BPortal.jsx';

const VALID_PAGES = new Set([
  'home', 'dashboard', 'analytics', 'delivered-analytics', 'smart-campaigns', 'chatbot-builder', 'template-builder', 'chats',
  'contacts', 'preorders', 'refunds', 'pipelines', 'bulk-message', 'admin-settings', 'media-library', 'catalog', 'deliveries', 'track', 'agents', 'agent-portal', 'batch-agent', 'demand-forecast', 'marketing', 'sentiment', 'b2b-portal'
]);

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [routeParts, navigate, replaceRoute] = useHashRoute();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const rawPage = routeParts[0] ? routeParts[0].split('?')[0] : '';
  const page = VALID_PAGES.has(rawPage) ? rawPage : 'home';
  const subParts = routeParts.slice(1);
  const setPage = (p) => navigate(p);

  // Normalize empty hash to #/home so reload always shows a valid URL
  useEffect(() => {
    if (!routeParts[0]) replaceRoute('home');
  }, [routeParts, replaceRoute]);

  // Page guard: non-admins can only reach pages granted to them (user.pages).
  // admin-settings is allowed if they have any admin-settings:* sub-page.
  useEffect(() => {
    if (!user || user.role === 'admin' || !Array.isArray(user.pages)) return;
    const allowed = page === 'admin-settings'
      ? user.pages.some(p => p.startsWith('admin-settings'))
      : user.pages.includes(page);
    if (!allowed) setPage('home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, user]);

  useEffect(() => {
    // Collapse main sidebar by default on automation builder page
    if (page === 'chatbot-builder') {
      setSidebarCollapsed(true);
    }
  }, [page]);

  useEffect(() => {
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const handleLogout = async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
    setPage('home');
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT,
        background: C.pageBg,
      }}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>Loading…</div>
      </div>
    );
  }

  const isPublicCatalog = page === 'catalog';
  const isPublicTracking = page === 'track';
  const matchPublicTrack = window.location.hash.match(/^#\/track\/([^?]+)/);
  if (matchPublicTrack) {
    return <PublicTrackingPage />;
  }

  const isAgentPortal = page === 'agent-portal';

  if (isPublicCatalog) {
    return <PublicCatalog onNavigate={setPage} />;
  }

  if (isPublicTracking) {
    return <PublicTrackingPage subParts={subParts} />;
  }

  if (isAgentPortal) {
    return <AgentPortalPage />;
  }

  const isB2BPortal = page === 'b2b-portal';
  if (isB2BPortal && !user) {
    return <B2BPortal />;
  }

  if (!user) {
    return <LoginGate onLogin={setUser} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage user={user} onPageChange={setPage} />;
      case 'dashboard': return <DashboardPage user={user} onPageChange={setPage} />;
      case 'analytics': return <AnalyticsPage />;
      case 'delivered-analytics': return <DeliveredAnalyticsPage />;
      case 'smart-campaigns': return <SmartCampaignsPage user={user} />;
      case 'chats': return <ChatsPage subParts={subParts} navigate={navigate} user={user} />;
      case 'contacts': return <ContactsPage user={user} />;
      case 'pipelines': return <PipelinesPage user={user} />;
      case 'template-builder': return <TemplateBuilderPage />;
      case 'media-library': return <MediaLibraryPage />;
      case 'bulk-message': return <BulkMessagePage />;
      case 'chatbot-builder': return <ChatbotBuilderPage subParts={subParts} navigate={navigate} />;
      case 'preorders': return <PreordersPage />;
      case 'refunds': return <RefundsPage />;
      case 'deliveries': return <DeliveriesPage />;
      case 'agents': return <AgentsPage />;
      case 'b2b-portal': return <B2BPortal />;
      case 'batch-agent': return <BatchAgentPage />;
      case 'demand-forecast': return <DemandForecastPage />;
      case 'marketing': return <MarketingPage />;
      case 'admin-settings': return <AdminSettingsPage onLogout={handleLogout} onNavigate={setPage} subParts={subParts} navigate={navigate} user={user} />;
      default: return <HomePage user={user} onPageChange={setPage} />;
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: FONT,
      background: C.pageBg,
    }}>
      <Topbar user={user} onLogout={handleLogout} onNavigate={setPage} isMobile={isMobile} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {page !== 'admin-settings' && !isMobile && (
          <Sidebar
            activePage={page}
            onPageChange={setPage}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            user={user}
          />
        )}
        {page !== 'admin-settings' && isMobile && mobileMenuOpen && (
          <>
            <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.5)' }} />
            <div style={{ position: 'fixed', top: 56, left: 0, bottom: 0, zIndex: 1000 }}>
              <Sidebar
                activePage={page}
                onPageChange={(p) => { setPage(p); setMobileMenuOpen(false); }}
                collapsed={false}
                setCollapsed={() => {}}
                user={user}
              />
            </div>
          </>
        )}
        <div style={{ flex: 1, overflow: 'auto', background: C.pageBg, display: 'flex', flexDirection: 'column' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
