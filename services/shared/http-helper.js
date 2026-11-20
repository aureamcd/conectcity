const http = require('node:http');
const crypto = require('node:crypto');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Limit to 25MB for image uploads
      if (data.length > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve({ raw: data });
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amzn-Trace-Id',
    ...extraHeaders
  });
  res.end(body);
}

function generateTraceId() {
  const epochHex = Math.floor(Date.now() / 1000).toString(16);
  const randHex = crypto.randomBytes(12).toString('hex');
  return `Root=1-${epochHex}-${randHex}`;
}

function httpRequest(urlStr, options = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyData = bodyObj ? JSON.stringify(bodyObj) : null;
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(bodyData ? { 'Content-Length': Buffer.byteLength(bodyData) } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let parsed = raw;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

module.exports = {
  parseBody,
  sendJson,
  generateTraceId,
  httpRequest
};
