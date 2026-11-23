# Guia de Apresentação — e-CONECT-CITY (Segunda Avaliação)

**Universidade Federal do Piauí (UFPI)**  
**Curso:** Sistemas de Informação — **Período:** 2026.2  
**Disciplina:** Tópicos Especiais em Engenharia de Software  
**Professora:** Dra. Juliana Oliveira de Carvalho  

---

## Parte 1 — Como Executa a Aplicação (2 a 3 min)

1. **Estrutura de Pastas do Projeto (`conectcity/`):**
   - `services/api-gateway/` (Porta `:3000`): Ponto único de entrada, roteamento HTTP e observabilidade (Amazon CloudWatch Logs, AWS X-Ray Traces e CloudWatch Alarms).
   - `services/identity-service/` (Porta `:4001`): Microsserviço 1 — Autenticação JWT, cadastro, recuperação de senha, perfil e controle de acesso Cidadão/Administrador.
   - `services/tickets-service/` (Porta `:4002`): Microsserviço 2 — Gestão de relatos, sugestões, eventos, avaliações e devolutivas oficiais da Prefeitura.
   - `services/media-service/` (Porta `:4003`): Microsserviço 3 — Fila assíncrona Amazon SQS, Dead Letter Queue (DLQ), sanitização EXIF de imagens e armazenamento Amazon S3 + CloudFront.
   - `data/`: Contém os **2 bancos de dados SQL isolados** (`identity_rds.sqlite` e `tickets_rds.sqlite`), seguindo o padrão *Database-per-Service*.
2. **Inicialização em 1 Clique ou Terminal:**
   - Executar `iniciar-conectcity.bat` (ou `npm start` no terminal).
   - Mostrar no terminal os 3 microsserviços (`:4001`, `:4002`, `:4003`) e o API Gateway (`:3000`) iniciando simultaneamente.
   - Acessar no navegador: `http://localhost:3000`.

---

## Parte 2 — O que a Aplicação Faz e Tela Inicial (2 a 3 min)

1. **Apresentação do Portal `e-CONECT-CITY (Município de Picos - PI)`:**
   - Explicar que a plataforma aproxima os cidadãos picoenses da gestão municipal para relato de problemas urbanos, proposição de soluções e divulgação de eventos comunitários.
2. **Barra Superior de Acessibilidade:**
   - Clicar em **`A+`**, **`A-`** e **`A`** para demonstrar o redimensionamento dinâmico de fonte.
   - Clicar no **ícone de Alto Contraste** (círculo preto/branco) para demonstrar o tema acessível de alto contraste em toda a aplicação.
3. **Seções da Página Inicial (`Início`):**
   - Mostrar o banner principal com o mosaico de Picos e os botões **Cadastrar um Relato** e **Cadastrar uma Solução**.
   - Mostrar as seções **SOBRE NÓS**, **OBJETIVO DO PROJETO** e o rodapé institucional.

---

## Parte 3 — Demonstração do Serviço de Identidade: Login, Cadastro e Permissão de Admin (4 min)

1. **Aba `Login`:**
   - Clicar em **Esqueceu a senha?** -> demonstrar a tela **Recuperar Senha** e o pop-out verde *"Senha recuperada com sucesso!"*.
   - Clicar em **Cadastrar** -> mostrar o formulário de **Cadastro de Cidadão** (Nome completo, CPF, Telefone, Endereço, Bairro, E-mail e Senha).
2. **Login e Liberação de Administrador (`PREFEITURA2026`):**
   - Na tela de Login, clicar no atalho **`👤 Cidadã (Helany Araújo)`** (`helany123@gmail.com` / `123456`) e clicar em **Entrar**.
   - Na tela **Configurações de Perfil**, clicar no botão **`Sou Administrador`**.
   - No modal **Autenticação de Administrador**, inserir o código **`PREFEITURA2026`** e clicar em **Autenticar**.
   - Mostrar o pop-out de confirmação e a liberação imediata dos poderes de **Administrador da Prefeitura de Picos**.

---

## Parte 4 — Demonstração do Serviço de Chamados: Triagem do Portal & CRUD Completo do Admin em Relatos, Sugestões e Eventos (8 a 10 min)

1. **Fluxo de Triagem (Antes de ir para o Portal, o Admin libera a ida):**
   - Enquanto estiver como **Cidadão** (ou deslogado), clique em **`Cadastrar um Relato`** (ou Sugestão / Evento), preencha os dados e envie.
   - Mostre o aviso: *"Relato enviado para triagem! O Administrador irá liberar a ida para o portal."*
   - Mostre que o novo item **ainda não aparece no portal público** para cidadãos comuns enquanto o Administrador não liberar.
2. **Entrando como Administrador para Liberar a Ida ao Portal e Executar o CRUD:**
   - Faça login como **Administrador** (`admin@picos.pi.gov.br` / `admin123` ou libere via código `PREFEITURA2026` no Perfil).
   - Acesse **Relatos**, **Sugestões** e **Eventos**:
     - Mostre a **Barra de Gestão & CRUD do Administrador** no topo de cada tela exibindo quantos itens estão **`🔒 Aguardando Liberação p/ Portal`** e quantos estão **`🌐 Publicados no Portal`**.
     - Mostre que os itens recém-cadastrados aparecem no topo com borda tracejada laranja e o botão direto **`✅ Liberar p/ Portal`**.
     - Clique em **`✅ Liberar p/ Portal`** para publicar o item instantaneamente no portal público (ou em **`🔒 Ocultar`** para retirá-lo do portal).
3. **CRUD Completo (Create, Read, Update, Delete) em Relatos, Sugestões e Eventos:**
   - **Em Relatos**:
     - **Create**: botão `+ Novo Relato` / `Cadastrar um Relato` com upload de foto (Amazon SQS + S3).
     - **Read**: busca por texto/bairro, filtro por status, paginação e visualização de protocolo e foto real.
     - **Update**: clicar em **`✏️ Editar`** no card (ou dentro do modal) para alterar Título, Categoria, Bairro, Endereço, Descrição, Visibilidade no Portal, Status e Devolutiva Oficial da Prefeitura.
     - **Delete**: clicar em **`🗑️ Excluir`** no card ou no modal para remover o relato do banco.
   - **Em Sugestões**:
     - **Create / Read / Update / Delete**: liberar sugestão para o portal (`✅ Liberar p/ Portal`), aprovar sugestão (`⭐ Aprovar Sugestão`), editar Título, Bairro, Categoria, Problema, Solução e Parecer da Prefeitura (`✏️ Editar`), ou excluir (`🗑️ Excluir`).
   - **Em Eventos**:
     - **Create / Read / Update / Delete**: liberar evento para o portal (`✅ Liberar p/ Portal`), editar Título, Categoria, Data, Local, Modalidade e Descrição (`✏️ Editar`), ou excluir (`🗑️ Excluir`).

---

## Parte 5 — Demonstração da Arquitetura AWS, Fila SQS/DLQ e Observabilidade (3 a 4 min)

1. **Acessar o Painel de Arquitetura AWS:**
   - No rodapé da página, clicar no link **`☁️ Painel de Arquitetura AWS (3 Microsserviços • SQS/DLQ • CloudWatch)`**.
   - Mostrar a camada de entrada (`Route 53` -> `Load Balancer (ALB)` -> `API Gateway :3000`) contabilizando as requisições reais.
   - Mostrar o **Fluxo Síncrono** (`Serviço de Identidade :4001` + `Banco Isolado 1` e `Serviço de Chamados :4002` + `Banco Isolado 2`).
   - Mostrar o **Fluxo Assíncrono** (`Amazon SQS` -> `Serviço de Processamento de Mídia :4003` -> `Amazon S3 + CloudFront` + `DLQ`).
2. **Simulação de Falha e Alarme na DLQ:**
   - Clicar em **`⚡ Simular Falha de Mídia (Testar DLQ)`**.
   - Mostrar o payload com erro caindo na **DLQ (Dead Letter Queue)** e o alarme `SQS-DeadLetterQueue-MessagesVisible` mudando de `[OK]` para `[ALARM]` no **CloudWatch Alarms**.
   - Clicar em **`Limpar DLQ`** para normalizar o alarme e mostrar os traces distribuídos no **AWS X-Ray** e logs no **Amazon CloudWatch**.

