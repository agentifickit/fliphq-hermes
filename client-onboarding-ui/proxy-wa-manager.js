// Reverse proxy for Evolution Manager UI + API

import http from 'node:http';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_HOST = new URL(EVOLUTION_API_URL);

export function createProxyMiddleware() {
  return (req, res) => {
    let targetPath = req.url || '/';

    // If request has apikey header, it's an API call → proxy to root
    if (req.headers['apikey']) {
      targetPath = req.url || '/';
    }
    // If requesting root, serve the Manager UI
    else if (targetPath === '/' || targetPath === '') {
      targetPath = '/manager/';
    }
    // For all other paths, proxy directly
    // (Express already stripped the /manager/ prefix when routing)

    const options = {
      hostname: EVOLUTION_HOST.hostname,
      port: EVOLUTION_HOST.port,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers, host: EVOLUTION_HOST.host },
    };

    delete options.headers['content-length'];
    delete options.headers['connection'];

    const proxyReq = http.request(options, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      const contentType = headers['content-type'] || '';

      if (headers.location) {
        headers.location = headers.location.replace(/\/manager\//g, '/manager/');
      }

      res.writeHead(proxyRes.statusCode, headers);

      if (contentType.includes('text/html')) {
        let body = '';
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', (chunk) => { body += chunk; });
        proxyRes.on('end', () => {
          body = body.replace(/href="\/assets\//g, 'href="/manager/assets/')
                    .replace(/src="\/assets\//g, 'src="/manager/assets/');
          res.end(body);
        });
      } else {
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy] Error:', err.message);
      res.status(502).json({ error: 'Bad Gateway', message: err.message });
    });

    req.pipe(proxyReq);
  };
}
