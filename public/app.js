/**
 * Frontend SPA do Portal ConectCity - Município de Picos - PI
 * Conecta-se ao API Gateway (/api/*) que roteia para os 3 Microsserviços Independentes:
 * 1. Serviço de Identidade (/api/auth/*, /api/users/*)
 * 2. Serviço de Chamados (/api/relatos/*, /api/sugestoes/*, /api/eventos/*)
 * 3. Serviço de Processamento de Mídia (/api/media/* - SQS + DLQ + S3 + CloudFront)
 */

let currentUser = null;
let authToken = null;
let allRelatos = [];
let allSugestoes = [];
let allEventos = [];
let currentRelatosPage = 1;
const RELATOS_PER_PAGE = 9;
let selectedRelato = null;
let selectedSugestao = null;
let selectedEvento = null;
let uploadedRelatoImageBase64 = null;
let uploadedRelatoFileName = null;
let uploadedEventoImageBase64 = null;
let uploadedEventoFileName = null;
let baseFontSize = 15;

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('conectcity_user');
  const savedToken = localStorage.getItem('conectcity_token');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      authToken = savedToken;
      updateNavbarAuthUI();
    } catch (_) {}
  }

  loadRelatos(1);
  loadSugestoes();
  loadEventos();
});

// =========================================================================
// ACESSIBILIDADE (A+, A-, A, Alto Contraste)
// =========================================================================
function changeFontSize(delta) {
  baseFontSize = Math.min(20, Math.max(12, baseFontSize + delta));
  document.documentElement.style.setProperty('--base-font-size', baseFontSize + 'px');
}

function resetFontSize() {
  baseFontSize = 15;
  document.documentElement.style.setProperty('--base-font-size', '15px');
}

function toggleContrast() {
  document.body.classList.toggle('high-contrast');
}

// =========================================================================
// POP-OUTS / TOASTS (Idênticos aos Pop-outs do Protótipo Figma)
// =========================================================================
function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'proto-toast' + (isError ? ' toast-error' : '');
  toast.innerHTML = `
    <div class="toast-check-circle" style="${isError ? 'border-color:#ef4444;color:#ef4444;' : ''}">
      ${isError ? '!' : '✓'}
    </div>
    <div class="toast-msg">${message}</div>
    <button type="button" class="toast-close-red" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4500);
}

// =========================================================================
// NAVEGAÇÃO ENTRE TELAS (SPA)
// =========================================================================
function navigateTo(viewName) {
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.remove('active');
  });
  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.classList.add('active');
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const v = btn.getAttribute('data-view');
    if (v === viewName || (viewName === 'perfil' && v === 'login')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'relatos') loadRelatos(currentRelatosPage);
  if (viewName === 'sugestoes') loadSugestoes();
  if (viewName === 'eventos') loadEventos();
  if (viewName === 'perfil') populatePerfilForm();
  if (viewName === 'arquitetura') loadObservability();
}

function handleAuthNavClick() {
  if (currentUser) {
    navigateTo('perfil');
  } else {
    navigateTo('login');
  }
}

function updateNavbarAuthUI() {
  const labelEl = document.getElementById('nav-auth-label');
  if (currentUser) {
    const firstName = currentUser.nome.split(' ')[0];
    const badge = currentUser.role === 'admin' ? ' [ADMIN]' : '';
    labelEl.textContent = `Perfil (${firstName}${badge})`;
  } else {
    labelEl.textContent = 'Login';
  }
}

// =========================================================================
// MICROSSERVIÇO 1: IDENTIDADE (LOGIN, CADASTRO, RECUPERAR SENHA, PERFIL, ADMIN)
// =========================================================================
function fillDemoLogin(email, senha) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-senha').value = senha;
}

async function submitLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Erro ao fazer login', true);
    }

    currentUser = data.user;
    authToken = data.token;
    localStorage.setItem('conectcity_user', JSON.stringify(currentUser));
    localStorage.setItem('conectcity_token', authToken);
    updateNavbarAuthUI();
    loadRelatos(1);
    loadSugestoes();
    loadEventos();
    showToast(`Bem-vindo(a), ${currentUser.nome}!`);
    navigateTo('perfil');
  } catch (err) {
    showToast('Falha de conexão com o Serviço de Identidade.', true);
  }
}

async function submitCadastro(e) {
  e.preventDefault();
  const payload = {
    nome: document.getElementById('cad-nome').value,
    cpf: document.getElementById('cad-cpf').value,
    telefone: document.getElementById('cad-telefone').value,
    endereco: document.getElementById('cad-endereco').value,
    bairro: document.getElementById('cad-bairro').value,
    email: document.getElementById('cad-email').value,
    senha: document.getElementById('cad-senha').value
  };

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Erro no cadastro', true);
    }

    currentUser = data.user;
    authToken = data.token;
    localStorage.setItem('conectcity_user', JSON.stringify(currentUser));
    localStorage.setItem('conectcity_token', authToken);
    updateNavbarAuthUI();

    // Pop-out idêntico à Imagem 6 do Protótipo:
    showToast('Cadastro realizado com sucesso!');
    document.getElementById('form-cadastro').reset();
    navigateTo('perfil');
  } catch (err) {
    showToast('Erro ao comunicar com o Serviço de Identidade.', true);
  }
}

async function submitRecuperarSenha(e) {
  e.preventDefault();
  const email = document.getElementById('rec-email').value;
  const senha = document.getElementById('rec-senha').value;
  const confirmacaoSenha = document.getElementById('rec-confirma').value;

  try {
    const res = await fetch('/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha, confirmacaoSenha })
    });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Erro ao recuperar senha', true);
    }

    // Pop-out idêntico à Imagem 6 do Protótipo:
    showToast('Senha recuperada com sucesso!');
    document.getElementById('form-recuperar').reset();
    navigateTo('login');
  } catch (err) {
    showToast('Erro ao comunicar com o Serviço de Identidade.', true);
  }
}

function populatePerfilForm() {
  if (!currentUser) {
    // Se não estiver logado, carrega por padrão os dados da cidadã do protótipo (Helany da Silva Araújo)
    fetch('/api/users/1')
      .then((r) => r.json())
      .then((u) => {
        if (u && u.id) {
          currentUser = u;
          localStorage.setItem('conectcity_user', JSON.stringify(u));
          updateNavbarAuthUI();
          fillPerfilInputs(u);
        }
      })
      .catch(() => {});
    return;
  }
  fillPerfilInputs(currentUser);
}

function fillPerfilInputs(u) {
  document.getElementById('perf-nome').value = u.nome || '';
  document.getElementById('perf-cpf').value = u.cpf || '';
  document.getElementById('perf-telefone').value = u.telefone || '';
  document.getElementById('perf-endereco').value = u.endereco || '';
  document.getElementById('perf-bairro').value = u.bairro || '';
  document.getElementById('perf-email').value = u.email || '';
  document.getElementById('perf-senha').value = '***********';

  const wrap = document.getElementById('perfil-role-badge-wrap');
  if (u.role === 'admin') {
    wrap.innerHTML = `<span class="status-badge status-concluido" style="padding:5px 16px;font-size:0.8rem;">🏛️ Conta Autenticada como Administrador da Prefeitura de Picos</span>`;
  } else {
    wrap.innerHTML = `<span class="status-badge status-analise" style="padding:5px 16px;font-size:0.8rem;">👤 Perfil de Cidadão Picoense</span>`;
  }
}

async function submitSalvarPerfil(e) {
  e.preventDefault();
  const userId = currentUser ? currentUser.id : 1;
  const payload = {
    nome: document.getElementById('perf-nome').value,
    cpf: document.getElementById('perf-cpf').value,
    telefone: document.getElementById('perf-telefone').value,
    endereco: document.getElementById('perf-endereco').value,
    bairro: document.getElementById('perf-bairro').value,
    email: document.getElementById('perf-email').value,
    senha: document.getElementById('perf-senha').value
  };

  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Erro ao salvar perfil', true);
    }

    currentUser = data.user;
    localStorage.setItem('conectcity_user', JSON.stringify(currentUser));
    updateNavbarAuthUI();
    fillPerfilInputs(currentUser);
    // Pop-out idêntico à Imagem 8 do Protótipo:
    showToast('Informações salvas com sucesso!');
  } catch (err) {
    showToast('Erro ao salvar configurações de perfil.', true);
  }
}

function openAdminAuthModal() {
  document.getElementById('admin-code-input').value = '';
  document.getElementById('modal-admin-auth').style.display = 'flex';
}

async function confirmarCodigoAdmin() {
  const userId = currentUser ? currentUser.id : 1;
  const codigo = document.getElementById('admin-code-input').value;

  try {
    const res = await fetch(`/api/users/${userId}/admin-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo })
    });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Código inválido', true);
    }

    currentUser = data.user;
    localStorage.setItem('conectcity_user', JSON.stringify(currentUser));
    updateNavbarAuthUI();
    fillPerfilInputs(currentUser);
    loadRelatos(1);
    loadSugestoes();
    loadEventos();
    closeModal('modal-admin-auth');
    showToast('Informações salvas com sucesso! Função de Administrador liberada.');
  } catch (err) {
    showToast('Erro ao validar código de administrador.', true);
  }
}

function logoutUser() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('conectcity_user');
  localStorage.removeItem('conectcity_token');
  updateNavbarAuthUI();
  loadRelatos(1);
  loadSugestoes();
  loadEventos();
  showToast('Sessão encerrada com sucesso.');
  navigateTo('login');
}

// =========================================================================
// MICROSSERVIÇO 2: CHAMADOS (RELATOS, SUGESTÕES, EVENTOS) + UPLOAD SQS/S3
// =========================================================================
function getStatusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('análise') || s.includes('analise')) return 'status-analise';
  if (s.includes('andamento') || s.includes('implementa')) return 'status-andamento';
  if (s.includes('conclu') || s.includes('aprovad')) return 'status-concluido';
  if (s.includes('cancelad')) return 'status-cancelado';
  return 'status-pendente';
}

function formatStarRating(val) {
  return Number(val || 3.2).toFixed(1).replace('.', ',');
}

async function loadRelatos(page = 1) {
  currentRelatosPage = page;
  const q = document.getElementById('search-relatos-input')?.value || '';
  const status = document.getElementById('filter-relatos-status')?.value || '';
  const isAdmin = currentUser && currentUser.role === 'admin';

  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (isAdmin) params.set('admin', '1');
    const res = await fetch(`/api/relatos?${params.toString()}`);
    allRelatos = await res.json();
    renderRelatosGrid();
  } catch (err) {
    console.error('Erro ao carregar relatos:', err);
  }
}

function renderRelatosGrid() {
  const grid = document.getElementById('relatos-grid');
  const pag = document.getElementById('relatos-pagination');
  const adminBar = document.getElementById('admin-bar-relatos');
  if (!grid) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  if (adminBar) {
    if (isAdmin) {
      const pendCount = allRelatos.filter((r) => !(Number(r.aprovado_portal ?? 1) === 1 && (r.status || '').toLowerCase() !== 'pendente')).length;
      const pubCount = allRelatos.length - pendCount;
      adminBar.style.display = 'flex';
      adminBar.innerHTML = `
        <div class="admin-mod-info">
          <span>🏛️ <strong>Gestão &amp; CRUD de Relatos (Admin):</strong></span>
          <span class="portal-vis-badge pending">⏳ ${pendCount} Card(s) em Cinza (Aguardando Liberação)</span>
          <span class="portal-vis-badge approved">✅ ${pubCount} Liberados no Portal</span>
        </div>
        <button type="button" class="btn btn-green btn-sm" onclick="navigateTo('form-relato')">+ Novo Relato</button>
      `;
    } else {
      adminBar.style.display = 'none';
    }
  }

  if (allRelatos.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:#6b7280;">Nenhum relato encontrado para o filtro pesquisado.</div>`;
    pag.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(allRelatos.length / RELATOS_PER_PAGE));
  if (currentRelatosPage > totalPages) currentRelatosPage = 1;

  const start = (currentRelatosPage - 1) * RELATOS_PER_PAGE;
  const pageItems = allRelatos.slice(start, start + RELATOS_PER_PAGE);

  grid.innerHTML = pageItems
    .map((r) => {
      const isApproved = Number(r.aprovado_portal ?? 1) === 1 && (r.status || '').toLowerCase() !== 'pendente';
      const badgeClass = isApproved ? getStatusBadgeClass(r.status) : 'status-pendente';
      const statusText = isApproved ? r.status : 'Aguardando Liberação';
      const adminCrudHtml = isAdmin
        ? `
          <div class="card-admin-crud-row">
            ${
              !isApproved
                ? `<button type="button" class="btn-crud-mini btn-crud-approve" onclick="liberarPortalRelatoCard(${r.id}, 1)">✅ Liberar</button>`
                : `<button type="button" class="btn-crud-mini btn-crud-hide" onclick="liberarPortalRelatoCard(${r.id}, 0)">⏳ Deixar Pendente</button>`
            }
            <button type="button" class="btn-crud-mini btn-crud-edit" onclick="openRelatoModal(${r.id}, true)">✏️ Editar</button>
            <button type="button" class="btn-crud-mini btn-crud-del" onclick="excluirRelatoCard(${r.id})">🗑️ Excluir</button>
          </div>
        `
        : '';

      return `
        <div class="proto-card ${!isApproved ? 'card-pending-portal' : ''}">
          <img src="${r.imagem || '/assets/buraco_real.png'}" alt="${r.titulo}" class="card-thumb" />
          <div class="card-info">
            <div class="card-title" title="${r.titulo}">${r.titulo}</div>
            <div class="card-meta-line">📍 ${r.bairro}</div>
            <div class="card-meta-line">🔧 ${r.categoria}</div>
            <span class="status-badge ${badgeClass}">${statusText}</span>
            <div class="card-footer-row">
              <span class="card-rating"><span class="star-gold">★</span> ${formatStarRating(r.avaliacao)}</span>
              <button type="button" class="btn-visualizar" onclick="openRelatoModal(${r.id})">Visualizar</button>
            </div>
            ${adminCrudHtml}
          </div>
        </div>
      `;
    })
    .join('');

  // Renderiza barra de paginação (< 1 2 3 4 >)
  let pagHtml = '';
  for (let i = 1; i <= Math.max(totalPages, 2); i++) {
    pagHtml += `<button type="button" class="page-num-btn ${i === currentRelatosPage ? 'active' : ''}" onclick="loadRelatos(${i})">${i}</button>`;
  }
  pag.innerHTML = pagHtml;
}

function openRelatoModal(id, autoOpenEdit = false) {
  const relato = allRelatos.find((r) => r.id === id);
  if (!relato) return;
  selectedRelato = relato;

  document.getElementById('mod-rel-titulo').textContent = relato.titulo;
  document.getElementById('mod-rel-protocolo').textContent = relato.protocolo;
  document.getElementById('mod-rel-categoria').textContent = relato.categoria;
  document.getElementById('mod-rel-local').textContent = `${relato.bairro} - ${relato.endereco}`;

  const badgeEl = document.getElementById('mod-rel-status-badge');
  badgeEl.textContent = relato.status;
  badgeEl.className = `status-badge ${getStatusBadgeClass(relato.status)}`;

  document.getElementById('mod-rel-avaliacao').textContent = formatStarRating(relato.avaliacao);
  document.getElementById('mod-rel-img').src = relato.imagem || '/assets/buraco_real.png';
  document.getElementById('mod-rel-descricao').textContent = relato.descricao;
  document.getElementById('mod-rel-data-dev').textContent = relato.data_devolutiva || '15/11/2025';
  document.getElementById('mod-rel-devolutiva').textContent =
    relato.devolutiva || 'O caso já foi analisado e está sendo tratado pela secretaria municipal responsável.';

  // Se o usuário atual for Administrador, exibe o painel de gestão completo da Prefeitura
  const adminBox = document.getElementById('mod-rel-admin-box');
  const editFields = document.getElementById('admin-rel-edit-fields');
  if (editFields) editFields.style.display = autoOpenEdit ? 'block' : 'none';

  if (currentUser && currentUser.role === 'admin') {
    adminBox.style.display = 'block';
    const isApproved = Number(relato.aprovado_portal ?? 1) === 1;
    document.getElementById('admin-rel-titulo').value = relato.titulo || '';
    document.getElementById('admin-rel-categoria').value = relato.categoria || 'Infraestrutura';
    document.getElementById('admin-rel-bairro').value = relato.bairro || '';
    document.getElementById('admin-rel-endereco').value = relato.endereco || '';
    document.getElementById('admin-rel-descricao').value = relato.descricao || '';
    document.getElementById('admin-rel-portal').value = isApproved ? '1' : '0';
    document.getElementById('admin-rel-status').value = relato.status;
    document.getElementById('admin-rel-devolutiva').value = relato.devolutiva || '';

    const btnPortal = document.getElementById('btn-mod-rel-portal');
    if (btnPortal) {
      btnPortal.textContent = isApproved ? '🔒 Ocultar do Portal Público' : '✅ Liberar Ida para o Portal';
      btnPortal.className = isApproved ? 'btn btn-outline-orange btn-sm' : 'btn btn-green btn-sm';
    }
  } else {
    adminBox.style.display = 'none';
  }

  document.getElementById('modal-relato').style.display = 'flex';
}

function toggleEditarRelatoAdmin() {
  const el = document.getElementById('admin-rel-edit-fields');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function togglePortalRelatoModal() {
  if (!selectedRelato) return;
  const cur = Number(document.getElementById('admin-rel-portal').value);
  const next = cur === 1 ? 0 : 1;
  document.getElementById('admin-rel-portal').value = String(next);
  if (next === 1 && document.getElementById('admin-rel-status').value === 'Pendente') {
    document.getElementById('admin-rel-status').value = 'Em Análise';
  }
  await salvarDevolutivaRelato();
}

async function liberarPortalRelatoCard(id, novoEstado) {
  try {
    const res = await fetch(`/api/relatos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovado_portal: novoEstado })
    });
    if (!res.ok) return showToast('Erro ao alterar visibilidade no portal', true);
    showToast(
      novoEstado === 1
        ? 'Relato liberado e publicado no portal público com sucesso!'
        : 'Relato movido de volta para a fila de triagem.'
    );
    loadRelatos(currentRelatosPage);
  } catch (err) {
    showToast('Erro ao comunicar com o Serviço de Chamados.', true);
  }
}

async function excluirRelatoCard(id) {
  try {
    const res = await fetch(`/api/relatos/${id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('Erro ao excluir relato', true);
    showToast('Relato excluído pelo Administrador.');
    loadRelatos(currentRelatosPage);
  } catch (err) {
    showToast('Erro ao excluir relato.', true);
  }
}

async function rapidoStatusRelato(novoStatus) {
  document.getElementById('admin-rel-status').value = novoStatus;
  document.getElementById('admin-rel-portal').value = '1';
  if (novoStatus === 'Em Andamento' && !document.getElementById('admin-rel-devolutiva').value.trim()) {
    document.getElementById('admin-rel-devolutiva').value =
      'Relato liberado e encaminhado para execução pela equipe técnica da Prefeitura Municipal de Picos.';
  }
  if (novoStatus === 'Concluído') {
    document.getElementById('admin-rel-devolutiva').value =
      'Serviço concluído e vistoriado pela Secretaria Municipal de Obras e Infraestrutura de Picos.';
  }
  await salvarDevolutivaRelato();
}

async function salvarDevolutivaRelato() {
  if (!selectedRelato) return;
  const payload = {
    titulo: document.getElementById('admin-rel-titulo').value,
    categoria: document.getElementById('admin-rel-categoria').value,
    bairro: document.getElementById('admin-rel-bairro').value,
    endereco: document.getElementById('admin-rel-endereco').value,
    descricao: document.getElementById('admin-rel-descricao').value,
    aprovado_portal: Number(document.getElementById('admin-rel-portal').value),
    status: document.getElementById('admin-rel-status').value,
    devolutiva: document.getElementById('admin-rel-devolutiva').value
  };

  try {
    const res = await fetch(`/api/relatos/${selectedRelato.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Erro ao atualizar relato', true);

    showToast('Relato e status do portal atualizados com sucesso!');
    closeModal('modal-relato');
    loadRelatos(currentRelatosPage);
  } catch (err) {
    showToast('Erro ao comunicar com o Serviço de Chamados.', true);
  }
}

async function excluirRelatoAdmin() {
  if (!selectedRelato) return;
  try {
    const res = await fetch(`/api/relatos/${selectedRelato.id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('Erro ao excluir relato', true);
    showToast('Relato excluído pelo Administrador.');
    closeModal('modal-relato');
    loadRelatos(currentRelatosPage);
  } catch (err) {
    showToast('Erro ao excluir relato.', true);
  }
}

async function votarRelato(estrelas) {
  if (!selectedRelato) return;
  const novaMedia = Number(((Number(selectedRelato.avaliacao || 3.2) + estrelas) / 2).toFixed(1));
  try {
    const res = await fetch(`/api/relatos/${selectedRelato.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avaliacao: novaMedia })
    });
    if (res.ok) {
      document.getElementById('mod-rel-avaliacao').textContent = formatStarRating(novaMedia);
      showToast(`Avaliação de ${estrelas} estrelas registrada!`);
      loadRelatos(currentRelatosPage);
    }
  } catch (_) {}
}

function handleImagePreview(input, previewBoxId, fileNameId) {
  const file = input.files && input.files[0];
  if (!file) return;

  document.getElementById(fileNameId).textContent = `Arquivo selecionado: ${file.name} (${Math.round(file.size / 1024)} KB)`;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const base64 = ev.target.result;
    if (previewBoxId === 'rel-preview-box') {
      uploadedRelatoImageBase64 = base64;
      uploadedRelatoFileName = file.name;
    } else {
      uploadedEventoImageBase64 = base64;
      uploadedEventoFileName = file.name;
    }
    document.getElementById(previewBoxId).innerHTML = `<img src="${base64}" alt="Preview" />`;
  };
  reader.readAsDataURL(file);
}

async function submitNovoRelato(e) {
  e.preventDefault();
  const categoria = document.getElementById('rel-categoria').value;
  let defaultImg = '/assets/buraco_real.png';
  if (categoria.includes('Iluminação')) defaultImg = '/assets/iluminacao_real.jpg';
  if (categoria.includes('Limpeza') || categoria.includes('Meio Ambiente')) defaultImg = '/assets/limpeza_real.jpg';
  if (categoria.includes('Saneamento')) defaultImg = '/assets/saneamento_real.jpg';
  if (categoria.includes('Trânsito')) defaultImg = '/assets/transito_real.jpg';

  const payload = {
    titulo: document.getElementById('rel-titulo').value,
    categoria,
    endereco: document.getElementById('rel-endereco').value,
    bairro: document.getElementById('rel-bairro').value,
    descricao: document.getElementById('rel-descricao').value,
    imagem: uploadedRelatoImageBase64 || defaultImg,
    nomeArquivo: uploadedRelatoFileName || 'relato_picos.png',
    autor_nome: currentUser ? currentUser.nome : 'Cidadão Picoense'
  };

  try {
    const res = await fetch('/api/relatos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Erro ao enviar relato', true);

    // Pop-out informando que aguarda liberação do Administrador para ir ao portal:
    showToast('Relato enviado para triagem! O Administrador irá liberar a ida para o portal.');
    document.getElementById('form-novo-relato').reset();
    document.getElementById('rel-preview-box').innerHTML = '';
    uploadedRelatoImageBase64 = null;
    navigateTo('relatos');
  } catch (err) {
    showToast('Erro ao enviar relato para o Serviço de Chamados.', true);
  }
}

// =========================================================================
// SUGESTÕES / SOLUÇÕES
// =========================================================================
async function loadSugestoes() {
  const q = document.getElementById('search-sugestoes-input')?.value || '';
  const isAdmin = currentUser && currentUser.role === 'admin';
  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (isAdmin) params.set('admin', '1');
    const res = await fetch(`/api/sugestoes?${params.toString()}`);
    allSugestoes = await res.json();
    renderSugestoesGrid();
  } catch (err) {
    console.error('Erro ao carregar sugestões:', err);
  }
}

function renderSugestoesGrid() {
  const grid = document.getElementById('sugestoes-grid');
  const adminBar = document.getElementById('admin-bar-sugestoes');
  if (!grid) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  if (adminBar) {
    if (isAdmin) {
      const pendCount = allSugestoes.filter((s) => !(Number(s.aprovado_portal ?? 1) === 1 && (s.status || '').toLowerCase() !== 'pendente')).length;
      const pubCount = allSugestoes.length - pendCount;
      adminBar.style.display = 'flex';
      adminBar.innerHTML = `
        <div class="admin-mod-info">
          <span>🏛️ <strong>Gestão &amp; CRUD de Sugestões (Admin):</strong></span>
          <span class="portal-vis-badge pending">⏳ ${pendCount} Card(s) em Cinza (Aguardando Liberação)</span>
          <span class="portal-vis-badge approved">✅ ${pubCount} Liberadas no Portal</span>
        </div>
        <button type="button" class="btn btn-green btn-sm" onclick="navigateTo('form-sugestao')">+ Nova Sugestão</button>
      `;
    } else {
      adminBar.style.display = 'none';
    }
  }

  grid.innerHTML = allSugestoes
    .map((s) => {
      const isApproved = Number(s.aprovado_portal ?? 1) === 1 && (s.status || '').toLowerCase() !== 'pendente';
      const badgeClass = isApproved ? getStatusBadgeClass(s.status) : 'status-pendente';
      const statusText = isApproved ? s.status : 'Aguardando Liberação';
      const adminCrudHtml = isAdmin
        ? `
          <div class="card-admin-crud-row">
            ${
              !isApproved
                ? `<button type="button" class="btn-crud-mini btn-crud-approve" onclick="liberarPortalSugestaoCard(${s.id}, 1)">✅ Liberar</button>`
                : `<button type="button" class="btn-crud-mini btn-crud-hide" onclick="liberarPortalSugestaoCard(${s.id}, 0)">⏳ Deixar Pendente</button>`
            }
            <button type="button" class="btn-crud-mini btn-crud-edit" onclick="openSugestaoModal(${s.id}, true)">✏️ Editar</button>
            <button type="button" class="btn-crud-mini btn-crud-del" onclick="excluirSugestaoCard(${s.id})">🗑️ Excluir</button>
          </div>
        `
        : '';

      return `
        <div class="proto-card ${!isApproved ? 'card-pending-portal' : ''}">
          <img src="/assets/concluido_real.jpg" alt="${s.titulo}" class="card-thumb" />
          <div class="card-info">
            <div class="card-title" title="${s.titulo}">${s.titulo}</div>
            <div class="card-meta-line">📍 ${s.bairro}</div>
            <div class="card-meta-line">💡 ${s.categoria}</div>
            <span class="status-badge ${badgeClass}">${statusText}</span>
            <div class="card-footer-row">
              <span class="card-rating"><span class="star-gold">★</span> ${formatStarRating(s.avaliacao)}</span>
              <button type="button" class="btn-visualizar" onclick="openSugestaoModal(${s.id})">Visualizar</button>
            </div>
            ${adminCrudHtml}
          </div>
        </div>
      `;
    })
    .join('');
}

function openSugestaoModal(id, autoOpenEdit = false) {
  const s = allSugestoes.find((item) => item.id === id);
  if (!s) return;
  selectedSugestao = s;

  document.getElementById('mod-sug-titulo').textContent = s.titulo;
  document.getElementById('mod-sug-protocolo').textContent = s.protocolo;
  document.getElementById('mod-sug-autor').textContent = s.autor_nome;
  const stEl = document.getElementById('mod-sug-status');
  stEl.textContent = s.status;
  stEl.className = `status-badge ${getStatusBadgeClass(s.status)}`;
  document.getElementById('mod-sug-problema').textContent = s.descricao_problema;
  document.getElementById('mod-sug-solucao').textContent = s.descricao_solucao;
  document.getElementById('mod-sug-data').textContent = s.data_devolutiva || '16/11/2025';
  document.getElementById('mod-sug-devolutiva').textContent = s.devolutiva;

  const adminBox = document.getElementById('mod-sug-admin-box');
  const editFields = document.getElementById('admin-sug-edit-fields');
  if (editFields) editFields.style.display = autoOpenEdit ? 'block' : 'none';

  if (currentUser && currentUser.role === 'admin') {
    adminBox.style.display = 'block';
    const isApproved = Number(s.aprovado_portal ?? 1) === 1;
    document.getElementById('admin-sug-titulo').value = s.titulo || '';
    document.getElementById('admin-sug-bairro').value = s.bairro || '';
    document.getElementById('admin-sug-categoria').value = s.categoria || '';
    document.getElementById('admin-sug-problema').value = s.descricao_problema || '';
    document.getElementById('admin-sug-solucao').value = s.descricao_solucao || '';
    document.getElementById('admin-sug-portal').value = isApproved ? '1' : '0';
    document.getElementById('admin-sug-status').value = s.status || 'Em Análise';
    document.getElementById('admin-sug-devolutiva').value = s.devolutiva || '';

    const btnPortal = document.getElementById('btn-mod-sug-portal');
    if (btnPortal) {
      btnPortal.textContent = isApproved ? '🔒 Ocultar do Portal Público' : '✅ Liberar Ida para o Portal';
      btnPortal.className = isApproved ? 'btn btn-outline-orange btn-sm' : 'btn btn-green btn-sm';
    }
  } else {
    adminBox.style.display = 'none';
  }

  document.getElementById('modal-sugestao').style.display = 'flex';
}

function toggleEditarSugestaoAdmin() {
  const el = document.getElementById('admin-sug-edit-fields');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function togglePortalSugestaoModal() {
  if (!selectedSugestao) return;
  const cur = Number(document.getElementById('admin-sug-portal').value);
  const next = cur === 1 ? 0 : 1;
  document.getElementById('admin-sug-portal').value = String(next);
  if (next === 1 && document.getElementById('admin-sug-status').value === 'Pendente') {
    document.getElementById('admin-sug-status').value = 'Em Análise';
  }
  await salvarAdminSugestao();
}

async function liberarPortalSugestaoCard(id, novoEstado) {
  try {
    const res = await fetch(`/api/sugestoes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovado_portal: novoEstado })
    });
    if (!res.ok) return showToast('Erro ao alterar visibilidade da sugestão', true);
    showToast(
      novoEstado === 1
        ? 'Sugestão liberada e publicada no portal com sucesso!'
        : 'Sugestão movida para a fila de triagem.'
    );
    loadSugestoes();
  } catch (err) {
    showToast('Erro ao atualizar sugestão.', true);
  }
}

async function excluirSugestaoCard(id) {
  try {
    const res = await fetch(`/api/sugestoes/${id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('Erro ao excluir sugestão', true);
    showToast('Sugestão excluída pelo Administrador.');
    loadSugestoes();
  } catch (err) {
    showToast('Erro ao excluir sugestão.', true);
  }
}

async function rapidoStatusSugestao(novoStatus) {
  document.getElementById('admin-sug-status').value = novoStatus;
  document.getElementById('admin-sug-portal').value = '1';
  if (novoStatus === 'Aprovada') {
    document.getElementById('admin-sug-devolutiva').value =
      'Sugestão aprovada e liberada pela Prefeitura Municipal de Picos para inclusão no cronograma de melhorias urbanas.';
  } else if (novoStatus === 'Em Implementação') {
    document.getElementById('admin-sug-devolutiva').value =
      'Proposta em fase de implementação pelas equipes técnicas municipais.';
  }
  await salvarAdminSugestao();
}

async function salvarAdminSugestao() {
  if (!selectedSugestao) return;
  const payload = {
    titulo: document.getElementById('admin-sug-titulo').value,
    bairro: document.getElementById('admin-sug-bairro').value,
    categoria: document.getElementById('admin-sug-categoria').value,
    descricao_problema: document.getElementById('admin-sug-problema').value,
    descricao_solucao: document.getElementById('admin-sug-solucao').value,
    aprovado_portal: Number(document.getElementById('admin-sug-portal').value),
    status: document.getElementById('admin-sug-status').value,
    devolutiva: document.getElementById('admin-sug-devolutiva').value
  };

  try {
    const res = await fetch(`/api/sugestoes/${selectedSugestao.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Erro ao atualizar sugestão', true);

    showToast('Sugestão e visibilidade no portal atualizadas com sucesso!');
    closeModal('modal-sugestao');
    loadSugestoes();
  } catch (err) {
    showToast('Erro ao atualizar sugestão.', true);
  }
}

async function excluirSugestaoAdmin() {
  if (!selectedSugestao) return;
  try {
    const res = await fetch(`/api/sugestoes/${selectedSugestao.id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('Erro ao excluir sugestão', true);
    showToast('Sugestão excluída pelo Administrador.');
    closeModal('modal-sugestao');
    loadSugestoes();
  } catch (err) {
    showToast('Erro ao excluir sugestão.', true);
  }
}

async function submitNovaSugestao(e) {
  e.preventDefault();
  const payload = {
    titulo: document.getElementById('sug-titulo').value,
    descricao_problema: document.getElementById('sug-problema').value,
    descricao_solucao: document.getElementById('sug-solucao').value,
    autor_nome: currentUser ? currentUser.nome : 'Cidadão Picoense'
  };

  try {
    const res = await fetch('/api/sugestoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Erro ao enviar sugestão', true);

    showToast('Sugestão enviada para triagem! O Administrador irá liberar a ida para o portal.');
    document.getElementById('form-nova-sugestao').reset();
    navigateTo('sugestoes');
  } catch (err) {
    showToast('Erro ao enviar sugestão.', true);
  }
}

// =========================================================================
// EVENTOS
// =========================================================================
async function loadEventos() {
  const q = document.getElementById('search-eventos-input')?.value || '';
  const isAdmin = currentUser && currentUser.role === 'admin';
  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (isAdmin) params.set('admin', '1');
    const res = await fetch(`/api/eventos?${params.toString()}`);
    allEventos = await res.json();
    renderEventosGrid();
  } catch (err) {
    console.error('Erro ao carregar eventos:', err);
  }
}

function renderEventosGrid() {
  const grid = document.getElementById('eventos-grid');
  const adminBar = document.getElementById('admin-bar-eventos');
  if (!grid) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  if (adminBar) {
    if (isAdmin) {
      const pendCount = allEventos.filter((ev) => Number(ev.aprovado_portal ?? 1) === 0).length;
      const pubCount = allEventos.length - pendCount;
      adminBar.style.display = 'flex';
      adminBar.innerHTML = `
        <div class="admin-mod-info">
          <span>🏛️ <strong>Gestão &amp; CRUD de Eventos (Admin):</strong></span>
          <span class="portal-vis-badge pending">⏳ ${pendCount} Card(s) em Cinza (Aguardando Liberação)</span>
          <span class="portal-vis-badge approved">✅ ${pubCount} Liberados no Portal</span>
        </div>
        <button type="button" class="btn btn-green btn-sm" onclick="navigateTo('form-evento')">+ Novo Evento</button>
      `;
    } else {
      adminBar.style.display = 'none';
    }
  }

  grid.innerHTML = allEventos
    .map((ev) => {
      const isApproved = Number(ev.aprovado_portal ?? 1) === 1;
      const statusBadgeHtml = !isApproved
        ? `<span class="status-badge status-pendente">Aguardando Liberação</span>`
        : '';
      const adminCrudHtml = isAdmin
        ? `
          <div class="card-admin-crud-row">
            ${
              !isApproved
                ? `<button type="button" class="btn-crud-mini btn-crud-approve" onclick="liberarPortalEventoCard(${ev.id}, 1)">✅ Liberar</button>`
                : `<button type="button" class="btn-crud-mini btn-crud-hide" onclick="liberarPortalEventoCard(${ev.id}, 0)">⏳ Deixar Pendente</button>`
            }
            <button type="button" class="btn-crud-mini btn-crud-edit" onclick="openEventoModal(${ev.id})">✏️ Editar</button>
            <button type="button" class="btn-crud-mini btn-crud-del" onclick="excluirEventoCard(${ev.id})">🗑️ Excluir</button>
          </div>
        `
        : '';

      return `
        <div class="proto-card ${!isApproved ? 'card-pending-portal' : ''}">
          <img src="${ev.imagem || '/assets/evento_aniversario.svg'}" alt="${ev.titulo}" class="card-thumb" />
          <div class="card-info">
            <div class="card-title" title="${ev.titulo}">${ev.titulo}</div>
            <div class="card-meta-line">📅 ${ev.data_evento}</div>
            <div class="card-meta-line">🏃 ${ev.categoria}</div>
            <div class="card-meta-line">🌐 ${ev.modalidade}</div>
            ${statusBadgeHtml}
            <div class="card-footer-row" style="margin-top:8px;">
              <span class="card-rating"><span class="star-gold">★</span> ${formatStarRating(ev.avaliacao)}</span>
              <button type="button" class="btn-visualizar" onclick="openEventoModal(${ev.id})">Visualizar</button>
            </div>
            ${adminCrudHtml}
          </div>
        </div>
      `;
    })
    .join('');
}

function openEventoModal(id) {
  const ev = allEventos.find((item) => item.id === id);
  if (!ev) return;
  selectedEvento = ev;

  document.getElementById('mod-evt-titulo').textContent = ev.titulo;
  document.getElementById('mod-evt-categoria').textContent = ev.categoria;
  document.getElementById('mod-evt-local').textContent = ev.local;
  document.getElementById('mod-evt-data').textContent = ev.data_evento;
  document.getElementById('mod-evt-modalidade').textContent = ev.modalidade;
  document.getElementById('mod-evt-avaliacao').textContent = formatStarRating(ev.avaliacao);
  document.getElementById('mod-evt-img').src = ev.imagem || '/assets/evento_criancas.svg';
  document.getElementById('mod-evt-descricao').textContent = ev.descricao;

  const adminBox = document.getElementById('mod-evt-admin-box');
  if (currentUser && currentUser.role === 'admin') {
    adminBox.style.display = 'block';
    const isApproved = Number(ev.aprovado_portal ?? 1) === 1;
    document.getElementById('admin-evt-portal').value = isApproved ? '1' : '0';
    document.getElementById('admin-evt-categoria').value = ev.categoria || 'Lazer';
    document.getElementById('admin-evt-titulo').value = ev.titulo || '';
    document.getElementById('admin-evt-data').value = ev.data_evento || '';
    document.getElementById('admin-evt-local').value = ev.local || '';
    document.getElementById('admin-evt-modalidade').value = ev.modalidade || 'Presencial';
    document.getElementById('admin-evt-descricao').value = ev.descricao || '';

    const btnPortal = document.getElementById('btn-mod-evt-portal');
    if (btnPortal) {
      btnPortal.textContent = isApproved ? '🔒 Ocultar do Portal Público' : '✅ Liberar Ida para o Portal';
      btnPortal.className = isApproved ? 'btn btn-outline-orange btn-sm' : 'btn btn-green btn-sm';
    }
  } else {
    adminBox.style.display = 'none';
  }

  document.getElementById('modal-evento').style.display = 'flex';
}

async function togglePortalEventoModal() {
  if (!selectedEvento) return;
  const cur = Number(document.getElementById('admin-evt-portal').value);
  const next = cur === 1 ? 0 : 1;
  document.getElementById('admin-evt-portal').value = String(next);
  await salvarAdminEvento();
}

async function liberarPortalEventoCard(id, novoEstado) {
  try {
    const res = await fetch(`/api/eventos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovado_portal: novoEstado })
    });
    if (!res.ok) return showToast('Erro ao alterar visibilidade do evento', true);
    showToast(
      novoEstado === 1
        ? 'Evento liberado e publicado no portal com sucesso!'
        : 'Evento movido para a fila de triagem.'
    );
    loadEventos();
  } catch (err) {
    showToast('Erro ao atualizar evento.', true);
  }
}

async function excluirEventoCard(id) {
  try {
    const res = await fetch(`/api/eventos/${id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('Erro ao excluir evento', true);
    showToast('Evento excluído pelo Administrador.');
    loadEventos();
  } catch (err) {
    showToast('Erro ao excluir evento.', true);
  }
}

async function salvarAdminEvento() {
  if (!selectedEvento) return;
  const payload = {
    aprovado_portal: Number(document.getElementById('admin-evt-portal').value),
    categoria: document.getElementById('admin-evt-categoria').value,
    titulo: document.getElementById('admin-evt-titulo').value,
    data_evento: document.getElementById('admin-evt-data').value,
    local: document.getElementById('admin-evt-local').value,
    modalidade: document.getElementById('admin-evt-modalidade').value,
    descricao: document.getElementById('admin-evt-descricao').value
  };

  try {
    const res = await fetch(`/api/eventos/${selectedEvento.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Erro ao atualizar evento', true);

    showToast('Evento e visibilidade no portal atualizados com sucesso!');
    closeModal('modal-evento');
    loadEventos();
  } catch (err) {
    showToast('Erro ao atualizar evento.', true);
  }
}

async function excluirEventoAdmin() {
  if (!selectedEvento) return;
  try {
    const res = await fetch(`/api/eventos/${selectedEvento.id}`, { method: 'DELETE' });
    if (!res.ok) return showToast('Erro ao excluir evento', true);
    showToast('Evento excluído pelo Administrador.');
    closeModal('modal-evento');
    loadEventos();
  } catch (err) {
    showToast('Erro ao excluir evento.', true);
  }
}

async function submitNovoEvento(e) {
  e.preventDefault();
  const payload = {
    titulo: document.getElementById('evt-titulo').value,
    modalidade: document.getElementById('evt-modalidade').value,
    data_evento: document.getElementById('evt-data').value,
    local: document.getElementById('evt-local').value || 'Ipueiras - Antônio Claro',
    categoria: document.getElementById('evt-categoria').value || 'Lazer',
    descricao: document.getElementById('evt-descricao').value,
    imagem: uploadedEventoImageBase64 || '/assets/evento_aniversario.svg',
    nomeArquivo: uploadedEventoFileName || 'evento_picos.png'
  };

  try {
    const res = await fetch('/api/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || 'Erro ao cadastrar evento', true);

    showToast('Evento enviado para triagem! O Administrador irá liberar a ida para o portal.');
    document.getElementById('form-novo-evento').reset();
    document.getElementById('evt-preview-box').innerHTML = '';
    uploadedEventoImageBase64 = null;
    navigateTo('eventos');
  } catch (err) {
    showToast('Erro ao cadastrar evento.', true);
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

// =========================================================================
// OBSERVABILIDADE E TELEMETRIA DOS 3 MICROSSERVIÇOS AWS
// =========================================================================
async function loadObservability() {
  try {
    const res = await fetch('/api/observability');
    const data = await res.json();

    // Gateway counter
    document.getElementById('gw-req-counter').textContent =
      `Requisições roteadas: ${data.gatewayStats.totalRequests} (ID:${data.gatewayStats.routedToIdentity} | CH:${data.gatewayStats.routedToTickets} | MD:${data.gatewayStats.routedToMedia})`;

    // Microsserviço 1: Identidade
    const idMs = data.microservices.identity;
    document.getElementById('ms1-metrics').innerHTML =
      `Usuários no Banco Isolado: <strong>${idMs.totalUsers || 0}</strong> (${idMs.totalAdmins || 0} Admins)<br/>Logins: ${idMs.loginsSuccess || 0} | Req: ${idMs.requestsTotal || 0}`;

    // Microsserviço 2: Chamados
    const tkMs = data.microservices.tickets;
    const c = tkMs.counts || {};
    document.getElementById('ms2-metrics').innerHTML =
      `Relatos: <strong>${c.relatos || 0}</strong> | Sugestões: <strong>${c.sugestoes || 0}</strong> | Eventos: <strong>${c.eventos || 0}</strong><br/>Eventos publicados no SQS: ${tkMs.sqsEventsPublished || 0}`;

    // Microsserviço 3: Mídia / SQS / DLQ / S3
    const mdMs = data.microservices.media;
    document.getElementById('sqs-metrics').textContent =
      `Mensagens recebidas: ${mdMs.sqsMessagesReceived || 0} | Na fila: ${mdMs.queueDepth || 0}`;
    document.getElementById('media-processed-metric').textContent =
      `Mídias sanitizadas e salvas: ${mdMs.sqsMessagesProcessed || 0}`;
    document.getElementById('s3-metrics').textContent =
      `Objetos no Bucket S3: ${mdMs.s3ObjectsCount || 0} | Hits CloudFront: ${mdMs.cloudfrontHits || 0}`;

    const dlqBox = document.getElementById('dlq-list');
    if (mdMs.dlqMessages && mdMs.dlqMessages.length > 0) {
      dlqBox.innerHTML = mdMs.dlqMessages
        .map(
          (m) =>
            `<div style="border-bottom:1px solid #fecaca;padding:3px 0;"><strong>${m.messageId}</strong>: ${m.errorReason} <em>(${m.payloadSummary?.fileName})</em></div>`
        )
        .join('');
    } else {
      dlqBox.textContent = '✔ Nenhuma mensagem com erro na DLQ (0 falhas).';
    }

    // CloudWatch Alarms
    const alarmsList = document.getElementById('cw-alarms-list');
    alarmsList.innerHTML = (data.observability.cloudWatchAlarms || [])
      .map((a) => {
        const isOk = a.state === 'OK';
        return `
          <div class="obs-item" style="border-left:4px solid ${isOk ? '#10b981' : '#ef4444'};">
            <div style="display:flex;justify-content:space-between;font-weight:800;">
              <span>${a.name}</span>
              <span style="color:${isOk ? '#059669' : '#dc2626'};">[${a.state}]</span>
            </div>
            <div style="color:#475569;margin-top:2px;">Métrica: ${a.metric}</div>
          </div>
        `;
      })
      .join('');

    // AWS X-Ray Traces
    const xrayList = document.getElementById('xray-traces-list');
    xrayList.innerHTML = (data.observability.xrayTraces || [])
      .map(
        (t) => `
          <div class="obs-item">
            <div><strong>${t.method} ${t.clientPath}</strong> ➔ <span style="color:#059669;">${t.upstreamStatus} (${t.durationMs}ms)</span></div>
            <div style="color:#6d28d9;">Destino: ${t.routedTo}</div>
            <div style="color:#64748b;">${t.traceId}</div>
          </div>
        `
      )
      .join('');

    // CloudWatch Logs
    const logsList = document.getElementById('cw-logs-list');
    logsList.innerHTML = (data.observability.cloudWatchLogs || [])
      .map(
        (l) => `
          <div class="obs-item">
            <div><strong style="color:${l.level === 'WARN' || l.level === 'ERROR' ? '#dc2626' : '#0284c7'};">[${l.level}]</strong> ${l.logGroup}</div>
            <div>${l.message}</div>
          </div>
        `
      )
      .join('');
  } catch (err) {
    console.error('Erro ao carregar observabilidade:', err);
  }
}

async function simulateDlqError() {
  try {
    await fetch('/api/media/sqs/simulate-dlq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'imagem_corrompida_exif_error.raw' })
    });
    showToast('Falha simulada enviada ao Amazon SQS! Redirecionando para a DLQ e disparando CloudWatch Alarm...', true);
    setTimeout(loadObservability, 650);
  } catch (_) {}
}

async function clearDlq() {
  try {
    await fetch('/api/media/sqs/clear-dlq', { method: 'POST' });
    showToast('Dead Letter Queue (DLQ) limpa e CloudWatch Alarm normalizado!');
    loadObservability();
  } catch (_) {}
}
