const https = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsInRlbmFudF9pZCI6InRlbmFudF9icSIsInRlbmFudF9kYiI6InBvc3RncmVzcWw6Ly9wb3N0Z3JlczpoZXJ0aGV5ZG90dW5AbG9jYWxob3N0OjcwODUvQlFfcmVjZWlwdGRiIiwidHlwZSI6ImNsaWVudCIsImlhdCI6MTc3NjUzMDQyOCwiZXhwIjoxNzc2NTMxMzI4fQ.ptO4G-ns73O4lvGGUROYfwyodJ2_ypyz0L1gTzTwKeg';

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/receipts',
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
    });
});

req.on('error', e => console.error('Error:', e.message));
req.end();