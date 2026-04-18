const ENV = {
    API_URL: import.meta.env?.VITE_API_URL || 'http://localhost:5000/api',
    TIMEOUT: 30000
};

const getToken = () => localStorage.getItem('bq_token');
const setToken = (token) => localStorage.setItem('bq_token', token);
const removeToken = () => localStorage.removeItem('bq_token');

const getUser = () => {
    const user = localStorage.getItem('bq_user');
    return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem('bq_user', JSON.stringify(user));
const removeUser = () => localStorage.removeItem('bq_user');

async function request(endpoint, options = {}) {
    const url = `${ENV.API_URL}${endpoint}`;
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
                logout();
                throw new Error('Session expired. Please login again.');
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
        setUser(data.user);
        return data;
    },

    logout: () => {
        removeToken();
        removeUser();
        window.location.href = 'login.html';
    },

    isAuthenticated: () => !!getToken(),

    getCurrentUser: () => getUser()
};

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
            const response = await fetch(`${ENV.API_URL}/receipts/download/${id}`, {
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