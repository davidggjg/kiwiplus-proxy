const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://kiwiplus-proxy.onrender.com';

// Keep-alive - מונע שינה של Render
setInterval(() => {
    const u = new URL(SELF_URL);
    https.get({ hostname: u.hostname, path: '/ping', headers: { 'User-Agent': 'KiwiPlus-KeepAlive' } },
        (res) => console.log('Keep-alive:', res.statusCode)
    ).on('error', (e) => console.log('Keep-alive error:', e.message));
}, 3 * 60 * 1000);

const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BLOCKED_REQUEST_HEADERS = new Set([
    'host', 'connection', 'transfer-encoding', 'te',
    'upgrade', 'proxy-authorization', 'proxy-connection',
    'content-length'
]);

const BLOCKED_RESPONSE_HEADERS = new Set([
    'transfer-encoding', 'connection', 'keep-alive',
    'x-frame-options', 'content-security-policy',
    'x-content-security-policy', 'feature-policy',
    'permissions-policy'
]);

http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/ping' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('KiwiPlus Proxy OK');
        return;
    }

    const targetUrl = req.url.slice(1);
    if (!targetUrl || !targetUrl.startsWith('http')) {
        res.writeHead(400);
        res.end('Bad request - URL required');
        return;
    }

    let parsed;
    try { parsed = new URL(targetUrl); }
    catch (e) { res.writeHead(400); res.end('Invalid URL: ' + e.message); return; }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const cleanHeaders = {};
    for (const [key, val] of Object.entries(req.headers)) {
        if (!BLOCKED_REQUEST_HEADERS.has(key.toLowerCase())) {
            cleanHeaders[key] = val;
        }
    }

    if (!cleanHeaders['user-agent'] || cleanHeaders['user-agent'].includes('wv')) {
        cleanHeaders['user-agent'] = UA_MOBILE;
    }

    cleanHeaders['host'] = parsed.hostname;
    cleanHeaders['accept'] = cleanHeaders['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    cleanHeaders['accept-language'] = cleanHeaders['accept-language'] || 'he-IL,he;q=0.9,en;q=0.8';
    cleanHeaders['accept-encoding'] = 'identity';
    cleanHeaders['cache-control'] = 'no-cache';

    if (!cleanHeaders['referer']) {
        cleanHeaders['referer'] = parsed.origin + '/';
    }

    const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: req.method,
        headers: cleanHeaders,
        timeout: 25000,
        rejectUnauthorized: false
    };

    console.log(`[${new Date().toISOString()}] ${req.method} ${parsed.hostname}${parsed.pathname}`);

    const proxyReq = lib.request(options, (proxyRes) => {
        const statusCode = proxyRes.statusCode;
        const responseHeaders = { 'Access-Control-Allow-Origin': '*' };
        for (const [key, val] of Object.entries(proxyRes.headers)) {
            if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
                responseHeaders[key] = val;
            }
        }

        if ([301, 302, 303, 307, 308].includes(statusCode) && proxyRes.headers.location) {
            let redirectUrl;
            try { redirectUrl = new URL(proxyRes.headers.location, targetUrl).toString(); }
            catch (e) { redirectUrl = proxyRes.headers.location; }
            responseHeaders['location'] = '/' + redirectUrl;
        }

        res.writeHead(statusCode, responseHeaders);
        proxyRes.pipe(res);
    });

    proxyReq.setTimeout(25000, () => {
        proxyReq.destroy();
        if (!res.headersSent) { res.writeHead(504); res.end('Gateway Timeout'); }
    });

    proxyReq.on('error', (e) => {
        console.error('Proxy error:', e.message, 'for:', targetUrl);
        if (!res.headersSent) { res.writeHead(502); res.end('Proxy Error: ' + e.message); }
    });

    req.pipe(proxyReq);

}).listen(PORT, () => {
    console.log(`KiwiPlus Proxy v2 running on port ${PORT}`);
});
