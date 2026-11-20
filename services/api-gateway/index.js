const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { parseBody, sendJson, generateTraceId, httpRequest } = require('../shared/http-helper');

const PORT = process.env.GATEWAY_PORT || 3000;
const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL || 'http://127.0.0.1:4001';
const TICKETS_URL = process.env.TICKETS_SERVICE_URL || 'http://127.0.0.1:4002';
const MEDIA_URL = process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:4003';

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// Observabilidade: Amazon CloudWatch Logs, AWS X-Ray Traces e CloudWatch Alarms
const cloudWatchLogs = [];
const xrayTraces = [];
const gatewayStats = {
  totalRequests: 0,
  routedToIdentity: 0,
  routedToTickets: 0,
  routedToMedia: 0,
  startedAt: new Date().toISOString()
};

function logCloudWatch(level, service, message, traceId) {
  cloudWatchLogs.unshift({
    timestamp: new Date().toISOString(),
    level,
    logGroup: `/aws/conectcity/${service}`,
    message,
    traceId
  });
  if (cloudWatchLogs.length > 80) cloudWatchLogs.pop();
}

function recordXRayTrace(trace) {
  xrayTraces.unshift(trace);
  if (xrayTraces.length > 50) xrayTraces.pop();
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  const startTime = Date.now();
  const traceId = generateTraceId();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // Endpoint de Observabilidade (Amazon CloudWatch + AWS X-Ray + Health dos 3 Microsserviços)
    if (req.method === 'GET' && pathname === '/api/observability') {
      const [identityHealth, ticketsHealth, mediaHealth] = await Promise.all([
        httpRequest(`${IDENTITY_URL}/health`).then((r) => r.data).catch((e) => ({ status: 'DOWN', error: e.message })),
        httpRequest(`${TICKETS_URL}/health`).then((r) => r.data).catch((e) => ({ status: 'DOWN', error: e.message })),
        httpRequest(`${MEDIA_URL}/health`).then((r) => r.data).catch((e) => ({ status: 'DOWN', error: e.message }))
      ]);

      const alarms = [
        {
          name: 'High-Availability-Microservices-Health',
          metric: 'HealthyHostCount >= 3',
          state:
            identityHealth.status === 'UP' && ticketsHealth.status === 'UP' && mediaHealth.status === 'UP'
              ? 'OK'
              : 'ALARM',
          description: 'Monitora disponibilidade dos 3 microsserviços atrás do Application Load Balancer (ALB).'
        },
        {
          name: 'SQS-DeadLetterQueue-MessagesVisible',
          metric: `ApproximateNumberOfMessagesVisible (${mediaHealth.dlqCount || 0})`,
          state: (mediaHealth.dlqCount || 0) > 0 ? 'ALARM' : 'OK',
          description: 'Dispara alerta quando uma imagem corrompida falha no processamento e cai na DLQ.'
        },
        {
          name: 'APIGateway-Latency-P95',
          metric: 'Latency < 200ms',
          state: 'OK',
          description: 'Monitora o tempo de resposta síncrono do API Gateway.'
        }
      ];

      return sendJson(res, 200, {
        architecture: 'Arquitetura Final - 3 Microsserviços Independentes (AWS)',
        dnsRoute53: 'conectcity.picos.pi.gov.br (Route 53 Hosted Zone)',
        loadBalancer: 'AWS ALB (Application Load Balancer - Multi-AZ)',
        gatewayStats,
        microservices: {
          identity: identityHealth,
          tickets: ticketsHealth,
          media: mediaHealth
        },
        observability: {
          cloudWatchLogs: cloudWatchLogs.slice(0, 30),
          xrayTraces: xrayTraces.slice(0, 25),
          cloudWatchAlarms: alarms
        }
      });
    }

    // Roteamento do API Gateway para os 3 Microsserviços
    if (pathname.startsWith('/api/')) {
      gatewayStats.totalRequests++;
      let targetBase = null;
      let targetPath = '';
      let targetServiceName = '';

      if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/users')) {
        targetBase = IDENTITY_URL;
        targetPath = pathname.replace(/^\/api/, '') + url.search;
        targetServiceName = 'identity-service (Microsserviço 1)';
        gatewayStats.routedToIdentity++;
      } else if (
        pathname.startsWith('/api/relatos') ||
        pathname.startsWith('/api/sugestoes') ||
        pathname.startsWith('/api/eventos')
      ) {
        targetBase = TICKETS_URL;
        targetPath = pathname.replace(/^\/api/, '') + url.search;
        targetServiceName = 'tickets-service (Microsserviço 2)';
        gatewayStats.routedToTickets++;
      } else if (pathname.startsWith('/api/media/')) {
        targetBase = MEDIA_URL;
        targetPath = pathname.replace(/^\/api\/media/, '') + url.search;
        targetServiceName = 'media-service (Microsserviço 3)';
        gatewayStats.routedToMedia++;
      }

      if (targetBase) {
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await parseBody(req) : null;
        const upstreamRes = await httpRequest(
          `${targetBase}${targetPath}`,
          {
            method: req.method,
            headers: {
              'X-Amzn-Trace-Id': traceId,
              Authorization: req.headers.authorization || ''
            }
          },
          body
        );

        const durationMs = Date.now() - startTime;
        recordXRayTrace({
          traceId,
          timestamp: new Date().toISOString(),
          method: req.method,
          clientPath: pathname,
          routedTo: targetServiceName,
          upstreamStatus: upstreamRes.statusCode,
          durationMs,
          flowType: targetServiceName.includes('media') ? 'ASSÍNCRONO (SQS/S3)' : 'SÍNCRONO (RDS)'
        });

        logCloudWatch(
          upstreamRes.statusCode >= 400 ? 'WARN' : 'INFO',
          targetServiceName.split(' ')[0],
          `${req.method} ${pathname} -> ${upstreamRes.statusCode} (${durationMs}ms)`,
          traceId
        );

        return sendJson(res, upstreamRes.statusCode, upstreamRes.data, {
          'X-Amzn-Trace-Id': traceId,
          'X-Routed-Microservice': targetServiceName
        });
      }
    }

    // Servir arquivos estáticos do Portal Web ConectCity (public/)
    let safePath = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.join(PUBLIC_DIR, safePath);

    // Prevenir directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    return res.end(content);
  } catch (err) {
    console.error('[API Gateway Error]', err);
    logCloudWatch('ERROR', 'api-gateway', err.message, traceId);
    return sendJson(res, 502, {
      error: 'Erro de comunicação no API Gateway: ' + err.message,
      traceId
    });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[API Gateway & Portal ConectCity] Rodando em http://localhost:${PORT}`);
  });
}

module.exports = { server, PORT };
