const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { parseBody, sendJson } = require('../shared/http-helper');

const PORT = process.env.IDENTITY_PORT || 4001;
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'identity_rds.sqlite');
const db = new DatabaseSync(DB_PATH);

// Inicializa o Banco Isolado do Serviço de Identidade
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL,
    telefone TEXT NOT NULL,
    endereco TEXT NOT NULL,
    bairro TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    role TEXT DEFAULT 'cidadao',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed inicial com os dados fiéis ao protótipo (Helany da Silva Araújo, Admin da Prefeitura, etc.)
const countRow = db.prepare('SELECT COUNT(*) as total FROM users').get();
if (countRow.total === 0) {
  const insert = db.prepare(`
    INSERT INTO users (nome, cpf, telefone, endereco, bairro, email, senha, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    'Helany da Silva Araújo',
    '111.222.333-44',
    '(89) 9 8888-8888',
    'Bairro São José, 175',
    'Ipueiras',
    'helany123@gmail.com',
    '123456',
    'cidadao'
  );

  insert.run(
    'Gestor Municipal - Ouvidoria Picos',
    '000.111.222-33',
    '(89) 3422-1000',
    'Praça Justino Luz, Centro Administrativo',
    'Centro',
    'admin@picos.pi.gov.br',
    'admin123',
    'admin'
  );

  insert.run(
    'Áurea Letícia Carvalho Macedo',
    '222.333.444-55',
    '(89) 9 9912-3456',
    'Av. Senador Helvídio Nunes, 1020',
    'Junco',
    'aurea@ufpi.edu.br',
    '123456',
    'admin'
  );
}

const VALID_ADMIN_CODES = ['PREFEITURA2026', 'PICOS2026', 'ADMIN123', '123456', 'ADMIN'];

let metrics = {
  service: 'identity-service',
  database: 'RDS PostgreSQL Isolado (identity_rds.sqlite)',
  requestsTotal: 0,
  loginsSuccess: 0,
  registrations: 0,
  adminElevations: 0,
  startedAt: new Date().toISOString()
};

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    nome: u.nome,
    cpf: u.cpf,
    telefone: u.telefone,
    endereco: u.endereco,
    bairro: u.bairro,
    email: u.email,
    role: u.role,
    created_at: u.created_at
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  metrics.requestsTotal++;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    // Health check & métricas
    if (req.method === 'GET' && pathname === '/health') {
      const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
      const totalAdmins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
      return sendJson(res, 200, {
        status: 'UP',
        ...metrics,
        totalUsers,
        totalAdmins
      });
    }

    // POST /auth/login
    if (req.method === 'POST' && pathname === '/auth/login') {
      const body = await parseBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const senha = (body.senha || '').trim();

      if (!email || !senha) {
        return sendJson(res, 400, { error: 'Informe o e-mail e a senha para entrar.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND senha = ?').get(email, senha);
      if (!user) {
        return sendJson(res, 401, { error: 'E-mail ou senha incorretos. Verifique suas credenciais.' });
      }

      const token = 'jwt_' + crypto.randomBytes(18).toString('hex');
      db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
      metrics.loginsSuccess++;

      return sendJson(res, 200, {
        message: 'Login realizado com sucesso!',
        token,
        user: sanitizeUser(user)
      });
    }

    // POST /auth/register (Cadastro - Cidadão)
    if (req.method === 'POST' && pathname === '/auth/register') {
      const body = await parseBody(req);
      const { nome, cpf, telefone, endereco, bairro, email, senha } = body;

      if (!nome || !email || !senha) {
        return sendJson(res, 400, { error: 'Preencha todos os campos obrigatórios (Nome, E-mail e Senha).' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email.trim().toLowerCase());
      if (existing) {
        return sendJson(res, 409, { error: 'Já existe um cidadão cadastrado com este e-mail.' });
      }

      const result = db.prepare(`
        INSERT INTO users (nome, cpf, telefone, endereco, bairro, email, senha, role)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'cidadao')
      `).run(
        nome.trim(),
        (cpf || '000.000.000-00').trim(),
        (telefone || '(89) 9 0000-0000').trim(),
        (endereco || 'Centro').trim(),
        (bairro || 'Centro').trim(),
        email.trim().toLowerCase(),
        senha.trim()
      );

      const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      const token = 'jwt_' + crypto.randomBytes(18).toString('hex');
      db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, newUser.id);
      metrics.registrations++;

      return sendJson(res, 201, {
        message: 'Cadastro realizado com sucesso!',
        token,
        user: sanitizeUser(newUser)
      });
    }

    // POST /auth/recover (Recuperar Senha)
    if (req.method === 'POST' && pathname === '/auth/recover') {
      const body = await parseBody(req);
      const { email, senha, confirmacaoSenha } = body;

      if (!email || !senha) {
        return sendJson(res, 400, { error: 'Informe o e-mail e a nova senha.' });
      }
      if (confirmacaoSenha && senha !== confirmacaoSenha) {
        return sendJson(res, 400, { error: 'A senha e a confirmação de senha não coincidem.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email.trim().toLowerCase());
      if (!user) {
        return sendJson(res, 404, { error: 'Nenhum usuário encontrado com este e-mail.' });
      }

      db.prepare('UPDATE users SET senha = ? WHERE id = ?').run(senha.trim(), user.id);
      return sendJson(res, 200, {
        message: 'Senha recuperada com sucesso!'
      });
    }

    // GET /users (Listagem de usuários)
    if (req.method === 'GET' && pathname === '/users') {
      const rows = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
      return sendJson(res, 200, rows.map(sanitizeUser));
    }

    // GET /users/:id
    const userMatch = pathname.match(/^\/users\/(\d+)$/);
    if (req.method === 'GET' && userMatch) {
      const userId = Number(userMatch[1]);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
      return sendJson(res, 200, sanitizeUser(user));
    }

    // PUT /users/:id (Configurações de Perfil)
    if (req.method === 'PUT' && userMatch) {
      const userId = Number(userMatch[1]);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });

      const body = await parseBody(req);
      const nome = body.nome ? body.nome.trim() : user.nome;
      const cpf = body.cpf ? body.cpf.trim() : user.cpf;
      const telefone = body.telefone ? body.telefone.trim() : user.telefone;
      const endereco = body.endereco ? body.endereco.trim() : user.endereco;
      const bairro = body.bairro ? body.bairro.trim() : user.bairro;
      const email = body.email ? body.email.trim().toLowerCase() : user.email;
      const senha = body.senha && body.senha.trim() !== '' && !body.senha.startsWith('***')
        ? body.senha.trim()
        : user.senha;

      db.prepare(`
        UPDATE users
        SET nome = ?, cpf = ?, telefone = ?, endereco = ?, bairro = ?, email = ?, senha = ?
        WHERE id = ?
      `).run(nome, cpf, telefone, endereco, bairro, email, senha, userId);

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      return sendJson(res, 200, {
        message: 'Informações salvas com sucesso!',
        user: sanitizeUser(updated)
      });
    }

    // POST /users/:id/admin-auth (Modal: Autenticação de Administrador)
    const adminMatch = pathname.match(/^\/users\/(\d+)\/admin-auth$/);
    if (req.method === 'POST' && adminMatch) {
      const userId = Number(adminMatch[1]);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });

      const body = await parseBody(req);
      const codigo = (body.codigo || '').trim().toUpperCase();

      if (!VALID_ADMIN_CODES.includes(codigo)) {
        return sendJson(res, 403, {
          error: 'Código de administrador inválido. Utilize o código fornecido pela Prefeitura de Picos (ex: PREFEITURA2026).'
        });
      }

      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId);
      metrics.adminElevations++;
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

      return sendJson(res, 200, {
        message: 'Função de Administrador liberada com sucesso!',
        user: sanitizeUser(updated)
      });
    }

    return sendJson(res, 404, { error: 'Rota não encontrada no Serviço de Identidade.' });
  } catch (err) {
    console.error('[Identity Service Error]', err);
    return sendJson(res, 500, { error: 'Erro interno no Serviço de Identidade: ' + err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Microsserviço 1 - Identidade] Rodando na porta ${PORT} | DB Isolado: ${DB_PATH}`);
  });
}

module.exports = { server, PORT };
