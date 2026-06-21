async function req(path, opts = {}) {
  const { headers, ...restOpts } = opts;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...restOpts,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

export const api = {
  auth: {
    me: () => req('/auth/me'),
    login: (email, password) =>
      req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => req('/auth/logout', { method: 'POST' }),
  },

  dashboard: (range = '7d') => req(`/dashboard?range=${encodeURIComponent(range)}`),
  meenzyDashboard: () => req('/meenzy/dashboard/stats'),
  meenzyAnalytics: () => req('/meenzy/analytics'),
  getMeenzySettings: () => req('/meenzy/dashboard/settings'),
  updateMeenzySetting: (key, value) => req('/meenzy/dashboard/settings', { method: 'POST', body: JSON.stringify({ key, value }) }),
  meenzyCampaignAudience: (item) => req(`/meenzy/campaigns/target-audience?item=${encodeURIComponent(item)}`),
  b2b: {
    products: () => req('/b2b/products'),
    order: (data) => req('/b2b/order', { method: 'POST', body: JSON.stringify(data) }),
  },
  meenzyCampaignGenerate: (item) => req('/meenzy/campaigns/generate', { method: 'POST', body: JSON.stringify({ item }) }),
  meenzyCampaignSend: (phones, message) => req('/meenzy/campaigns/send', { method: 'POST', body: JSON.stringify({ phones, message }) }),
  dashboardDetails: (metric, range = '7d') =>
    req(`/dashboard/details?metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(range)}`),
  numbers: () => req('/numbers'),
  contacts: (waNumber, timeRange) =>
    req(`/contacts?waNumber=${encodeURIComponent(waNumber)}&timeRange=${timeRange}`),
  messages: (params) => {
    const qs = new URLSearchParams(params);
    return req(`/messages?${qs}`);
  },
  contactNames: (waNumber) =>
    req(`/contact-names?waNumber=${encodeURIComponent(waNumber)}`),
  contact: (waNumber, contactNumber) =>
    req(`/contact?waNumber=${encodeURIComponent(waNumber)}&contactNumber=${encodeURIComponent(contactNumber)}`),
  saveContact: (waNumber, contactNumber, name, tags = [], customFields, assignedUserId) =>
    req('/contacts/save', {
      method: 'POST',
      body: JSON.stringify({
        waNumber, contactNumber, name, tags,
        ...(customFields !== undefined ? { customFields } : {}),
        ...(assignedUserId !== undefined ? { assignedUserId } : {}),
      }),
    }),
  savedContacts: (waNumber) =>
    req(`/saved-contacts?waNumber=${encodeURIComponent(waNumber)}`),
  deleteContact: (waNumber, contactNumber) =>
    req(`/contact?waNumber=${encodeURIComponent(waNumber)}&contactNumber=${encodeURIComponent(contactNumber)}`, { method: 'DELETE' }),
  // Same-origin download URL for the sample import sheet — the auth cookie rides
  // along on a plain anchor navigation.
  importContactsTemplateUrl: () => '/api/contacts/import/template',
  // Bulk-import contacts from a .csv/.xlsx file. Uses raw fetch + FormData so the
  // browser sets the multipart boundary (the shared req() helper forces JSON).
  importContacts: (waNumber, file) => {
    const form = new FormData();
    form.append('waNumber', waNumber);
    form.append('file', file);
    return fetch('/api/contacts/import', { method: 'POST', credentials: 'include', body: form })
      .then(async res => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          let msg = text;
          try { msg = JSON.parse(text).error || text; } catch { /* keep raw */ }
          throw new Error(msg || `${res.status}`);
        }
        return res.json();
      });
  },
  categories: {
    list: () => req('/categories'),
    create: (data) => req('/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/categories/${id}`, { method: 'DELETE' }),
  },
  tags: {
    list: () => req('/tags'),
    create: (data) => req('/tags', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/tags/${id}`, { method: 'DELETE' }),
  },
  // Custom contact field definitions (Settings → Fields). Values per contact
  // are saved via saveContact(..., customFields) and read back on api.contact.
  contactFields: {
    list: () => req('/contact-fields'),
    create: (data) => req('/contact-fields', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/contact-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/contact-fields/${id}`, { method: 'DELETE' }),
  },
  // Admin-only user management (multi-user RBAC: admin + sales).
  users: {
    list: () => req('/users'),
    get: (id) => req(`/users/${id}`),
    create: (data) => req('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => req(`/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id, password) => req(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    }),
  },
  templates: {
    list: ({ accountId, status, q } = {}) => {
      const qs = new URLSearchParams();
      if (accountId) qs.set('accountId', accountId);
      if (status) qs.set('status', status);
      if (q) qs.set('q', q);
      const s = qs.toString();
      return req(`/templates${s ? `?${s}` : ''}`);
    },
    get: (id) => req(`/templates/${id}`),
    create: (data) => req('/templates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/templates/${id}`, { method: 'DELETE' }),
    submit: (id) => req(`/templates/${id}/submit`, { method: 'POST' }),
    sync: (id) => req(`/templates/${id}/sync`, { method: 'POST' }),
    duplicate: (id) => req(`/templates/${id}/duplicate`, { method: 'POST' }),
    payload: (id) => req(`/templates/${id}/payload`),
  },
  broadcasts: {
    list: (status) => req(`/broadcasts${status && status !== 'all' ? `?status=${status}` : ''}`),
    get: (id) => req(`/broadcasts/${id}`),
    create: (data) => req('/broadcasts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/broadcasts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/broadcasts/${id}`, { method: 'DELETE' }),
    send: (id) => req(`/broadcasts/${id}/send`, { method: 'POST' }),
    test: (id, testNumber) => req(`/broadcasts/${id}/test`, { method: 'POST', body: JSON.stringify({ test_number: testNumber }) }),
  },
  chatbots: {
    list: () => req('/chatbots'),
    get: (id) => req(`/chatbots/${id}`),
    create: (data) => req('/chatbots', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/chatbots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    duplicate: (id) => req(`/chatbots/${id}/duplicate`, { method: 'POST' }),
    delete: (id) => req(`/chatbots/${id}`, { method: 'DELETE' }),
    executions: (id, { page = 1, limit = 20, status = 'all', startDate = '', endDate = '', messageStatus = 'all' } = {}) => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status && status !== 'all') qs.set('status', status);
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);
      if (messageStatus && messageStatus !== 'all') qs.set('messageStatus', messageStatus);
      return req(`/chatbots/${id}/executions?${qs}`);
    },
  },
  executions: {
    get: (id) => req(`/executions/${id}`),
    cancel: (id) => req(`/executions/${id}/cancel`, { method: 'POST' }),
  },
  whatsappAccounts: {
    list: (activeOnly = false) => req(`/whatsapp-accounts${activeOnly ? '?activeOnly=true' : ''}`),
    get: (id, reveal = false) => req(`/whatsapp-accounts/${id}${reveal ? '?reveal=1' : ''}`),
    create: (data) => req('/whatsapp-accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/whatsapp-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/whatsapp-accounts/${id}`, { method: 'DELETE' }),
  },
  pipelines: {
    list: () => req('/pipelines'),
    create: (name) => req('/pipelines', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id, name) => req(`/pipelines/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id) => req(`/pipelines/${id}`, { method: 'DELETE' }),
    addStage: (pipelineId, data) => req(`/pipelines/${pipelineId}/stages`, { method: 'POST', body: JSON.stringify(data) }),
    updateStage: (stageId, data) => req(`/stages/${stageId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteStage: (stageId) => req(`/stages/${stageId}`, { method: 'DELETE' }),
  },
  deals: {
    list: (pipelineId) => req(`/deals?pipelineId=${encodeURIComponent(pipelineId)}`),
    metrics: (pipelineId) => req(`/deals/metrics?pipelineId=${encodeURIComponent(pipelineId)}`),
    create: (data) => req('/deals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/deals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    move: (id, stageId) => req(`/deals/${id}/move`, { method: 'POST', body: JSON.stringify({ stageId }) }),
    delete: (id) => req(`/deals/${id}`, { method: 'DELETE' }),
    contactSearch: (q) => req(`/deals/contact-search?q=${encodeURIComponent(q)}`),
  },
  retryMedia: (messageId) => req(`/media/${encodeURIComponent(messageId)}/retry`, { method: 'POST' }),
  mediaUrl: (messageId) => `/api/media/${encodeURIComponent(messageId)}`,
  windowStatus: (waNumber, contactNumber) =>
    req(`/messages/window-status?waNumber=${encodeURIComponent(waNumber)}&contactNumber=${encodeURIComponent(contactNumber)}`),
  markRead: (waNumber, contactNumber) =>
    req('/messages/mark-read', { method: 'POST', body: JSON.stringify({ waNumber, contactNumber }) }),
  // Emoji reaction to a message (empty emoji removes it).
  react: (fromNumber, toNumber, messageId, emoji) =>
    req('/messages/react', { method: 'POST', body: JSON.stringify({ fromNumber, toNumber, messageId, emoji }) }),
  // Local-only "star" bookmark on a message.
  star: (waNumber, contactNumber, messageId, starred) =>
    req('/messages/star', { method: 'POST', body: JSON.stringify({ waNumber, contactNumber, messageId, starred }) }),
  sendMessage: ({ fromNumber, toNumber, text, contextMessageId }) =>
    req('/messages/send', { method: 'POST', body: JSON.stringify({ fromNumber, toNumber, text, contextMessageId }) }),
  testTemplate: (id, to, sampleValues = {}) =>
    req(`/templates/${id}/test-send`, { method: 'POST', body: JSON.stringify({ to, sampleValues }) }),
  sendMedia: async ({ fromNumber, toNumber, caption, file, contextMessageId }) => {
    const form = new FormData();
    form.append('fromNumber', fromNumber);
    form.append('toNumber', toNumber);
    if (caption) form.append('caption', caption);
    if (contextMessageId) form.append('contextMessageId', contextMessageId);
    form.append('file', file);
    const res = await fetch('/api/messages/send-media', { method: 'POST', credentials: 'include', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `${res.status}`);
    return json;
  },
  sendLibraryMedia: ({ fromNumber, toNumber, mediaLibraryId, caption, contextMessageId }) =>
    req('/messages/send-library-media', {
      method: 'POST',
      body: JSON.stringify({ fromNumber, toNumber, mediaLibraryId, caption, contextMessageId }),
    }),
  resolveAccountByPhone: (phone) =>
    req(`/whatsapp-accounts/by-phone/${encodeURIComponent(phone)}`),
  sendAudio: async ({ fromNumber, toNumber, file, contextMessageId }) => {
    const form = new FormData();
    form.append('fromNumber', fromNumber);
    form.append('toNumber', toNumber);
    if (contextMessageId) form.append('contextMessageId', contextMessageId);
    form.append('file', file);
    const res = await fetch('/api/messages/send-audio', { method: 'POST', credentials: 'include', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `${res.status}`);
    return json;
  },
  uploadTemplateMediaHandleFromLibrary: ({ accountId, mediaLibraryId }) =>
    req('/templates/upload-media-handle-from-library', {
      method: 'POST',
      body: JSON.stringify({ accountId, mediaLibraryId }),
    }),
  uploadTemplateMediaHandle: async ({ accountId, file }) => {
    const form = new FormData();
    form.append('accountId', accountId);
    form.append('file', file);
    const res = await fetch('/api/templates/upload-media-handle', { method: 'POST', credentials: 'include', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `${res.status}`);
    return json;
  },
  syncTemplate: (id) => req(`/templates/${id}/sync`, { method: 'POST' }),
  syncAllTemplates: () => req('/templates/sync-all', { method: 'POST' }),
  duplicateTemplate: (id) => req(`/templates/${id}/duplicate`, { method: 'POST' }),
  bulkSubmitTemplates: (ids) => req('/templates/bulk-submit', { method: 'POST', body: JSON.stringify({ ids }) }),
  mediaLibrary: {
    // accountId scopes media to its owning (connected) WhatsApp account.
    list: (accountId) => req(`/media-library${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
    upload: (file, name, notes, accountId) => {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      if (notes) form.append('notes', notes);
      if (accountId) form.append('accountId', accountId);
      return fetch('/api/media-library', {
        method: 'POST',
        credentials: 'include',
        body: form,
      }).then(async res => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`${res.status} ${text}`);
        }
        return res.json();
      });
    },
    update: (id, data) =>
      req(`/media-library/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => req(`/media-library/${id}`, { method: 'DELETE' }),
    sync: (id, accountId) =>
      req(`/media-library/${id}/sync/${accountId}`, { method: 'POST' }),
    downloadUrl: (id) => `/api/media-library/${id}/download`,
  },
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      body: form,
    }).then(async res => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${text}`);
      }
      return res.json();
    });
  },
  meenzy: {
    preorders: () => req('/meenzy/preorders'),
    confirmOrder: (id) => req(`/meenzy/preorders/${id}/confirm`, { method: 'POST' }),
    cancelOrder: (id) => req(`/meenzy/preorders/${id}/cancel`, { method: 'POST' }),
    assignDriver: (id, driver_id) => req(`/meenzy/preorders/${id}/assign`, { method: 'PUT', body: JSON.stringify({ driver_id }) }),
    triggerFailure: (ordered_item) => req('/meenzy/inventory-failure', { method: 'POST', body: JSON.stringify({ ordered_item }) }),
    triggerConfirm: (ordered_item) => req('/meenzy/inventory-confirm', { method: 'POST', body: JSON.stringify({ ordered_item }) }),
    delete: (id) => req(`/meenzy/preorders/${id}`, { method: 'DELETE' }),
    refunds: () => req('/meenzy/refunds'),
    updateRefundStatus: (id, status) => req(`/meenzy/refunds/${id}/status`, { method: 'POST', body: JSON.stringify({ refund_status: status }) }),
    triggerBroadcast: () => req('/meenzy/trigger-broadcast', { method: 'POST' }),
    bulkQuotes: () => req('/meenzy/bulk-quotes'),
    submitBulkQuote: (id, quoted_price) => req(`/meenzy/bulk-quotes/${id}/quote`, { method: 'POST', body: JSON.stringify({ quoted_price }) }),
    batchAgentContext: (batch) => req('/meenzy/batch-agent/context' + (batch && batch !== 'all' ? `?batch=${batch}` : '')),
    batchAgentProcess: (availableInventory, unavailableItemsWithReplacements, batch) => req('/meenzy/batch-agent/process', { method: 'POST', body: JSON.stringify({ availableInventory, unavailableItemsWithReplacements, batch }) }),
    forecast: () => req('/meenzy/dashboard/forecast'),
  },
  deliveries: {
    list: () => req('/admin/orders'),
    delete: (id) => req(`/admin/orders/${id}`, { method: 'DELETE' }),
    reattempt: (id) => req(`/admin/orders/${id}/reattempt`, { method: 'POST' }),
    cancel: (id) => req(`/admin/orders/${id}/cancel`, { method: 'POST' }),
    updateStatus: (id, status) => req(`/admin/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    verifyDelivery: (id, otp) => req(`/admin/orders/${id}/verify-delivery`, { method: 'PUT', body: JSON.stringify({ otp }) }),
    assignAgent: (id, agentId) => req(`/admin/orders/${id}/assign`, { method: 'PUT', body: JSON.stringify({ agent_id: agentId }) }),
    bulkAssign: (agentId, orderIds) => req('/admin/orders/bulk-assign', { method: 'POST', body: JSON.stringify({ agentId, orderIds }) }),
    aiAssignZone: (orderIds) => req('/admin/orders/ai-assign', { method: 'POST', body: JSON.stringify({ orderIds }) }),
    aiDispatch: () => req('/admin/orders/ai-dispatch', { method: 'POST' }),
  },
  forecasting: {
    heatmap: () => req('/admin/forecasting/heatmap'),
  },
  agents: {
    list: () => req('/admin/agents'),
    create: (data) => req('/admin/agents', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => req(`/admin/agents/${id}`, { method: 'DELETE' }),
  },
  agentAuth: {
    login: (phone, pin) => req('/agent-auth/login', { method: 'POST', body: JSON.stringify({ phone, pin }) }),
    register: (data) => req('/agent-auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: (token) => req('/agent-auth/me', { headers: { 'Authorization': `Bearer ${token}` } }),
  },
  agentPortal: {
    getOrders: (agentId, token) =>
      req(`/agent/${agentId}/orders`, { headers: { Authorization: `Bearer ${token}` } }),
    getAvailableOrders: (token) =>
      req(`/agent/available-orders`, { headers: { Authorization: `Bearer ${token}` } }),
    claimOrder: (agentId, orderId, token) =>
      req(`/agent/${agentId}/orders/${orderId}/claim`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
    updatePayment: (agentId, orderId, payment_status, token) => req(`/agent/${agentId}/orders/${orderId}/payment`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ payment_status })
    }),
    verifyDelivery: (agentId, orderId, otp, podImage, token) => req(`/agent/${agentId}/orders/${orderId}/verify-delivery`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ otp, podImage })
    }),
    optimizeRoute: (agentId, data, token) => req(`/agent/${agentId}/optimize-route`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    }),
    startRoute: (agentId, data, token) => req(`/agent/${agentId}/start-route`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    }),
    olaRouting: (data, token) => req(`/agent/ola-routing`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    }),
    getStats: (agentId, token) =>
      req(`/agent/${agentId}/stats`, { headers: { Authorization: `Bearer ${token}` } }),
    updateLocation: (agentId, lat, lng, token) => req(`/agent/${agentId}/location`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ lat, lng })
    })
  }
};
