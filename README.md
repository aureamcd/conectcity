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

## 4. Credenciais e Códigos de Acesso Padrão

| Perfil | E-mail | Senha | Função |
| :--- | :--- | :--- | :--- |
| **Cidadã** | `helany123@gmail.com` | `123456` | Visualizar, avaliar, cadastrar relatos/sugestões e editar perfil |
| **Prefeitura (Admin)** | `admin@picos.pi.gov.br` | `admin123` | Liberar, aprovar, editar e excluir relatos, sugestões e eventos, além de emitir devolutivas oficiais |
| **Código "Sou Administrador"** | — | `PREFEITURA2026` | Código inserido no modal *Autenticação de Administrador* na tela de Perfil |

