# e-CONECT-CITY | Plataforma de Ouvidoria Digital e Gestão Municipal (Picos – PI)

**Universidade Federal do Piauí (UFPI)**  
**Curso:** Sistemas de Informação — **Período:** 2026.2  
**Disciplina:** Tópicos Especiais em Engenharia de Software  
**Professora:** Dra. Juliana Oliveira de Carvalho  
**Segunda Avaliação (Av2)**

---

## 1. Visão Geral da Aplicação

O **e-CONECT-CITY** é uma plataforma web voltada ao fortalecimento da comunicação entre os cidadãos e a administração pública do município de **Picos – PI**. A aplicação permite que os moradores:
1. **Registrem Relatos Urbanos:** Problemas de infraestrutura (ex: *Buracos na Ipueiras*), iluminação pública, limpeza urbana, saneamento e trânsito, anexando fotografias e acompanhando o status (*Pendente*, *Em Análise*, *Em Andamento*, *Concluído*, *Cancelado*) e a **Devolutiva Oficial da Prefeitura**.
2. **Enviem Sugestões e Soluções:** Propostas colaborativas com descrição do problema e da solução sugerida para melhoria da cidade.
3. **Consultem e Cadastrem Eventos Municipais:** Divulgação de eventos e reuniões comunitárias (ex: *Aniversário de Picos*, *Dia das Crianças – Picos Cidade Kids*, *Picos Geek Show*).
4. **Gestão Administrativa (Modo Prefeitura):** Liberação de privilégios de Administrador mediante código institucional (`PREFEITURA2026`), permitindo realizar a triagem dos chamados, atualizar o status e emitir a devolutiva oficial com data.

---

## 2. Arquitetura de Microsserviços (Fiel ao Diagrama Arquitetural)

A aplicação implementa a **Arquitetura Final – Microsserviços**, dividida em **3 microsserviços independentes**, cada um com seu banco de dados isolado e componentes próprios de infraestrutura, posicionados atrás de um **API Gateway**:

```text
[Cidadão / Prefeitura] ➔ [DNS / Route 53] ➔ [Load Balancer] ➔ [API Gateway :3000]
                                                                    │
       ┌────────────────────────────────────────────────────────────┴───────────────────────────┐
       ▼ (Fluxo Síncrono - Resposta Imediata)                                                   ▼ (Fluxo Assíncrono - Mídia)
┌──────────────────────────────────┐   ┌──────────────────────────────────┐            ┌──────────────────────────────────┐
│ 1. Serviço de Identidade (:4001) │   │ 2. Serviço de Chamados (:4002)   │ ──(SQS)──► │ 3. Serviço de Mídia (:4003)      │
│ • Login / Sessão JWT             │   │ • Protocolos de Relatos          │            │ • Fila Amazon SQS + DLQ          │
│ • Cadastro e Recuperação         │   │ • Sugestões e Eventos            │            │ • Sanitização EXIF de Imagens    │
│ • Controle Cidadão / Admin       │   │ • Devolutivas da Prefeitura      │            │ • Armazenamento Amazon S3 + CDN  │
├──────────────────────────────────┤   ├──────────────────────────────────┤            └──────────────────────────────────┘
│ 🐘 Banco Isolado 1 (RDS/SQLite)  │   │ 🐘 Banco Isolado 2 (RDS/SQLite)  │
│    data/identity_rds.sqlite      │   │    data/tickets_rds.sqlite       │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

### Camada de Observabilidade Integrada
- **Amazon CloudWatch (Métricas e Logs):** Registra logs estruturados por grupo (`/aws/conectcity/identity-service`, `/aws/conectcity/tickets-service`, `/aws/conectcity/media-service`).
- **AWS X-Ray (Traces Distribuídos):** Cada requisição recebe um cabeçalho `X-Amzn-Trace-Id` (`Root=1-...`) rastreando a latência e o microsserviço de destino.
- **CloudWatch Alarms & Dead Letter Queue (DLQ):** Monitora a saúde dos 3 microsserviços e dispara alarme automático caso uma mídia corrompida falhe no processamento e seja movida para a **DLQ**.

---

## 3. Como Executar a Aplicação

### Opção 1: Execução Direta pelo Executável Windows (1 Clique)
Basta dar um duplo clique no arquivo:
```text
iniciar-conectcity.bat
```
Ele iniciará automaticamente os 3 microsserviços (`:4001`, `:4002`, `:4003`), o API Gateway (`:3000`) e abrirá o navegador em `http://localhost:3000`.

### Opção 2: Via Terminal (Node.js)
Na pasta `conectcity`, execute:
```bash
npm start
```
Acesse no navegador: **http://localhost:3000**

### Opção 3: Via Docker Compose (Containers Isolados)
```bash
docker compose up --build
```

---

## 4. Credenciais e Códigos para Demonstração no Vídeo

| Perfil | E-mail | Senha | Função |
| :--- | :--- | :--- | :--- |
| **Cidadã (Protótipo)** | `helany123@gmail.com` | `123456` | Visualizar, avaliar, cadastrar relatos/sugestões e editar perfil |
| **Prefeitura (Admin)** | `admin@picos.pi.gov.br` | `admin123` | Triagem de relatos, alteração de status, emissão de devolutivas e eventos |
| **Código "Sou Administrador"** | — | `PREFEITURA2026` | Código inserido no modal *Autenticação de Administrador* na tela de Perfil |

---

## 5. Roteiro Sugerido para o Vídeo da 2ª Avaliação (Até 30 Minutos)

1. **Parte 1 — Como Executa a Aplicação (3 min):**
   - Mostrar a estrutura de pastas (`services/identity-service`, `services/tickets-service`, `services/media-service`, `services/api-gateway` e `public`).
   - Executar `iniciar-conectcity.bat` ou `npm start` mostrando no terminal os 3 microsserviços e seus bancos isolados subindo nas portas `4001`, `4002`, `4003` e o Gateway na `3000`.
2. **Parte 2 — O que a Aplicação Faz e Tela Inicial (4 min):**
   - Apresentar a página **Início** do *e-CONECT-CITY (Município de Picos - PI)*, os recursos de acessibilidade no topo (`A+`, `A-`, Alto Contraste), a seção **Sobre Nós** e o **Objetivo do Projeto**.
3. **Parte 3 — Demonstração do Serviço de Identidade (5 min):**
   - Mostrar a tela de **Cadastro de Cidadão**, realizar um cadastro real e exibir o pop-out *"Cadastro realizado com sucesso!"*.
   - Mostrar a tela de **Recuperar Senha** e o pop-out *"Senha recuperada com sucesso!"*.
   - Fazer **Login** com a cidadã `helany123@gmail.com` e acessar **Configurações de Perfil**.
   - Clicar no botão **`Sou Administrador`**, inserir o código `PREFEITURA2026` no modal **Autenticação de Administrador** e mostrar a liberação imediata do perfil administrativo.
4. **Parte 4 — Demonstração do Serviço de Chamados: Relatos, Sugestões e Eventos (10 min):**
   - Acessar a aba **Relatos**, testar a busca (ex: pesquisar por `Ipueiras` ou filtrar por `Em Análise`), navegar pela paginação.
   - Clicar em **Visualizar** no card *"Buracos na Ipueiras"*, mostrando o modal detalhado com a foto, descrição, avaliação por estrelas e a **Devolutiva da Prefeitura**.
   - Como Administrador, alterar o status de um relato para *Em Andamento* ou *Concluído* e salvar uma nova Devolutiva Oficial.
   - Clicar em **Cadastrar um Relato**, preencher o **Formulário de Relato** com upload de uma imagem e mostrar o pop-out *"Relato enviado com sucesso!"*.
   - Acessar a aba **Sugestões**, visualizar uma sugestão existente e cadastrar uma nova no **Formulário de Sugestão**.
   - Acessar a aba **Eventos**, visualizar o modal do evento *"Dia das Crianças"* e cadastrar um novo evento no **Formulário de Evento**.
5. **Parte 5 — Demonstração da Arquitetura de Microsserviços, Fila SQS/DLQ e Observabilidade AWS (5 min):**
   - Clicar na aba **`☁️ Microsserviços AWS`** no menu superior.
   - Mostrar os **Fluxos Síncrono e Assíncrono** funcionando ao vivo: contagem de registros nos Bancos Isolados 1 e 2, mensagens processadas na fila **Amazon SQS** e objetos salvos no **Amazon S3 / CloudFront**.
   - Clicar no botão **`⚡ Simular Falha de Mídia (Testar DLQ)`** para demonstrar uma mensagem corrompida indo para a **Dead Letter Queue (DLQ)** e acionando o **CloudWatch Alarm**, e em seguida limpar a DLQ.
   - Mostrar os traces reais do **AWS X-Ray** e logs do **Amazon CloudWatch**.
