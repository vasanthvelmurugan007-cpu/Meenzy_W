import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Hardcoded to ensure EAS build catches it (avoiding .gitignore stripping .env)
const BASE_URL = 'https://muslim-tamil-enforcement-residence.trycloudflare.com';

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 10000,
});

// Interceptor to attach token
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('agentToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (phone, password) => api.post('/auth/agent-login', { phone, password }),
};

export const portalAPI = {
  getOrders: (agentId) => api.get(`/agent-portal/${agentId}/orders`),
  getStats: (agentId) => api.get(`/agent-portal/${agentId}/stats`),
  updateLocation: (agentId, lat, lng) => api.put(`/agent-portal/${agentId}/location`, { lat, lng }),
  verifyDelivery: (agentId, orderId, otp, podImage) => api.put(`/agent-portal/${agentId}/orders/${orderId}/verify-delivery`, { otp, podImage }),
  optimizeRoute: (agentId, data) => api.post(`/agent-portal/${agentId}/optimize-route`, data),
};
