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

## Parte 4 — Demonstração do Serviço de Chamados: Relatos, Sugestões, Eventos e Gestão do Admin (8 a 10 min)

1. **Aba `Relatos`:**
   - Mostrar o grid de 3 colunas com fotografias reais dos relatos de Picos (*Buracos na Ipueiras*, *Iluminação precária no Junco*, *Drenagem pluvial na Boa Sorte*, etc.), status coloridos e paginação.
   - Demonstrar a pesquisa por texto (ex.: `Ipueiras`) e o filtro por status (ex.: `Em Análise`).
   - Clicar em **Visualizar** no card *"Buracos na Ipueiras"*:
     - Mostrar o protocolo (`PICOS-2026-0101`), foto real, avaliação por estrelas e a **Devolutiva da Prefeitura**.
     - Demonstrar o **Painel de Gestão da Prefeitura (Modo Administrador)**:
       - Clicar em **`✏️ Editar Dados do Relato`** para mostrar a edição de título, categoria, bairro, endereço e descrição.
       - Clicar no botão rápido **`✅ Liberar / Em Andamento`** (ou **`✔ Marcar como Concluído`**) e salvar a Devolutiva Oficial da Prefeitura.
   - Clicar em **`Cadastrar um Relato`**:
     - Preencher o **Formulário de Relato**, anexar uma foto no campo **Carregar Imagem** (processada assincronamente via SQS + S3) e clicar em **Enviar**, exibindo o pop-out *"Relato enviado com sucesso!"*.
2. **Aba `Sugestões`:**
   - Mostrar as sugestões cadastradas (*Ecopontos de Coleta Seletiva*, *Pontos de Wi-Fi Público nas Praças*, *Ciclovia na Av. Beira Rio*).
   - Clicar em **Visualizar** -> como Administrador, clicar em **`✅ Liberar / Aprovar Sugestão`** ou editar os dados e salvar o Parecer Oficial da Prefeitura.
   - Mostrar também o **Formulário de Sugestão** clicando em **`Cadastrar uma Sugestão`**.
3. **Aba `Eventos`:**
   - Mostrar os eventos municipais (*Aniversário de Picos*, *Dia das Crianças*, *Picos Geek Show*).
   - Clicar em **Visualizar** -> mostrar que o Administrador pode editar título, data, local, modalidade e descrição ou excluir o evento.

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
