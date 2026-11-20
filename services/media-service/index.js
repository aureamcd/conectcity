const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { parseBody, sendJson } = require('../shared/http-helper');

const PORT = process.env.MEDIA_PORT || 4003;
const S3_BUCKET_DIR = path.join(__dirname, '..', '..', 'data', 's3_bucket');
if (!fs.existsSync(S3_BUCKET_DIR)) fs.mkdirSync(S3_BUCKET_DIR, { recursive: true });

// Simulador da Fila Amazon SQS e Dead Letter Queue (DLQ)
const sqsQueue = [];
const dlqMessages = [];
const processedMediaHistory = [];
const s3Objects = [];

let metrics = {
  service: 'media-service',
  components: ['Amazon SQS', 'Dead Letter Queue (DLQ)', 'Media Processor Worker', 'Amazon S3 Bucket', 'Amazon CloudFront CDN'],
  sqsMessagesReceived: 0,
  sqsMessagesProcessed: 0,
  dlqCount: 0,
  s3ObjectsCount: 0,
  cloudfrontHits: 0,
  startedAt: new Date().toISOString()
};

// Worker Assíncrono que consome da fila Amazon SQS
function processNextSqsMessage() {
  if (sqsQueue.length === 0) return;

  const msg = sqsQueue.shift();
  msg.status = 'PROCESSING';
  msg.attempts = (msg.attempts || 0) + 1;

  setTimeout(() => {
    try {
      // Verifica se é uma mensagem de falha simulada ou payload corrompido
      if (msg.forceError || (msg.payload && msg.payload.corrupted)) {
        throw new Error('Falha na decodificação de mídia / Formato corrompido (EXIF Sanitizer Error)');
      }

      const { entityType, entityId, fileName, base64Data, mimeType } = msg.payload;
      const cleanId = crypto.randomBytes(6).toString('hex');
      const ext = (fileName && path.extname(fileName)) || '.png';
      const s3Key = `${entityType || 'relato'}_${entityId || 'novo'}_${cleanId}${ext}`;
      const filePath = path.join(S3_BUCKET_DIR, s3Key);

      let sizeBytes = 0;
      if (base64Data && base64Data.includes('base64,')) {
        const rawBase64 = base64Data.split('base64,')[1];
        const buffer = Buffer.from(rawBase64, 'base64');
        fs.writeFileSync(filePath, buffer);
        sizeBytes = buffer.length;
      } else {
        // Cria metadado de objeto S3
        fs.writeFileSync(filePath, base64Data || 'S3_MEDIA_OBJECT');
        sizeBytes = Buffer.byteLength(base64Data || 'S3_MEDIA_OBJECT');
      }

      const cloudfrontUrl = `/api/media/cdn/${s3Key}`;
      const s3Record = {
        s3Key,
        bucket: 'conectcity-picos-media-s3',
        cloudfrontUrl,
        mimeType: mimeType || 'image/png',
        sizeBytes,
        exifSanitized: true,
        entityType,
        entityId,
        processedAt: new Date().toISOString(),
        messageId: msg.messageId
      };

      s3Objects.unshift(s3Record);
      processedMediaHistory.unshift({
        messageId: msg.messageId,
        status: 'COMPLETED',
        s3Key,
        cloudfrontUrl,
        processedAt: s3Record.processedAt
      });

      metrics.sqsMessagesProcessed++;
      metrics.s3ObjectsCount = s3Objects.length;
    } catch (err) {
      // Envia para a Dead Letter Queue (DLQ) conforme o diagrama de arquitetura
      const dlqEntry = {
        messageId: msg.messageId,
        originalQueue: 'conectcity-media-processing-sqs',
        dlqName: 'conectcity-media-dlq',
        errorReason: err.message,
        payloadSummary: {
          entityType: msg.payload?.entityType,
          fileName: msg.payload?.fileName || 'corrupted_file.raw'
        },
        failedAt: new Date().toISOString(),
        attempts: msg.attempts
      };
      dlqMessages.unshift(dlqEntry);
      metrics.dlqCount = dlqMessages.length;
    }
  }, 250);
}

// Loop do consumidor SQS a cada 300ms
setInterval(processNextSqsMessage, 300);

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // GET /health
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, {
        status: 'UP',
        ...metrics,
        queueDepth: sqsQueue.length,
        recentProcessed: processedMediaHistory.slice(0, 10),
        dlqMessages: dlqMessages.slice(0, 10),
        s3Objects: s3Objects.slice(0, 10)
      });
    }

    // POST /sqs/enqueue (Enfileira mídia no Amazon SQS para processamento assíncrono)
    if (req.method === 'POST' && pathname === '/sqs/enqueue') {
      const body = await parseBody(req);
      const messageId = 'sqs-msg-' + crypto.randomBytes(8).toString('hex');

      // Se a imagem foi enviada em base64, salvamos imediatamente para retorno rápido da URL CloudFront
      // e enfileiramos no SQS para sanitização EXIF e persistência S3 assíncrona
      let immediateUrl = body.imageUrl || null;
      if (body.base64Data && body.base64Data.startsWith('data:image')) {
        immediateUrl = body.base64Data;
      }

      const sqsEnvelope = {
        messageId,
        queue: 'arn:aws:sqs:sa-east-1:conectcity:media-queue',
        enqueuedAt: new Date().toISOString(),
        forceError: Boolean(body.forceError),
        payload: {
          entityType: body.entityType || 'relato',
          entityId: body.entityId || Date.now(),
          fileName: body.fileName || 'evidencia_picos.png',
          mimeType: body.mimeType || 'image/png',
          base64Data: body.base64Data || null,
          corrupted: Boolean(body.corrupted)
        }
      };

      sqsQueue.push(sqsEnvelope);
      metrics.sqsMessagesReceived++;

      return sendJson(res, 202, {
        status: 'ENQUEUED_SQS',
        message: 'Mídia recebida na fila Amazon SQS para processamento assíncrono e publicação no S3/CloudFront.',
        messageId,
        queueDepth: sqsQueue.length,
        previewUrl: immediateUrl
      });
    }

    // POST /sqs/simulate-dlq (Permite demonstrar o funcionamento da DLQ no vídeo!)
    if (req.method === 'POST' && pathname === '/sqs/simulate-dlq') {
      const body = await parseBody(req);
      const messageId = 'sqs-err-' + crypto.randomBytes(6).toString('hex');
      sqsQueue.push({
        messageId,
        queue: 'arn:aws:sqs:sa-east-1:conectcity:media-queue',
        enqueuedAt: new Date().toISOString(),
        forceError: true,
        payload: {
          entityType: 'relato',
          entityId: 999,
          fileName: body.fileName || 'arquivo_corrompido_malware.exe',
          corrupted: true
        }
      });
      metrics.sqsMessagesReceived++;

      return sendJson(res, 202, {
        status: 'ENQUEUED_FOR_DLQ_TEST',
        message: 'Mensagem com erro injetada na fila SQS; será redirecionada automaticamente para a Dead Letter Queue (DLQ).',
        messageId
      });
    }

    // POST /sqs/retry-dlq (Reprocessa ou limpa itens da DLQ)
    if (req.method === 'POST' && pathname === '/sqs/clear-dlq') {
      dlqMessages.length = 0;
      metrics.dlqCount = 0;
      return sendJson(res, 200, { message: 'Dead Letter Queue (DLQ) limpa com sucesso.' });
    }

    // GET /cdn/:key (Amazon CloudFront CDN Distribution)
    const cdnMatch = pathname.match(/^\/cdn\/(.+)$/);
    if (req.method === 'GET' && cdnMatch) {
      const s3Key = cdnMatch[1];
      const filePath = path.join(S3_BUCKET_DIR, path.basename(s3Key));
      if (!fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: 'Objeto não encontrado no bucket S3.' });
      }
      metrics.cloudfrontHits++;
      const buffer = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'X-Cache': 'Hit from cloudfront',
        'X-Amz-Cf-Id': crypto.randomBytes(12).toString('hex'),
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buffer);
    }

    return sendJson(res, 404, { error: 'Rota não encontrada no Serviço de Processamento de Mídia.' });
  } catch (err) {
    console.error('[Media Service Error]', err);
    return sendJson(res, 500, { error: 'Erro interno no Serviço de Mídia: ' + err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Microsserviço 3 - Mídia / SQS / S3] Rodando na porta ${PORT} | Bucket S3: ${S3_BUCKET_DIR}`);
  });
}

module.exports = { server, PORT };
