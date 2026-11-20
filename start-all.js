/**
 * Orquestrador dos 3 Microsserviços Independentes + API Gateway do ConectCity
 * - Microsserviço 1: Serviço de Identidade (Porta 4001 | DB Isolado: identity_rds.sqlite)
 * - Microsserviço 2: Serviço de Chamados   (Porta 4002 | DB Isolado: tickets_rds.sqlite)
 * - Microsserviço 3: Processamento de Mídia (Porta 4003 | Amazon SQS + DLQ + S3 + CloudFront)
 * - API Gateway & Portal Web ConectCity    (Porta 3000 | Route 53 + ALB + CloudWatch + X-Ray)
 */

const identityService = require('./services/identity-service/index');
const mediaService = require('./services/media-service/index');
const ticketsService = require('./services/tickets-service/index');
const apiGateway = require('./services/api-gateway/index');

console.log('======================================================================');
console.log('   CONECT-CITY | MUNICÍPIO DE PICOS - PI (ARQUITETURA MICROSSERVIÇOS) ');
console.log('======================================================================');

identityService.server.listen(identityService.PORT, () => {
  console.log(`✔ [1/4] Serviço de Identidade (RDS Isolado)     -> http://localhost:${identityService.PORT}`);
});

ticketsService.server.listen(ticketsService.PORT, () => {
  console.log(`✔ [2/4] Serviço de Chamados (RDS Isolado)       -> http://localhost:${ticketsService.PORT}`);
});

mediaService.server.listen(mediaService.PORT, () => {
  console.log(`✔ [3/4] Serviço de Mídia (SQS + DLQ + S3 + CDN) -> http://localhost:${mediaService.PORT}`);
});

apiGateway.server.listen(apiGateway.PORT, () => {
  console.log(`✔ [4/4] API Gateway + Portal Web ConectCity     -> http://localhost:${apiGateway.PORT}`);
  console.log('======================================================================');
  console.log('>>> Acesse no navegador: http://localhost:3000');
  console.log('>>> Credenciais de Teste:');
  console.log('    • Cidadã (Protótipo): helany123@gmail.com | Senha: 123456');
  console.log('    • Prefeitura (Admin): admin@picos.pi.gov.br | Senha: admin123');
  console.log('    • Código "Sou Administrador" no Perfil: PREFEITURA2026');
  console.log('======================================================================');
});
