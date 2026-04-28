const http = require('http');

const testLogin = () => {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:5500'
            }
        };
        
        const req = http.request(options, (res) => {
            console.log('Status:', res.statusCode);
            console.log('CORS Headers:', res.headers['access-control-allow-origin']);
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                console.log('Response:', body.substring(0, 200));
                resolve();
            });
        });
        req.on('error', e => console.error('Error:', e.message));
        req.write(JSON.stringify({ tenant: 'bq_receipt', username: 'admin', password: 'admin2026' }));
        req.end();
    });
};

testLogin();