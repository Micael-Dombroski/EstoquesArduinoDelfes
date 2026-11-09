# Sistema de Controle de Estoque — Delfes / Arduino

Sistema web completo de controle de estoque industrial e laboratorial com **controle de acesso por perfil (RBAC)**, **catálogo de produtos e semáforo de estoque**, **gestão de fornecedores**, **fluxo de solicitação de retirada com separação detalhada pelo almoxarifado**, **solicitações de compra e emissão de Ordem de Compra (OC)**, **recebimento físico parcial/total vinculado à Nota Fiscal (NF)** e **livro-razão imutável de movimentações**.

**Diferencial: Reposição Inteligente e Rastreabilidade Ponta a Ponta.** O sistema calcula o consumo médio diário de cada produto nos últimos 30 dias, cruza com o prazo de entrega do fornecedor preferencial e com a quantidade já a caminho (OCs emitidas), e exibe na tela **"Hoje (Reposição)"** exatamente **o que comprar hoje**, agrupado por fornecedor, gerando a solicitação de compra com 1 clique antes que o material acabe.

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
│   │   ├── components/             # Barra de navegação responsiva (Nav), paginação, etc.
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

Na tela de login (`http://localhost:3001/login`), é possível autenticar digitando e-mail/senha ou clicando em qualquer um dos **4 perfis de demonstração** (senha padrão: `123456`):

| Perfil | E-mail de Teste | Senha | Permissões e Responsabilidades no Sistema |
|---|---|---|---|
| **Solicitante** (`SOLICITANTE`) | `solicitante@estoque.local` | `123456` | Acessa **apenas** as telas **Solicitar material** (`/saida`) e **Produtos** (`/produtos`). Monta listas de materiais informando o destinatário/setor e acompanha o status da separação. |
| **Almoxarifado** (`ALMOXARIFADO`) | `almoxarifado@estoque.local` | `123456` | Realiza a **separação detalhada** das retiradas solicitadas (informando itens separados, quantidades e se faltantes precisam de compra ou estão a caminho), **dá baixa no estoque**, gera solicitações de compra na tela **Hoje (Reposição)** e registra a **chegada física de materiais por OC** (`/recebimento`). |
| **Setor de Compras** (`COMPRAS`) | `compras@estoque.local` | `123456` | Revisa solicitações de compra do almoxarifado, ajusta quantidades/preços, **aprova e emite a Ordem de Compra (OC)** (`/pedidos`) e **lança a Nota Fiscal (NF)** (`/recebimento`) para liberar a entrada dos materiais no estoque. |
| **Supervisor** (`SUPERVISOR`) | `supervisor@estoque.local` | `123456` | Possui **acesso total**: aprova solicitações e emite OCs, realiza separação/baixa e estorno de retiradas, cadastra fornecedores e possui acesso exclusivo à tela de **Gestão de Usuários e Permissões (CRUD)** (`/usuarios`). |

---

## 6. Principais Funcionalidades Implementadas

1. **Autenticação e Controle de Acesso por Nível (RBAC)** com proteção tanto no frontend (`AppLayout` e `Nav`) quanto nos middlewares da API (`autenticar` e `exigirPerfil`).
2. **Gestão de Usuários (CRUD exclusivo do Supervisor em `/usuarios`)**: criação de contas, definição de perfil, vínculo automático ou manual com funcionários/destinatários, redefinição de senha, ativação/desativação e exclusão segura.
3. **Solicitação de Retirada e Separação Detalhada (`/saida`)**:
   - O **Solicitante** monta a lista de materiais e informa o **destinatário** e observações, enviando a solicitação como `PENDENTE` (sem abater saldo ainda).
   - O **Almoxarifado / Supervisor** visualiza os detalhes de cada item (código, marca, saldo atual e se já existe OC ativa a caminho), marca quais itens foram **separados**, a **quantidade separada** e classifica eventuais itens **faltantes para envio** entre **`Necessária a compra`** ou **`Já está a caminho (OC emitida)`**, realizando a **baixa no estoque** apenas do que foi efetivamente separado.
4. **Reposição Inteligente — "Hoje (Reposição)" (`/`)**: cálculo automático no PostgreSQL (`vw_sugestao_reposicao`) cruzando consumo médio de 30 dias, prazo do fornecedor, margem de segurança e saldo a caminho, gerando solicitações de compra com 1 clique.
5. **Central Unificada de Pedidos e Ordens de Compra (`/pedidos`)**:
   - Unifica a revisão/aprovação de solicitações (`RASCUNHO`) e o acompanhamento de entregas (`ENVIADO`, `RECEBIDO_PARCIAL`, `RECEBIDO`, `CANCELADO`).
   - Alerta de valor mínimo exigido pelo fornecedor, revisão inline de quantidades e preços unitários, geração de código `OC-XXXX` e **filtro rápido de pedidos em atraso** (`Em atraso`) além de filtros avançados por período e solicitante.
6. **Recebimento de Materiais em 2 Etapas — OC + NF (`/recebimento`)**:
   - **Etapa 1 (Almoxarifado):** busca pela Ordem de Compra (`OC`), marca via checkboxes os itens recebidos e edita as quantidades entregues (suportando **entrega parcial**), gerando um registro `AGUARDANDO_NF`.
   - **Etapa 2 (Setor de Compras / Supervisor):** confere a entrega registrada pelo almoxarifado e informa o número da **Nota Fiscal (NF)**. **Somente após o lançamento da NF** os materiais entram efetivamente no saldo do estoque (`movimentacoes` / `saldo_atual`).
7. **Catálogo de Produtos com Semáforo (`/produtos`) e Gestão de Fornecedores (`/fornecedores`)**.
8. **Tema Claro e Escuro (`Claro` / `Escuro`)** persistido no navegador e sincronizado em todas as telas.

---

## 7. Principais Endpoints da API (`/api/v1`)

| Método | Rota | Perfil Exigido | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | Público | Autentica usuário e retorna token assinado + dados da sessão |
| `GET/POST/PATCH/DELETE` | `/usuarios` e `/usuarios/:id` | `SUPERVISOR` | CRUD completo de usuários e permissões |
| `GET` | `/reposicao/sugestoes` | Autenticado | Lista sugestões de compra agrupadas por fornecedor |
| `POST` | `/reposicao/rascunhos` | `ALMOXARIFADO`, `COMPRAS`, `SUPERVISOR` | Cria solicitação de compra (`RASCUNHO`) a partir da sugestão |
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
