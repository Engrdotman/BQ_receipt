const http = require('http');

const loginData = JSON.stringify({
    tenant: 'bq_receipt',
    username: 'admin',
    password: 'admin2026'
});

const loginOptions = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
    }
};

console.log('Testing login...');
const loginReq = http.request(loginOptions, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('Login Status:', res.statusCode);
        console.log('Login Response:', body.substring(0, 500));
        
        if (res.statusCode === 200) {
            const data = JSON.parse(body);
            if (data.token) {
                console.log('\nTesting receipts with token...');
                testReceipts(data.token);
            }
        }
    });
});

loginReq.on('error', (e) => {
    console.error('Login request error:', e.message);
});

loginReq.write(loginData);
loginReq.end();

function testReceipts(token) {
    const receiptOptions = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/receipts',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };

    const receiptReq = http.request(receiptOptions, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log('Receipts Status:', res.statusCode);
            console.log('Receipts Response:', body.substring(0, 300));
        });
    });

    receiptReq.on('error', (e) => {
        console.error('Receipts request error:', e.message);
    });
    
    receiptReq.end();
}