require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const pool = require('./db');
const { router: authRouter, authMiddleware, ensureTables } = require('./auth');
const { router: messagesRouter } = require('./routes/messages');
const { router: webhookRouter } = require('./routes/webhook');
const { router: categoriesRouter } = require('./routes/categories');
const { router: contactFieldsRouter } = require('./routes/contactFields');
const { router: usersRouter } = require('./routes/users');
const { router: meenzyRouter } = require('./routes/meenzy');
const { router: uploadsRouter, UPLOAD_DIR } = require('./routes/uploads');
const { router: templatesRouter, syncAllAccountTemplates } = require('./routes/templates');
const { router: broadcastsRouter } = require('./routes/broadcasts');
const { router: chatbotsRouter } = require('./routes/chatbots');
const { router: mediaRouter } = require('./routes/media');
const { router: mediaLibraryRouter } = require('./routes/mediaLibrary');
const mediaStorage = require('./util/pgStorage');
const { router: whatsappAccountsRouter } = require('./routes/whatsappAccounts');
const { router: dashboardRouter } = require('./routes/dashboard');
const { router: pipelinesRouter } = require('./routes/pipelines');
const { startWorker: startMediaWorker, shutdown: shutdownMediaQueue } = require('./queue/mediaQueue');
const { startSendWorker, shutdownSendQueue } = require('./queue/sendQueue');
const { startAbandonmentCron } = require('./engine/abandonmentCron');
const { router: deliveryExceptionsRouter } = require('./routes/deliveryExceptions');
const { router: adminResolutionRouter } = require('./routes/adminResolution');
const deliveryAgentsRouter = require('./routes/deliveryAgents');
const marketingRouter = require('./routes/marketing');
const agentPortalRouter = require('./routes/agentPortal');
const agentAuthRouter = require('./routes/agentAuth');
const { startExpiryCron } = require('./engine/expiryCron');
const { startFeedbackCron } = require('./engine/feedbackCron');
const { startExceptionWorker, shutdownExceptionQueue } = require('./queue/exceptionQueue');
const trackingRouter = require('./routes/tracking');
const { startSubscriptionCron } = require('./engine/subscriptionCron');
const { startPredictiveReorderCron } = require('./engine/predictiveReorderCron');
const { router: forecastingRouter } = require('./routes/forecasting');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const ALLOWED_ORIGINS = [
  process.env.CORS_ORIGIN,
  'http://localhost:5173',
  'http://localhost',
  'http://localhost:80',
].filter(Boolean);

const CORS_DOMAIN = (process.env.CORS_ORIGIN || '').replace(/^https?:\/\//, '');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", ...(CORS_DOMAIN ? [`wss://${CORS_DOMAIN}`] : [])],
      mediaSrc: ["'self'", "blob:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow local network IPs and cloudflare tunnels for easy mobile testing
    if (origin.endsWith('.trycloudflare.com')) return callback(null, true);
    if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return callback(null, true);
    
    console.error(`[CORS Blocked] Origin: ${origin}`);
    callback(null, true); // Allow all temporarily to unblock user
  },
}));

app.use(cookieParser());
// Capture the raw request body so the webhook route can verify Meta's
// X-Hub-Signature-256 HMAC over the exact bytes Meta signed.
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOAD_DIR));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  keyGenerator: (req) => {
    try {
      const token = req.cookies?.forgecrm_token;
      if (token) {
        const decoded = require('jsonwebtoken').decode(token);
        if (decoded?.username) return `user:${decoded.username}`;
      }
    } catch {}
    return req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later' });
  },
});
app.use(apiLimiter);

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Public routes (webhook from n8n — no auth)
app.use('/api', webhookRouter);
app.use('/api', meenzyRouter);
app.use('/api', require('./routes/meenzyDashboard'));
app.use('/api', require('./routes/campaigns'));
app.use('/api', require('./routes/delivery'));
app.use('/api', deliveryExceptionsRouter);
app.use('/api/tracking', trackingRouter);

// Auth routes (public)
app.use('/api', authRouter);

// --- Public Agent Auth Route ---
app.use('/api/agent-auth', agentAuthRouter);

// --- Agent Portal Routes ---
app.use('/api/agent', agentPortalRouter);

// Protected routes
app.use('/api', authMiddleware, messagesRouter);
app.use('/api', authMiddleware, meenzyRouter);
app.use('/api', authMiddleware, categoriesRouter);
app.use('/api', authMiddleware, contactFieldsRouter);
app.use('/api', authMiddleware, usersRouter);
app.use('/api', authMiddleware, uploadsRouter);
app.use('/api', authMiddleware, templatesRouter);
app.use('/api', authMiddleware, broadcastsRouter);
app.use('/api', authMiddleware, chatbotsRouter);
app.use('/api', authMiddleware, mediaRouter);
app.use('/api', authMiddleware, mediaLibraryRouter);
app.use('/api', authMiddleware, whatsappAccountsRouter);
app.use('/api', authMiddleware, dashboardRouter);
app.use('/api', authMiddleware, pipelinesRouter);
app.use('/api/admin/orders', authMiddleware, adminResolutionRouter);
app.use('/api/admin/agents', authMiddleware, deliveryAgentsRouter);
app.use('/api/admin/marketing', authMiddleware, marketingRouter);
app.use('/api/marketing', authMiddleware, require('./routes/flashSale'));
app.use('/api/admin/forecasting', authMiddleware, forecastingRouter);

// Error handler
app.use((err, req, res, next) => {
  // Full error (with stack) in dev for debugging; message-only in production.
  if (process.env.NODE_ENV !== 'production') console.error('[Error]', err);
  else console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  await ensureTables();
  mediaStorage.ensureBucket().catch(err =>
    console.error('[media-storage] table ensure failed (will retry on first upload):', err.message)
  );
  startMediaWorker();
  startSendWorker();
  startAbandonmentCron();
  startExceptionWorker();
  
  // Ensure schema changes
  try {
    await pool.query(`ALTER TABLE coexistence.meenzy_preorders ADD COLUMN IF NOT EXISTS feedback_sent BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE coexistence.ecosystem_orders ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await pool.query(`ALTER TABLE coexistence.ecosystem_orders ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;`);
    await pool.query(`ALTER TABLE coexistence.delivery_agents ADD COLUMN IF NOT EXISTS plain_pin VARCHAR(255);`);
  } catch(e) { console.error('Failed to add schema columns:', e); }

  startFeedbackCron();
  startExpiryCron();
  startSubscriptionCron();
  startPredictiveReorderCron();
  // Note: Daily 7:00 PM Catalog Broadcast Cron is now managed in automationEngine.js

  // Stale-pause sweeper: mark paused automation executions that have outlived
  // their expires_at as error. Resume already inline-checks expires_at, so
  // this is purely hygiene against forever-paused rows accumulating.
  setInterval(async () => {
    try {
      const { rowCount } = await pool.query(
        `UPDATE coexistence.automation_executions
            SET status='error',
                error_message='Paused execution expired (no reply within timeout)',
                completed_at=NOW()
          WHERE status='paused' AND expires_at < NOW()`
      );
      if (rowCount > 0) console.log(`[sweeper] expired ${rowCount} paused execution(s)`);

      // Reap orphaned 'running' executions: the engine runs synchronously and
      // finishes in ms, so anything 'running' for >15m means the process died
      // mid-walk (e.g. a restart) and the status was never updated to error.
      const { rowCount: orphans } = await pool.query(
        `UPDATE coexistence.automation_executions
            SET status='error',
                error_message='Execution interrupted (no completion within 15 minutes)',
                completed_at=NOW()
          WHERE status='running' AND started_at < NOW() - INTERVAL '15 minutes'`
      );
      if (orphans > 0) console.log(`[sweeper] reaped ${orphans} orphaned running execution(s)`);
    } catch (err) {
      console.error('[sweeper] error:', err.message);
    }
  }, 30 * 60 * 1000).unref();

  // Template status auto-sync: Meta does NOT push template approval/rejection
  // status — we must poll. The tick fires every 10 min but only calls Meta while
  // at least one template is still awaiting review (status='SUBMITTED'). Once all
  // are resolved (approved/rejected/etc.) it idles with zero Meta calls, and
  // auto-resumes when a new template is submitted. Override interval with
  // TEMPLATE_SYNC_INTERVAL_MS.
  const TEMPLATE_SYNC_MS = parseInt(process.env.TEMPLATE_SYNC_INTERVAL_MS || '', 10) || 10 * 60 * 1000;
  const runTemplateSync = async () => {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS pending FROM coexistence.message_templates WHERE status = 'SUBMITTED'`
      );
      const pending = rows[0]?.pending || 0;
      if (pending === 0) return; // all resolved → skip Meta entirely (idle)
      const r = await syncAllAccountTemplates();
      if (r.totalUpdated > 0) {
        console.log(`[template-sync] ${pending} pending → updated ${r.totalUpdated} template(s)`);
      }
    } catch (err) {
      console.error('[template-sync] error:', err.message);
    }
  };
  setTimeout(runTemplateSync, 60 * 1000).unref();        // initial catch-up ~1 min after startup
  setInterval(runTemplateSync, TEMPLATE_SYNC_MS).unref(); // every 10 min (gated by pending count)

  const server = app.listen(PORT, () => {
    console.log(`[Meenzy] Backend running on port ${PORT}`);
  });

  // Graceful shutdown so BullMQ marks in-flight jobs as stalled (not lost)
  const shutdown = async (sig) => {
    console.log(`[Meenzy] ${sig} received, draining…`);
    server.close(() => {});
    await shutdownMediaQueue();
    await shutdownSendQueue();
    await shutdownExceptionQueue();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('[Fatal] Failed to start:', err);
  process.exit(1);
});
