const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { parseBody, sendJson, httpRequest } = require('../shared/http-helper');

const PORT = process.env.TICKETS_PORT || 4002;
const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:4003';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'tickets_rds.sqlite');
const db = new DatabaseSync(DB_PATH);

// Inicializa o Banco Isolado do Serviço de Chamados (RDS PostgreSQL / SQLite)
db.exec(`
  CREATE TABLE IF NOT EXISTS relatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocolo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    endereco TEXT NOT NULL,
    bairro TEXT NOT NULL,
    descricao TEXT NOT NULL,
    status TEXT DEFAULT 'Pendente',
    avaliacao REAL DEFAULT 3.2,
    votos INTEGER DEFAULT 5,
    imagem TEXT,
    sqs_message_id TEXT,
    devolutiva TEXT,
    data_devolutiva TEXT,
    autor_nome TEXT DEFAULT 'Cidadão Picoense',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sugestoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocolo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    bairro TEXT DEFAULT 'Centro',
    categoria TEXT DEFAULT 'Melhoria Urbana',
    descricao_problema TEXT NOT NULL,
    descricao_solucao TEXT NOT NULL,
    status TEXT DEFAULT 'Em Análise',
    avaliacao REAL DEFAULT 4.5,
    devolutiva TEXT,
    data_devolutiva TEXT,
    autor_nome TEXT DEFAULT 'Cidadão Picoense',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    categoria TEXT DEFAULT 'Lazer',
    local TEXT DEFAULT 'Ipueiras - Antônio Claro',
    modalidade TEXT DEFAULT 'Presencial',
    data_evento TEXT NOT NULL,
    descricao TEXT NOT NULL,
    avaliacao REAL DEFAULT 3.2,
    imagem TEXT,
    sqs_message_id TEXT,
    aprovado_portal INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migração automática para garantir a coluna aprovado_portal (0 = aguardando liberação do Admin, 1 = liberado no portal)
for (const table of ['relatos', 'sugestoes', 'eventos']) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN aprovado_portal INTEGER DEFAULT 1`);
  } catch (_) {}
}

// Seed inicial fiel aos protótipos do Figma (Buracos na Ipueiras, Eventos de Picos, Sugestões)
const relatosCount = db.prepare('SELECT COUNT(*) as c FROM relatos').get().c;
if (relatosCount === 0) {
  const insRelato = db.prepare(`
    INSERT INTO relatos (protocolo, titulo, categoria, endereco, bairro, descricao, status, avaliacao, imagem, devolutiva, data_devolutiva, autor_nome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const descPadraoIpueiras =
    'Os buracos na estrada têm se tornado um problema recorrente e vêm causando diversos transtornos aos moradores há vários meses. As vias apresentam crateras que dificultam a circulação de veículos e pedestres, aumentando o risco de acidentes. Motoristas precisam desviar constantemente, o que provoca congestionamentos e danos aos veículos. Além disso, em períodos de chuva, os buracos se enchem de água, ficando quase invisíveis e tornando a situação ainda mais perigosa.';
  const devolutivaPadrao =
    'O caso já foi analisado pela Secretaria Municipal de Obras e Infraestrutura de Picos e está sendo tratado com prioridade. A equipe de pavimentação asfáltica e operação tapa-buracos já incluiu o trecho da Rua Antônio Claro no cronograma desta quinzena.';

  const seedRelatos = [
    ['PICOS-2026-0101', 'Buracos na Ipueiras', 'Infraestrutura', 'Antônio Claro', 'Ipueiras', descPadraoIpueiras, 'Em Análise', 3.2, '/assets/buraco_real.png', devolutivaPadrao, '15/11/2025', 'Helany da Silva Araújo'],
    ['PICOS-2026-0102', 'Buracos na Ipueiras', 'Infraestrutura', 'Rua São José, 175', 'Ipueiras', descPadraoIpueiras, 'Pendente', 3.2, '/assets/buraco_real.png', 'Aguardando vistoria técnica da equipe de engenharia municipal.', '16/11/2025', 'Helany da Silva Araújo'],
    ['PICOS-2026-0103', 'Buracos na Ipueiras', 'Infraestrutura', 'Av. Principal Ipueiras', 'Ipueiras', descPadraoIpueiras, 'Em Andamento', 3.2, '/assets/buraco_real.png', devolutivaPadrao, '15/11/2025', 'Carlos Eduardo Almondes'],
    ['PICOS-2026-0104', 'Iluminação precária no Junco', 'Iluminação Pública', 'Av. Senador Helvídio Nunes', 'Junco', 'Cinco postes consecutivos próximos ao campus da UFPI estão com as luminárias de LED apagadas há duas semanas, gerando insegurança para estudantes e moradores no período noturno.', 'Em Análise', 4.1, '/assets/iluminacao_real.jpg', 'Chamado encaminhado para a equipe de manutenção elétrica (FUMIP). Substituição dos reatores agendada.', '18/11/2025', 'Áurea Letícia Carvalho'],
    ['PICOS-2026-0105', 'Manutenção asfáltica no Canto da Várzea', 'Infraestrutura', 'Rua Coelho Rodrigues', 'Canto da Várzea', 'Desgaste severo da camada asfáltica próximo à praça principal, prejudicando o tráfego de ônibus e motocicletas nos horários de pico.', 'Em Andamento', 3.8, '/assets/buraco_real.png', 'Maquinário de recapeamento já mobilizado no setor central.', '14/11/2025', 'Elder Matheus Maia'],
    ['PICOS-2026-0106', 'Drenagem pluvial na Boa Sorte', 'Infraestrutura', 'Rua Projetada 12', 'Boa Sorte', 'Galerias pluviais obstruídas causam acúmulo de água sempre que ocorrem chuvas fortes na região.', 'Em Análise', 3.5, '/assets/saneamento_real.jpg', 'Equipe de limpeza urbana notificada para desobstrução preventiva das bocas de lobo.', '17/11/2025', 'Douglas Almondes'],
    ['PICOS-2026-0107', 'Buracos na Ipueiras - Trecho II', 'Infraestrutura', 'Travessa Santo Antônio', 'Ipueiras', descPadraoIpueiras, 'Cancelado', 3.2, '/assets/buraco_real.png', 'Chamado unificado ao protocolo principal PICOS-2026-0101 para atendimento conjunto na mesma via.', '12/11/2025', 'Helany da Silva Araújo'],
    ['PICOS-2026-0108', 'Reparo concluído na Av. Beira Rio', 'Infraestrutura', 'Av. Beira Rio', 'Centro', 'Afundamento de calçamento e meio-fio danificado ao longo do calçadão da Beira Rio.', 'Concluído', 4.9, '/assets/concluido_real.jpg', 'Serviço de recomposição de pavimento intertravado e meio-fio 100% concluído pela Secretaria de Obras.', '10/11/2025', 'Marcos Vinícius Moura'],
    ['PICOS-2026-0109', 'Coleta de resíduos no bairro DNER', 'Limpeza Urbana', 'Rua Monsenhor Hipólito', 'DNER', 'Necessidade de instalação de novos contêineres coletores e regularização do horário do caminhão compactador.', 'Em Análise', 3.6, '/assets/limpeza_real.jpg', 'Secretaria de Serviços Públicos está revisando a rota do setor DNER.', '18/11/2025', 'Fernanda Lima'],
    ['PICOS-2026-0110', 'Sinalização viária nas Pedrinhas', 'Trânsito', 'Cruzamento Av. Deputado Sá Urtiga', 'Pedrinhas', 'Faixa de pedestres apagada e necessidade de redutor de velocidade próximo à escola municipal.', 'Em Andamento', 4.2, '/assets/transito_real.jpg', 'DMTRANS aprovou a implantação de faixa elevada e pintura termoplástica.', '15/11/2025', 'João Pedro Rocha'],
    ['PICOS-2026-0111', 'Pavimentação concluída na Ipueiras', 'Infraestrutura', 'Rua Padre Madeira', 'Ipueiras', 'Trecho crítico que apresentava buracos foi devidamente recapeado após solicitação na ouvidoria ConectCity.', 'Concluído', 4.8, '/assets/concluido_real.jpg', 'Obra entregue e vistoriada pela engenharia municipal.', '09/11/2025', 'Helany da Silva Araújo'],
    ['PICOS-2026-0112', 'Podas de árvores no bairro Pantanal', 'Meio Ambiente', 'Rua São Francisco', 'Pantanal', 'Galhos de árvores atingindo a rede de baixa tensão e obstruindo a iluminação dos postes.', 'Pendente', 3.4, '/assets/limpeza_real.jpg', 'Aguardando programação conjunta com a concessionária de energia.', '19/11/2025', 'Ana Beatriz Sousa']
  ];

  for (const r of seedRelatos) {
    insRelato.run(...r);
  }
}

const eventosCount = db.prepare('SELECT COUNT(*) as c FROM eventos').get().c;
if (eventosCount === 0) {
  const insEvento = db.prepare(`
    INSERT INTO eventos (titulo, categoria, local, modalidade, data_evento, descricao, avaliacao, imagem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insEvento.run(
    'Aniversário de Picos',
    'Lazer',
    'Praça Justino Luz / Beira Rio - Centro',
    'Presencial',
    '12/12/2024',
    'Comemoração oficial do aniversário de emancipação política de Picos (Cidade Modelo). A programação conta com atos cívicos, inaugurações de obras municipais, feira da agricultura familiar e grandes shows musicais gratuitos para toda a população picoense.',
    3.2,
    '/assets/evento_aniversario.svg'
  );

  insEvento.run(
    'Dia das Crianças',
    'Lazer',
    'Ipueiras - Antônio Claro',
    'Presencial',
    '10/10/2024',
    'A cidade se prepara para celebrar o Dia das Crianças com uma grande festa voltada ao lazer e à diversão dos pequenos. O evento contará com atrações especiais como Mundo Bita, Be The Best e diversas outras atividades pensadas para encantar crianças de todas as idades. Com música, brincadeiras e apresentações interativas, a programação tem o objetivo de proporcionar um dia de alegria, inclusão e convivência para as famílias.',
    3.2,
    '/assets/evento_criancas.svg'
  );

  insEvento.run(
    'Picos Geek Show',
    'Infraestrutura',
    'Complexo Cultural / Centro de Picos',
    'Presencial',
    '11/10/2025',
    'O maior encontro de cultura pop, tecnologia, inovação, games e empreendedorismo digital da macrorregião de Picos. Conta com arenas de e-sports, oficinas de robótica, palestras de desenvolvimento de software, concursos de cosplay e estandes de universidades.',
    3.2,
    '/assets/evento_geek.svg'
  );
}

const sugestoesCount = db.prepare('SELECT COUNT(*) as c FROM sugestoes').get().c;
if (sugestoesCount === 0) {
  const insSugestao = db.prepare(`
    INSERT INTO sugestoes (protocolo, titulo, bairro, categoria, descricao_problema, descricao_solucao, status, avaliacao, devolutiva, data_devolutiva, autor_nome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insSugestao.run(
    'SUG-2026-001',
    'Ciclovia e Pista de Cooper na Av. Beira Rio',
    'Centro / Ipueiras',
    'Mobilidade e Lazer',
    'Moradores que praticam caminhada, corrida e ciclismo na Av. Beira Rio disputam espaço com veículos automotores nos horários de pico, gerando riscos de acidentes.',
    'Implantação de uma ciclovia demarcada com tachões refletivos, iluminação em LED solar e estações de hidratação ao longo de toda a extensão da Av. Beira Rio.',
    'Em Análise',
    4.9,
    'Proposta encaminhada à Secretaria de Planejamento e DMTRANS para estudo de viabilidade no orçamento participativo de 2026.',
    '16/11/2025',
    'Helany da Silva Araújo'
  );

  insSugestao.run(
    'SUG-2026-002',
    'Pontos de Wi-Fi Público nas Praças de Picos',
    'Centro / Junco',
    'Cidade Inteligente',
    'Estudantes e cidadãos que aguardam transporte público nas principais praças não dispõem de conectividade gratuita para acessar serviços digitais da prefeitura.',
    'Instalação de roteadores Wi-Fi públicos gratuitos (Programa Picos Digital) na Praça Félix Pacheco, Praça Justino Luz e Praça do Junco.',
    'Aprovada',
    4.8,
    'Projeto aprovado! A licitação dos links dedicados de fibra óptica já foi concluída.',
    '14/11/2025',
    'Áurea Letícia Carvalho'
  );

  insSugestao.run(
    'SUG-2026-003',
    'Ecopontos de Coleta Seletiva nos Bairros',
    'Ipueiras / Boa Sorte',
    'Meio Ambiente',
    'O descarte incorreto de recicláveis misturados ao lixo comum reduz a vida útil do aterro e prejudica o trabalho das cooperativas de reciclagem de Picos.',
    'Criação de Ecopontos com contêineres identificados por cores em 10 bairros estratégicos, integrados com aplicativo de agendamento de coleta.',
    'Em Implementação',
    4.7,
    'Os 4 primeiros Ecopontos já estão sendo instalados pela Secretaria de Meio Ambiente.',
    '18/11/2025',
    'Elder Matheus Maia'
  );
}

let metrics = {
  service: 'tickets-service',
  database: 'RDS PostgreSQL Isolado (tickets_rds.sqlite)',
  requestsTotal: 0,
  relatosCreated: 0,
  sugestoesCreated: 0,
  eventosCreated: 0,
  sqsEventsPublished: 0,
  startedAt: new Date().toISOString()
};

async function publishMediaToSqs(entityType, entityId, fileName, base64Data) {
  try {
    const resp = await httpRequest(`${MEDIA_SERVICE_URL}/sqs/enqueue`, { method: 'POST' }, {
      entityType,
      entityId,
      fileName: fileName || `${entityType}_${entityId}.png`,
      base64Data
    });
    metrics.sqsEventsPublished++;
    return resp.data;
  } catch (err) {
    console.warn('[Tickets -> SQS Warning] Não foi possível publicar no SQS:', err.message);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  metrics.requestsTotal++;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // GET /health
    if (req.method === 'GET' && pathname === '/health') {
      const totalRelatos = db.prepare('SELECT COUNT(*) as c FROM relatos').get().c;
      const totalSugestoes = db.prepare('SELECT COUNT(*) as c FROM sugestoes').get().c;
      const totalEventos = db.prepare('SELECT COUNT(*) as c FROM eventos').get().c;
      return sendJson(res, 200, {
        status: 'UP',
        ...metrics,
        counts: {
          relatos: totalRelatos,
          sugestoes: totalSugestoes,
          eventos: totalEventos
        }
      });
    }

    // =========================================================================
    // RELATOS
    // =========================================================================
    if (req.method === 'GET' && pathname === '/relatos') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const status = (url.searchParams.get('status') || '').trim();
      const categoria = (url.searchParams.get('categoria') || '').trim();
      const isAdmin = url.searchParams.get('admin') === '1';

      let rows = db.prepare(`
        SELECT * FROM relatos
        ORDER BY
          CASE WHEN IFNULL(aprovado_portal, 1) = 0 THEN 0 ELSE 1 END ASC,
          CASE WHEN id > 12 THEN 0 ELSE 1 END ASC,
          CASE WHEN id > 12 THEN -id ELSE id END ASC
      `).all();

      if (!isAdmin) {
        rows = rows.filter((r) => Number(r.aprovado_portal ?? 1) === 1);
      }
      if (q) {
        rows = rows.filter(
          (r) =>
            r.titulo.toLowerCase().includes(q) ||
            r.bairro.toLowerCase().includes(q) ||
            r.categoria.toLowerCase().includes(q) ||
            r.descricao.toLowerCase().includes(q) ||
            r.protocolo.toLowerCase().includes(q)
        );
      }
      if (status) {
        rows = rows.filter((r) => r.status.toLowerCase() === status.toLowerCase());
      }
      if (categoria) {
        rows = rows.filter((r) => r.categoria.toLowerCase() === categoria.toLowerCase());
      }
      return sendJson(res, 200, rows);
    }

    if (req.method === 'POST' && pathname === '/relatos') {
      const body = await parseBody(req);
      const { titulo, categoria, endereco, bairro, descricao, imagem, nomeArquivo, autor_nome } = body;

      if (!titulo || !descricao) {
        return sendJson(res, 400, { error: 'Informe o Título e a Descrição do relato.' });
      }

      const nextNum = 100 + db.prepare('SELECT COUNT(*) as c FROM relatos').get().c + 1;
      const protocolo = `PICOS-2026-0${nextNum}`;
      const imgFinal = imagem || '/assets/buraco_real.png';

      // Novo relato entra com aprovado_portal = 0 (aguardando o Administrador liberar a ida para o portal)
      const result = db.prepare(`
        INSERT INTO relatos (protocolo, titulo, categoria, endereco, bairro, descricao, status, avaliacao, imagem, devolutiva, data_devolutiva, autor_nome, aprovado_portal)
        VALUES (?, ?, ?, ?, ?, ?, 'Pendente', 4.5, ?, 'Relato recebido na triagem interna. Aguardando liberação do Administrador para publicação no portal.', ?, ?, 0)
      `).run(
        protocolo,
        titulo.trim(),
        (categoria || 'Infraestrutura').trim(),
        (endereco || 'Centro').trim(),
        (bairro || 'Ipueiras').trim(),
        descricao.trim(),
        imgFinal,
        new Date().toLocaleDateString('pt-BR'),
        autor_nome || 'Cidadão Picoense'
      );

      const newId = result.lastInsertRowid;
      metrics.relatosCreated++;

      // Dispara fluxo assíncrono no Amazon SQS -> Serviço de Processamento de Mídia -> S3
      let sqsInfo = null;
      if (imagem) {
        sqsInfo = await publishMediaToSqs('relato', newId, nomeArquivo || 'relato_foto.png', imagem);
        if (sqsInfo && sqsInfo.messageId) {
          db.prepare('UPDATE relatos SET sqs_message_id = ? WHERE id = ?').run(sqsInfo.messageId, newId);
        }
      }

      const created = db.prepare('SELECT * FROM relatos WHERE id = ?').get(newId);
      return sendJson(res, 201, {
        message: 'Relato enviado para triagem! Aguardando liberação do Administrador para ir ao portal.',
        relato: created,
        asyncMediaPipeline: sqsInfo
      });
    }

    // PUT /relatos/:id (Liberação para o Portal, Edição completa pelo Admin, Status, Devolutiva ou Avaliação)
    const relatoMatch = pathname.match(/^\/relatos\/(\d+)$/);
    if (req.method === 'PUT' && relatoMatch) {
      const id = Number(relatoMatch[1]);
      const existing = db.prepare('SELECT * FROM relatos WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Relato não encontrado.' });

      const body = await parseBody(req);
      const titulo = body.titulo !== undefined ? body.titulo.trim() : existing.titulo;
      const categoria = body.categoria !== undefined ? body.categoria.trim() : existing.categoria;
      const bairro = body.bairro !== undefined ? body.bairro.trim() : existing.bairro;
      const endereco = body.endereco !== undefined ? body.endereco.trim() : existing.endereco;
      const descricao = body.descricao !== undefined ? body.descricao.trim() : existing.descricao;
      const aprovado_portal = body.aprovado_portal !== undefined ? Number(body.aprovado_portal) : Number(existing.aprovado_portal ?? 1);
      let status = body.status || existing.status;
      let devolutiva = body.devolutiva !== undefined ? body.devolutiva : existing.devolutiva;

      if (body.aprovado_portal === 1 && Number(existing.aprovado_portal ?? 1) === 0) {
        if (!body.status || status === 'Pendente') status = 'Em Análise';
        if (!body.devolutiva || devolutiva.includes('Aguardando liberação')) {
          devolutiva = 'Relato liberado e publicado no portal pela Prefeitura Municipal de Picos. Encaminhado para a secretaria responsável.';
        }
      }

      const data_devolutiva = (body.devolutiva !== undefined || body.aprovado_portal !== undefined)
        ? new Date().toLocaleDateString('pt-BR')
        : existing.data_devolutiva;
      const avaliacao = body.avaliacao !== undefined ? Number(body.avaliacao) : existing.avaliacao;

      db.prepare(`
        UPDATE relatos
        SET titulo = ?, categoria = ?, bairro = ?, endereco = ?, descricao = ?, status = ?, devolutiva = ?, data_devolutiva = ?, avaliacao = ?, aprovado_portal = ?
        WHERE id = ?
      `).run(titulo, categoria, bairro, endereco, descricao, status, devolutiva, data_devolutiva, avaliacao, aprovado_portal, id);

      const updated = db.prepare('SELECT * FROM relatos WHERE id = ?').get(id);
      return sendJson(res, 200, {
        message: 'Relato atualizado com sucesso!',
        relato: updated
      });
    }

    if (req.method === 'DELETE' && relatoMatch) {
      const id = Number(relatoMatch[1]);
      db.prepare('DELETE FROM relatos WHERE id = ?').run(id);
      return sendJson(res, 200, { message: 'Relato excluído com sucesso!' });
    }

    // =========================================================================
    // SUGESTÕES / SOLUÇÕES
    // =========================================================================
    if (req.method === 'GET' && pathname === '/sugestoes') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const isAdmin = url.searchParams.get('admin') === '1';

      let rows = db.prepare(`
        SELECT * FROM sugestoes
        ORDER BY CASE WHEN IFNULL(aprovado_portal, 1) = 0 THEN 0 ELSE 1 END ASC, id DESC
      `).all();

      if (!isAdmin) {
        rows = rows.filter((s) => Number(s.aprovado_portal ?? 1) === 1);
      }
      if (q) {
        rows = rows.filter(
          (s) =>
            s.titulo.toLowerCase().includes(q) ||
            s.descricao_problema.toLowerCase().includes(q) ||
            s.descricao_solucao.toLowerCase().includes(q)
        );
      }
      return sendJson(res, 200, rows);
    }

    if (req.method === 'POST' && pathname === '/sugestoes') {
      const body = await parseBody(req);
      const { titulo, descricao_problema, descricao_solucao, bairro, categoria, autor_nome } = body;

      if (!titulo || !descricao_problema || !descricao_solucao) {
        return sendJson(res, 400, { error: 'Preencha o título, a descrição do problema e a descrição da solução.' });
      }

      const nextNum = db.prepare('SELECT COUNT(*) as c FROM sugestoes').get().c + 1;
      const protocolo = `SUG-2026-00${nextNum}`;

      // Nova sugestão entra com aprovado_portal = 0 aguardando liberação do Administrador
      const result = db.prepare(`
        INSERT INTO sugestoes (protocolo, titulo, bairro, categoria, descricao_problema, descricao_solucao, status, avaliacao, devolutiva, data_devolutiva, autor_nome, aprovado_portal)
        VALUES (?, ?, ?, ?, ?, ?, 'Pendente', 5.0, 'Sugestão recebida na triagem interna. Aguardando liberação do Administrador para publicação no portal.', ?, ?, 0)
      `).run(
        protocolo,
        titulo.trim(),
        (bairro || 'Picos - PI').trim(),
        (categoria || 'Melhoria Urbana').trim(),
        descricao_problema.trim(),
        descricao_solucao.trim(),
        new Date().toLocaleDateString('pt-BR'),
        autor_nome || 'Cidadão Picoense'
      );

      metrics.sugestoesCreated++;
      const created = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(result.lastInsertRowid);
      return sendJson(res, 201, {
        message: 'Sugestão enviada para triagem! Aguardando liberação do Administrador para ir ao portal.',
        sugestao: created
      });
    }

    const sugestaoMatch = pathname.match(/^\/sugestoes\/(\d+)$/);
    if (req.method === 'PUT' && sugestaoMatch) {
      const id = Number(sugestaoMatch[1]);
      const existing = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Sugestão não encontrada.' });

      const body = await parseBody(req);
      const titulo = body.titulo !== undefined ? body.titulo.trim() : existing.titulo;
      const bairro = body.bairro !== undefined ? body.bairro.trim() : existing.bairro;
      const categoria = body.categoria !== undefined ? body.categoria.trim() : existing.categoria;
      const descricao_problema = body.descricao_problema !== undefined ? body.descricao_problema.trim() : existing.descricao_problema;
      const descricao_solucao = body.descricao_solucao !== undefined ? body.descricao_solucao.trim() : existing.descricao_solucao;
      const aprovado_portal = body.aprovado_portal !== undefined ? Number(body.aprovado_portal) : Number(existing.aprovado_portal ?? 1);
      let status = body.status || existing.status;
      let devolutiva = body.devolutiva !== undefined ? body.devolutiva : existing.devolutiva;

      if (body.aprovado_portal === 1 && Number(existing.aprovado_portal ?? 1) === 0) {
        if (!body.status || status === 'Pendente') status = 'Em Análise';
        if (!body.devolutiva || devolutiva.includes('Aguardando liberação')) {
          devolutiva = 'Sugestão liberada pelo Administrador para votação e acompanhamento público no portal ConectCity.';
        }
      }

      const data_devolutiva = new Date().toLocaleDateString('pt-BR');

      db.prepare(`
        UPDATE sugestoes
        SET titulo = ?, bairro = ?, categoria = ?, descricao_problema = ?, descricao_solucao = ?, status = ?, devolutiva = ?, data_devolutiva = ?, aprovado_portal = ?
        WHERE id = ?
      `).run(titulo, bairro, categoria, descricao_problema, descricao_solucao, status, devolutiva, data_devolutiva, aprovado_portal, id);

      const updated = db.prepare('SELECT * FROM sugestoes WHERE id = ?').get(id);
      return sendJson(res, 200, {
        message: 'Sugestão atualizada com sucesso!',
        sugestao: updated
      });
    }

    if (req.method === 'DELETE' && sugestaoMatch) {
      const id = Number(sugestaoMatch[1]);
      db.prepare('DELETE FROM sugestoes WHERE id = ?').run(id);
      return sendJson(res, 200, { message: 'Sugestão excluída com sucesso!' });
    }

    // =========================================================================
    // EVENTOS
    // =========================================================================
    if (req.method === 'GET' && pathname === '/eventos') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const isAdmin = url.searchParams.get('admin') === '1';

      let rows = db.prepare(`
        SELECT * FROM eventos
        ORDER BY
          CASE WHEN IFNULL(aprovado_portal, 1) = 0 THEN 0 ELSE 1 END ASC,
          CASE WHEN id > 3 THEN 0 ELSE 1 END ASC,
          CASE WHEN id > 3 THEN -id ELSE id END ASC
      `).all();

      if (!isAdmin) {
        rows = rows.filter((e) => Number(e.aprovado_portal ?? 1) === 1);
      }
      if (q) {
        rows = rows.filter(
          (e) =>
            e.titulo.toLowerCase().includes(q) ||
            e.descricao.toLowerCase().includes(q) ||
            e.local.toLowerCase().includes(q) ||
            e.categoria.toLowerCase().includes(q)
        );
      }
      return sendJson(res, 200, rows);
    }

    if (req.method === 'POST' && pathname === '/eventos') {
      const body = await parseBody(req);
      const { titulo, modalidade, data_evento, descricao, local, categoria, imagem, nomeArquivo } = body;

      if (!titulo || !descricao) {
        return sendJson(res, 400, { error: 'Informe o título e a descrição do evento.' });
      }

      const imgFinal = imagem || '/assets/evento_aniversario.svg';
      const result = db.prepare(`
        INSERT INTO eventos (titulo, categoria, local, modalidade, data_evento, descricao, avaliacao, imagem, aprovado_portal)
        VALUES (?, ?, ?, ?, ?, ?, 4.8, ?, 0)
      `).run(
        titulo.trim(),
        (categoria || 'Lazer').trim(),
        (local || 'Picos - PI').trim(),
        (modalidade || 'Presencial').trim(),
        (data_evento || new Date().toLocaleDateString('pt-BR')).trim(),
        descricao.trim(),
        imgFinal
      );

      const newId = result.lastInsertRowid;
      metrics.eventosCreated++;

      let sqsInfo = null;
      if (imagem) {
        sqsInfo = await publishMediaToSqs('evento', newId, nomeArquivo || 'evento_banner.png', imagem);
        if (sqsInfo && sqsInfo.messageId) {
          db.prepare('UPDATE eventos SET sqs_message_id = ? WHERE id = ?').run(sqsInfo.messageId, newId);
        }
      }

      const created = db.prepare('SELECT * FROM eventos WHERE id = ?').get(newId);
      return sendJson(res, 201, {
        message: 'Evento enviado para triagem! Aguardando liberação do Administrador para ir ao portal.',
        evento: created,
        asyncMediaPipeline: sqsInfo
      });
    }

    const eventoMatch = pathname.match(/^\/eventos\/(\d+)$/);
    if (req.method === 'PUT' && eventoMatch) {
      const id = Number(eventoMatch[1]);
      const existing = db.prepare('SELECT * FROM eventos WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Evento não encontrado.' });

      const body = await parseBody(req);
      const titulo = body.titulo !== undefined ? body.titulo.trim() : existing.titulo;
      const categoria = body.categoria !== undefined ? body.categoria.trim() : existing.categoria;
      const local = body.local !== undefined ? body.local.trim() : existing.local;
      const modalidade = body.modalidade !== undefined ? body.modalidade.trim() : existing.modalidade;
      const data_evento = body.data_evento !== undefined ? body.data_evento.trim() : existing.data_evento;
      const descricao = body.descricao !== undefined ? body.descricao.trim() : existing.descricao;
      const aprovado_portal = body.aprovado_portal !== undefined ? Number(body.aprovado_portal) : Number(existing.aprovado_portal ?? 1);

      db.prepare(`
        UPDATE eventos
        SET titulo = ?, categoria = ?, local = ?, modalidade = ?, data_evento = ?, descricao = ?, aprovado_portal = ?
        WHERE id = ?
      `).run(titulo, categoria, local, modalidade, data_evento, descricao, aprovado_portal, id);

      const updated = db.prepare('SELECT * FROM eventos WHERE id = ?').get(id);
      return sendJson(res, 200, {
        message: 'Evento atualizado com sucesso!',
        evento: updated
      });
    }

    if (req.method === 'DELETE' && eventoMatch) {
      const id = Number(eventoMatch[1]);
      db.prepare('DELETE FROM eventos WHERE id = ?').run(id);
      return sendJson(res, 200, { message: 'Evento excluído com sucesso!' });
    }

    return sendJson(res, 404, { error: 'Rota não encontrada no Serviço de Chamados.' });
  } catch (err) {
    console.error('[Tickets Service Error]', err);
    return sendJson(res, 500, { error: 'Erro interno no Serviço de Chamados: ' + err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Microsserviço 2 - Chamados] Rodando na porta ${PORT} | DB Isolado: ${DB_PATH}`);
  });
}

module.exports = { server, PORT };
