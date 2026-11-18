# Sistema de Controle de Estoque — Delfes / Arduino

Sistema web completo de controle de estoque industrial e laboratorial com **controle de acesso por perfil (RBAC)**, **catálogo de produtos com semáforo e edição inline de estoque mínimo**, **gestão de fornecedores**, **fluxo de solicitação de retirada com separação detalhada pelo almoxarifado**, **reposição inteligente e solicitações dinâmicas de compra**, **emissão de Ordem de Compra (OC)**, **recebimento físico parcial/total vinculado à Nota Fiscal (NF)** e **livro-razão imutável de movimentações**.

**Diferencial: Reposição Inteligente e Rastreabilidade Ponta a Ponta.** O sistema calcula o consumo médio diário de cada produto nos últimos 30 dias, cruza com o prazo de entrega do fornecedor preferencial e com a quantidade já a caminho (OCs emitidas), e exibe na tela **"Reposição"** tanto as **sugestões automáticas de baixo estoque** (agrupadas por fornecedor, com opção de complementar itens do fornecedor) quanto um **construtor dinâmico de solicitações para o estoque** integrado aos itens faltantes nas retiradas.

> Trabalho da disciplina de **Laboratório de Programação** — Curso de Ciência da Computação (**UNIFACVEST**)  
> **Professor:** Willen Leolatto Carneiro  
> **Integrantes:** Micael Dombroski e Kevin

---

## 1. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Frontend (`web/`)** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query v5, Sonner (Toasts), Tema Claro/Escuro |
| **Backend (`back/`)** | Node.js (22.x–24.x), Express 5, TypeScript (`tsx` + `nodemon` em desenvolvimento), Zod (validação estrita) |
| **ORM e Acesso a Dados** | Prisma ORM 7 (`@prisma/adapter-pg` + driver `pg`) |
| **Banco de Dados** | PostgreSQL 16 (`postgres:16-alpine`) provisionado via **Docker Compose** |

---

## 2. Pré-requisitos e Controle de Versões

Conforme as diretrizes da disciplina:

| Ferramenta | Versão Exigida |
|---|---|
| **Node.js** | Entre **22.x e 24.x** (verifique com `node -v`) |
| **PostgreSQL (via Docker)** | Versão **16** (faixa permitida: 15 a 16; roda em container Docker) |
| **Docker & Docker Compose** | Ativo e em execução |
| **Git** | Qualquer versão recente |

---

## 3. Estrutura do Repositório

```text
EstoquesArduinoDelfes/
├── back/                           # API RESTful (Node.js + Express 5 + Prisma 7)
│   ├── prisma/
│   │   ├── migrations/             # Histórico de migrações SQL versionadas
│   │   ├── schema.prisma           # Modelagem relacional completa
│   │   ├── extras.sql              # Triggers de saldo, CHECKs, índices parciais/GIN/BRIN e Views
│   │   └── seed.sql                # Carga inicial de dados para demonstração
│   ├── src/
│   │   ├── config/                 # Leitura e validação de variáveis de ambiente
│   │   ├── lib/                    # Instância singleton do Prisma Client
│   │   ├── middlewares/            # Autenticação/RBAC (auth), validação (validate) e erros (errorHandler)
│   │   ├── modules/                # Módulos de domínio (auth, usuarios, produtos, fornecedores,
│   │   │                           # requisitantes, pedidos-entrada, pedidos-saida, acompanhamento,
│   │   │                           # movimentacoes, estoque, reposicao)
│   │   ├── shared/                 # AppError, paginação e helpers de Decimal
│   │   ├── app.ts                  # Configuração do Express e registro de rotas (/api/v1)
│   │   └── server.ts               # Ponto de entrada do servidor HTTP
│   ├── .env.example
│   └── package.json
├── web/                            # Aplicação Frontend (Next.js App Router + Tailwind CSS)
│   ├── src/
│   │   ├── app/                    # Rotas App Router (/login, /, /saida, /pedidos, /recebimento,
│   │   │                           # /produtos, /fornecedores, /usuarios)
│   │   ├── components/             # Barra de navegação responsiva com badges (Nav), paginação, etc.
│   │   ├── features/               # Componentes de domínio (saida, entradas, recebimento,
│   │   │                           # reposicao, produtos, fornecedores, usuarios)
│   │   └── lib/                    # Cliente HTTP (api), sessão/RBAC (auth), hooks React Query, tipos
│   └── package.json
├── docs/
│   ├── arquitetura.md              # Documento detalhado de arquitetura, diagramas Mermaid e decisões
│   └── kanban-prints/              # Evolução visual do quadro Kanban do projeto
├── docker-compose.yml              # Orquestração do PostgreSQL 16 com healthcheck e volume
├── .env.example                    # Exemplo de variáveis de ambiente para o Docker Compose
├── DOCUMENTACAO_IA.md              # Registro analítico completo do uso de IA (prompts, iterações e decisões)
└── README.md                       # Guia de instalação, execução e referência rápida
```

---

## 4. Como Rodar Localmente (Passo a Passo)

### Passo 1: Clonar o repositório

```bash
git clone https://github.com/Micael-Dombroski/EstoquesArduinoDelfes.git
cd EstoquesArduinoDelfes
```

### Passo 2: Configurar os arquivos `.env`

Existem dois arquivos `.env`: o da **raiz** (lido pelo Docker Compose para subir o PostgreSQL) e o de **`back/.env`** (lido pela API e pelo Prisma).

No Linux / macOS:
```bash
cp .env.example .env
cp back/.env.example back/.env
```

No Windows (CMD):
```bat
copy .env.example .env
copy back\.env.example back\.env
```

Certifique-se de que usuário, senha, banco e porta em `back/.env` (`DATABASE_URL`) coincidam com os definidos no `.env` da raiz.

### Passo 3: Subir o banco de dados PostgreSQL via Docker

Com o Docker em execução, rode na **raiz** do projeto:

```bash
docker compose up -d
docker compose ps
```

Aguarde alguns segundos até o container `estoque-db` exibir o status `(healthy)`.

### Passo 4: Instalar dependências, aplicar migrações e popular o banco (`back/`)

```bash
cd back
npm install
npx prisma migrate deploy
npx prisma generate
```

Para popular o banco com os dados de demonstração (produtos eletrônicos/EPIs, fornecedores, histórico de 30 dias de consumo, pedidos e contas de usuários):

```bash
docker exec -i estoque-db psql -U estoque -d estoque_db < prisma/seed.sql
```

### Passo 5: Iniciar a API Backend

Ainda dentro da pasta `back/`:

```bash
npm run dev
```

A API iniciará em **`http://localhost:3000`** (com recarga automática via `nodemon` + `tsx`). Todos os endpoints respondem sob o prefixo `http://localhost:3000/api/v1`.

### Passo 6: Iniciar o Frontend (`web/`)

Em um **novo terminal**, acesse a pasta `web/`:

```bash
cd web
npm install
npm run dev
```

O frontend estará disponível em **`http://localhost:3001`** (configurado com proxy automático de `/api/v1/*` para a API na porta `3000`).

---

## 5. Perfis de Acesso (RBAC) e Contas de Demonstração

Na tela de login (`http://localhost:3001/login`), é possível autenticar digitando e-mail/senha ou utilizando os **acessos rápidos de 1 clique** (senha padrão: `123456`). O usuário pode remover contas individuais (`✕`) ou ocultar todo o painel de login rápido; caso autentique por uma conta que ainda não esteja salva no login rápido, o sistema exibe um modal perguntando se deseja salvá-la.

| Perfil | E-mail de Teste | Senha | Permissões e Responsabilidades no Sistema |
|---|---|---|---|
| **Solicitante** (`SOLICITANTE`) | `solicitante@estoque.local` | `123456` | Acessa **apenas** as telas **Solicitar material** (`/saida`) e **Produtos** (`/produtos`). Monta listas de materiais informando o destinatário/setor e consulta o catálogo (visualização do estoque mínimo somente leitura). |
| **Almoxarifado** (`ALMOXARIFADO`) | `almoxarifado@estoque.local` | `123456` | Realiza a **separação detalhada** das retiradas solicitadas (informando itens separados, quantidades e se faltantes precisam de compra ou estão a caminho), **dá baixa no estoque**, **edita o estoque mínimo (`pontoReposicao`)** nas telas de Produtos e Reposição, cria solicitações de compra (automáticas ou manuais) na tela **Reposição** (`/`) e registra a **chegada física de materiais por OC** (`/recebimento`). |
| **Setor de Compras** (`COMPRAS`) | `compras@estoque.local` | `123456` | Solicita e revisa pedidos de compra na tela **Reposição** (`/`) e **Pedidos e OC** (`/pedidos`), ajusta quantidades/preços, **aprova e emite a Ordem de Compra (OC)** e **lança a Nota Fiscal (NF)** (`/recebimento`) para liberar a entrada dos materiais no estoque (visualiza estoque mínimo como leitura). |
| **Supervisor** (`SUPERVISOR`) | `supervisor@estoque.local` | `123456` | Possui **acesso total**: edita estoque mínimo, aprova solicitações e emite OCs, realiza separação/baixa e estorno de retiradas, cadastra fornecedores e possui acesso exclusivo à tela de **Gestão de Usuários e Permissões (CRUD)** (`/usuarios`). |

---

## 6. Principais Funcionalidades Implementadas

1. **Autenticação, Login Rápido Inteligente e Controle de Acesso por Nível (RBAC):**
   - Proteção de rotas no frontend (`AppLayout` e `Nav`) e middlewares da API (`autenticar` e `exigirPerfil`).
   - Gerenciamento de contas salvas no **Entrar com 1 clique** (`/login`): permite remover perfis individuais ou todo o painel e pergunta automaticamente se o usuário deseja salvar uma conta no login rápido após autenticar com credenciais.
2. **Gestão de Usuários (CRUD exclusivo do Supervisor em `/usuarios`):** criação de contas, definição de perfil, vínculo com funcionários/destinatários, redefinição de senha e proteção contra desativação do último supervisor ativo.
3. **Solicitação de Retirada e Separação Detalhada (`/saida`):**
   - O **Solicitante** monta a lista de materiais e informa o **destinatário** e observações, enviando a solicitação como `PENDENTE` (sem abater saldo ainda).
   - O **Almoxarifado / Supervisor** visualiza os detalhes de cada item (código, marca, saldo atual e se já existe OC ativa a caminho), marca quais itens foram **separados**, a **quantidade separada** e classifica eventuais itens **faltantes para envio** entre **`Necessária a compra`** ou **`Já está a caminho (OC emitida)`**, realizando a **baixa no estoque** apenas do que foi efetivamente separado.
4. **Reposição Inteligente e Solicitações Dinâmicas para o Estoque (`/`)**:
   - **Notificação e Badge na barra lateral:** exibe contador âmbar no menu **Reposição** e banner de alerta de baixo estoque no topo da página.
   - **Aba 1 — Sugestões de estoque baixo:** cálculo automático no PostgreSQL (`vw_sugestao_reposicao`) agrupado por fornecedor, exibindo total estimado vs pedido mínimo do fornecedor (`valorMinimoPedido`) e seletor para incluir outros produtos daquele fornecedor no mesmo card.
   - **Aba 2 — `+ Solicitar itens para o estoque`:** construtor dinâmico que auto-seleciona o fornecedor preferencial ao escolher um produto, pré-preenche preço tabelado, marca e prazo (`ProdutoFornecedor`), calcula a previsão de entrega, permite importar em 1 clique os itens marcados como `NECESSITA_COMPRA` nas separações de saída e vincula automaticamente o `solicitanteId` do usuário logado.
5. **Edição Inline de Estoque Mínimo (`pontoReposicao` — exclusiva para Almoxarifado e Supervisor):**
   - Disponível tanto na coluna **Estoque mínimo** da tela de **Produtos** (`/produtos`) quanto contextualmente em cada item da tela de **Reposição** (`/`), com atalho de 1 clique **"Usar sugerido pelo consumo"** (`pontoSugerido` da view `vw_sugestao_reposicao`).
6. **Central Unificada de Pedidos e Ordens de Compra (`/pedidos`):**
   - Unifica a revisão/aprovação de solicitações (`RASCUNHO`) e o acompanhamento de entregas (`ENVIADO`, `RECEBIDO_PARCIAL`, `RECEBIDO`, `CANCELADO`), com filtro rápido de pedidos **`Em atraso`** e filtros avançados.
7. **Recebimento de Materiais em 2 Etapas — OC + NF (`/recebimento`):**
   - **Etapa 1 (Almoxarifado):** registra chegada física (total/parcial) por OC, ficando em `AGUARDANDO_NF`.
   - **Etapa 2 (Setor de Compras / Supervisor):** vincula a **Nota Fiscal (NF)** e credita efetivamente os materiais no saldo do estoque.
8. **Gestão de Fornecedores (`/fornecedores`) e Tema Claro/Escuro (`Claro` / `Escuro`)**.

---

## 7. Principais Endpoints da API (`/api/v1`)

| Método | Rota | Perfil Exigido | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | Público | Autentica usuário e retorna token assinado + dados da sessão |
| `GET/POST/PATCH/DELETE` | `/usuarios` e `/usuarios/:id` | `SUPERVISOR` | CRUD completo de usuários e permissões |
| `PATCH` | `/produtos/:id` | `ALMOXARIFADO`, `SUPERVISOR` | Atualiza dados do produto, incluindo `pontoReposicao` (estoque mínimo) |
| `GET` | `/reposicao/sugestoes` | Autenticado | Lista sugestões de compra agrupadas por fornecedor (`?apenasPrecisaRepor=false` traz análise completa) |
| `POST` | `/reposicao/rascunhos` | `ALMOXARIFADO`, `COMPRAS`, `SUPERVISOR` | Cria solicitação de compra (`RASCUNHO`) a partir da sugestão |
| `POST` | `/pedidos-entrada` | `ALMOXARIFADO`, `COMPRAS`, `SUPERVISOR` | Cria solicitação manual dinâmica de reposição para o estoque |
| `GET` | `/acompanhamento/entradas` | `ALMOXARIFADO`, `COMPRAS`, `SUPERVISOR` | Lista pedidos e solicitações com filtros (status, datas, solicitante, `atrasados`) |
| `PUT` | `/pedidos-entrada/:id/itens` | `ALMOXARIFADO`, `COMPRAS`, `SUPERVISOR` | Revisa itens, quantidades e preços de uma solicitação em rascunho |
| `POST` | `/pedidos-entrada/:id/enviar` | `COMPRAS`, `SUPERVISOR` | Aprova a solicitação e emite a Ordem de Compra (`OC-XXXX`) |
| `POST` | `/pedidos-entrada/:id/receber` | `ALMOXARIFADO`, `SUPERVISOR` | Registra chegada física (total/parcial) aguardando NF |
| `POST` | `/pedidos-entrada/recebimentos/:id/nf` | `COMPRAS`, `SUPERVISOR` | Vincula a Nota Fiscal (NF) e credita os itens no estoque |
| `POST` | `/pedidos-saida` | Autenticado | Cria solicitação de retirada (`PENDENTE` para Solicitante) ou baixa imediata |
| `PATCH` | `/pedidos-saida/:id/separacao` | `ALMOXARIFADO`, `SUPERVISOR` | Salva conferência de separação (itens separados e situação dos faltantes) |
| `POST` | `/pedidos-saida/:id/baixar` | `ALMOXARIFADO`, `SUPERVISOR` | Efetiva a baixa no estoque dos itens separados |
| `POST` | `/pedidos-saida/:id/cancelar` | `ALMOXARIFADO`, `SUPERVISOR` | Cancela solicitação pendente ou estorna retirada concluída |

---

## 8. Documentação Complementar

| Arquivo | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | Arquitetura em camadas, modelo relacional (ER), diagramas de sequência/estado e decisões de engenharia |
| [`DOCUMENTACAO_IA.md`](DOCUMENTACAO_IA.md) | Tabela obrigatória detalhando prompts utilizados, iterações de refinamento e decisões de engenharia |
| [`docs/kanban-prints/`](docs/kanban-prints/) | Capturas de tela da evolução do quadro Kanban no GitHub Projects |
