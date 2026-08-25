import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 from one of these means "those credentials were wrong", not "your session
// expired". Redirecting would reload the login page and throw away the error the
// caller is about to show the user.
const SIGN_IN_ENDPOINTS = [
  '/auth/login',
  '/auth/otp/request',
  '/auth/otp/verify',
  '/auth/select-role',
];

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? '';
    const isSignInAttempt = SIGN_IN_ENDPOINTS.some((path) => url.startsWith(path));

    if (err.response?.status === 401 && !isSignInAttempt) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
