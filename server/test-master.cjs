const http = require('http');

const loginData = JSON.stringify({
    username: 'master',
    password: 'master2026'
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/master-login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log('Testing...');
const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
});

req.on('error', (err) => {
    console.error('Error:', err.message);
});

req.write(loginData);
req.end();