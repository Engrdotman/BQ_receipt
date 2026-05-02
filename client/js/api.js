const ENV = {
    TIMEOUT: 30000,
    CLIENT_URL: import.meta.env?.VITE_CLIENT_URL || 'https://bq-receipt.vercel.app',
    INACTIVITY_TIMEOUT: parseInt(import.meta.env?.VITE_INACTIVITY_TIMEOUT) || 15 * 60 * 1000,
    // Predefined API endpoints for easy switching
    API_ENDPOINTS: [
        { name: 'Production', url: 'https://bqreceipt-production.up.railway.app/api' },
        { name: 'Localhost 5000', url: 'http://localhost:5000/api' },
        { name: 'Localhost 3000', url: 'http://localhost:3000/api' },
        { name: 'Localhost 5500', url: 'http://localhost:5500/api' },
        { name: '127.0.0.1:5000', url: 'http://127.0.0.1:5000/api' },
        { name: '127.0.0.1:3000', url: 'http://127.0.0.1:3000/api' },
    ]
};

const getApiUrl = () => {
    // 1. Check environment variable first (Vite exposes this)
    if (import.meta.env?.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    
    // 2. Check localStorage for saved preference
    const savedUrl = localStorage.getItem('api_url');
    if (savedUrl) {
        return savedUrl;
    }
    
    // 3. Auto-detect local environment
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // If running from file:// (local HTML file opened directly) or localhost
    if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
        // Try to use the server on localhost:5000 (default server port)
        return 'http://localhost:5000/api';
    }
    
    // 4. Default to production Railway URL
    return 'https://bqreceipt-production.up.railway.app/api';
};

const setApiUrl = (url) => localStorage.setItem('api_url', url);

// Helper to list available endpoints (for debugging or UI)
const getAvailableEndpoints = () => ENV.API_ENDPOINTS;

// Helper to switch endpoint by name
const switchApiEndpoint = (name) => {
    const endpoint = ENV.API_ENDPOINTS.find(e => e.name === name);
    if (endpoint) {
        setApiUrl(endpoint.url);
        return endpoint.url;
    }
    return null;
};

const getToken = () => localStorage.getItem('bq_token');
const setToken = (token) => localStorage.setItem('bq_token', token);
const removeToken = () => localStorage.removeItem('bq_token');

const getRefreshToken = () => localStorage.getItem('bq_refresh_token');
const setRefreshToken = (rt) => localStorage.setItem('bq_refresh_token', rt);
const removeRefreshToken = () => localStorage.removeItem('bq_refresh_token');

async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        return false;
    }

    try {
        const response = await fetch(`${getApiUrl()}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Refresh failed');
        }

        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUser(data.user);
        return true;
    } catch (error) {
        console.error('Token refresh failed:', error);
        removeToken();
        removeRefreshToken();
        return false;
    }
}

const getUser = () => {
    const user = localStorage.getItem('bq_user');
    return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem('bq_user', JSON.stringify(user));
const removeUser = () => localStorage.removeItem('bq_user');

let inactivityTimer = null;

const resetInactivityTimer = () => {
    if (!getToken()) return;
    
    clearTimeout(inactivityTimer);
    
    inactivityTimer = setTimeout(() => {
        auth.logout();
    }, ENV.INACTIVITY_TIMEOUT);
};

const initInactivityTracking = () => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    
    resetInactivityTimer();
};

const startInactivityTracking = () => {
    if (getToken()) {
        initInactivityTracking();
    }
};

async function request(endpoint, options = {}) {
    const url = `${getApiUrl()}${endpoint}`;
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENV.TIMEOUT);

    try {
        const response = await fetch(url, { ...options, headers, signal: controller.signal });
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Server error. Check if API is running.`);
        }

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                // Try to refresh token once
                try {
                    const refreshed = await refreshAccessToken();
                    if (refreshed) {
                        // Retry original request with new token
                        headers.Authorization = `Bearer ${getToken()}`;
                        const retryResponse = await fetch(url, { ...options, headers, signal: controller.signal });
                        const retryData = await retryResponse.json();
                        if (!retryResponse.ok) throw new Error(retryData.error || 'Request failed');
                        return retryData;
                    }
                } catch (refreshError) {
                    console.error('Refresh failed:', refreshError);
                    logout();
                    throw new Error('Session expired. Please login again.');
                }
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        console.error('API Error:', error);
        throw error;
    }
}

export const auth = {
    login: async (credentials) => {
        const data = await request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUser(data.user);
        return data;
    },

    masterLogin: async (credentials) => {
        const data = await request('/auth/master-login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUser(data.user);
        return data;
    },

    forgotPassword: async (data) => {
        return request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    resetPassword: async (data) => {
        return request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    logout: () => {
        clearTimeout(inactivityTimer);
        removeToken();
        removeRefreshToken();
        removeUser();
        window.location.href = 'login.html';
    },

    isAuthenticated: () => !!getToken(),

    getCurrentUser: () => getUser()
};

export const master = {
    getTenants: async () => {
        const token = getToken();
        return request('/master/tenants', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    },

    registerTenant: async (tenantData) => {
        const token = getToken();
        return request('/master/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(tenantData)
        });
    }
};

export { getApiUrl, getAvailableEndpoints, switchApiEndpoint, startInactivityTracking };

export const receipts = {
    getAll: () => request('/receipts'),

    getById: (id) => request(`/receipts/${id}`),

    create: (receiptData) => request('/receipts', {
        method: 'POST',
        body: JSON.stringify(receiptData)
    }),

    delete: (id) => request(`/receipts/${id}`, {
        method: 'DELETE'
    }),

    download: async (id) => {
        try {
            const token = getToken();
            const response = await fetch(`${getApiUrl()}/receipts/download/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `receipt-${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
            alert('Download failed: ' + error.message);
        }
    }
};

export const logout = () => auth.logout();

export default { auth, receipts, logout };