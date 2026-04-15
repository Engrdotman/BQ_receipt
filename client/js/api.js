/**
 * BQ Receipt System - API Wrapper
 * Handles all network requests to the backend server.
 */

const API_BASE_URL = 'http://localhost:5000/api'; // Adjust based on your server config

const api = {
    /**
     * Generic fetch wrapper
     */
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const token = localStorage.getItem('bq_token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
        };

        try {
            const response = await fetch(url, { ...options, headers });
            
            // Handle non-JSON responses (like 404 HTML pages)
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response received:', text);
                throw new Error(`Server returned HTML instead of JSON. Check if your API URL is correct and the server is running.`);
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Something went wrong');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Receipt endpoints
    receipts: {
        getAll: () => api.request('/receipts'),
        getById: (id) => api.request(`/receipts/${id}`),
        create: (receiptData) => api.request('/receipts', {
            method: 'POST',
            body: JSON.stringify(receiptData)
        }),
        delete: (id) => api.request(`/receipts/${id}`, {
            method: 'DELETE'
        }),
        download: (id) => {
            const token = localStorage.getItem('bq_token');
            window.location.href = `${API_BASE_URL}/receipts/${id}/download?token=${token}`;
        }
    },
    auth: {
        login: (credentials) => api.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        })
    }
};

export default api;
