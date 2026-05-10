const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const SELF_URL = 'https://kiwiplus-proxy.onrender.com';

// Keep-alive - פינג לעצמו כל 4 דקות
setInterval(() => {
    https.get(SELF_URL, (res) => {
        console.log('Keep-alive ping:', res.statusCode);
    }).on('error', (e) => {
        console.log('Keep-alive error:', e.message);
    });
}, 4 * 60 * 1000);

http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const targetUrl = req.url.slice(1);
    if (!targetUrl || !targetUrl.startsWith('http')) {
        res.writeHead(200);
        res.end('KiwiPlus Proxy OK');
        return;
    }

    try {
        const parsed = url.parse(targetUrl);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.path,
            method: req.method,
            headers: {
                ...req.headers,
                host: parsed.hostname,
            }
        };

        const proxyReq = lib.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': '*',
            });
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (e) => {
            res.writeHead(500);
            res.end('Proxy error: ' + e.message);
        });

        req.pipe(proxyReq);
    } catch (e) {
        res.writeHead(500);
        res.end('Error: ' + e.message);
    }

}).listen(PORT, () => {
    console.log('KiwiPlus Proxy running on port ' + PORT);
});
