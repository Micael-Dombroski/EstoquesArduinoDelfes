# Sistema de Controle de Estoque

Sistema web de controle de estoque com cadastro de produtos e fornecedores, pedidos de entrada (compra e recebimento), pedidos de saída (retirada por requisitante) e histórico completo de movimentações.

**Diferencial: reposição inteligente.** O sistema calcula o consumo médio de cada produto, cruza com o prazo de entrega do fornecedor e mostra **"o que comprar hoje"**, agrupado por fornecedor, com um botão que gera o pedido de entrada já preenchido. Ele avisa antes de faltar.

> Trabalho da disciplina de **Laboratório de Programação** (UNIFACVEST, Ciência da Computação), Prof. Willen Leolatto Carneiro.
> **Integrantes:** Micael e Kevin

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| API | Node.js, Express 5, TypeScript (`tsx` e `nodemon` em desenvolvimento), zod |
| Acesso a dados | Prisma ORM 7 (adapter `pg`) |
| Banco | PostgreSQL 16 via Docker Compose |

## Pré-requisitos

| Ferramenta | Versão |
|---|---|
| Node.js | entre **22.x e 24.x** (confira com `node -v`) |
| Docker Desktop (com Docker Compose) | recente, **aberto e em execução** |
| Git | qualquer versão recente |

PostgreSQL **não** precisa ser instalado na máquina: ele roda dentro do Docker (versão 16).

## Estrutura do repositório

```
.
├── back/                  # API (Express + Prisma)
│   ├── prisma/            # schema.prisma, migrations/ e extras.sql
│   ├── src/               # código da API (módulos por domínio)
│   ├── .env.example
│   └── package.json
├── web/                   # Frontend  [PREENCHER: confirmar nome da pasta]
├── docs/
│   ├── arquitetura.md     # decisões de arquitetura e modelo de dados
│   └── kanban-prints/     # evolução do quadro de tarefas
├── docker-compose.yml     # PostgreSQL
├── .env.example
├── DOCUMENTACAO_IA.md     # registro de uso da IA
└── README.md
```

## Como rodar localmente

### 1. Clonar o repositório

```bash
git clone [PREENCHER: URL do repositório]
cd [PREENCHER: nome da pasta]
```

### 2. Criar os arquivos `.env`

Há dois arquivos `.env`: o da **raiz** é lido pelo Docker Compose (cria o banco) e o de **`back/`** é lido pela API e pelo Prisma. A senha e a porta precisam ser as mesmas nos dois.

Linux ou macOS:

```bash
cp .env.example .env
cp back/.env.example back/.env
```

Windows (CMD):

```bat
copy .env.example .env
copy back\.env.example back\.env
```

Abra os dois arquivos e troque `defina_uma_senha` por uma senha de sua escolha (a mesma nos dois e dentro do `DATABASE_URL`). Exemplo do `back/.env`:

```env
DATABASE_URL="postgresql://estoque:SUA_SENHA@localhost:5432/estoque_db?schema=public"
PORT=3000
```

> Os arquivos `.env` **não vão para o Git**. Apenas os `.env.example`, com valores fictícios, são versionados.

### 3. Subir o banco de dados

Abra o **Docker Desktop** e espere indicar que o motor está rodando. Depois, na **raiz** do projeto:

```bash
docker compose up -d
docker compose ps
```

O status do serviço `db` deve aparecer como `healthy` (leva cerca de 10 segundos).

### 4. Instalar e preparar a API

```bash
cd back
npm install
npx prisma migrate deploy
npx prisma generate
```

- `migrate deploy` cria as tabelas e também aplica a migração `extras` (trigger de saldo, CHECKs, índices e views de reposição).
- `generate` gera o Prisma Client. No Prisma 7 isso não é automático.

### 5. Rodar a API

```bash
npm run dev
```

A API sobe em `http://localhost:3000` (porta definida em `back/.env`) com `nodemon`: ela reinicia sozinha ao salvar um arquivo. Os endpoints ficam em `/api/v1`.

### 6. Rodar o frontend

```bash
cd ../web
npm install
npm run dev -p 3001
```

**[PREENCHER: confirmar os comandos e informar a URL do front, por exemplo `http://localhost:5173`]**

### 7. Dados de exemplo (opcional)

**[PREENCHER: se existir seed, o comando para executá-lo; se não existir, remova esta seção]**

## Funcionalidades

- Cadastro de produtos, fornecedores e requisitantes
- Pedido de entrada (rascunho, envio, recebimento total ou parcial, cancelamento)
- Pedido de saída com baixa automática do saldo
- Histórico de movimentações, com ajuste e estorno
- Semáforo de estoque e itens parados
- **Reposição inteligente:** tela "O que comprar hoje" e geração de pedido de entrada em rascunho

Detalhes das regras (cálculo de reposição, saldo por trigger, concorrência) em [`docs/arquitetura.md`](docs/arquitetura.md).

## API

Base: `http://localhost:3000/api/v1`

| Método | Rota | Descrição |
|---|---|---|
| POST | `/pedidos-saida` | Registra uma retirada e baixa o saldo |
| POST | `/pedidos-entrada/:id/enviar` | Envia o pedido ao fornecedor |
| POST | `/pedidos-entrada/:id/receber` | Registra o recebimento (total ou parcial) |
| POST | `/pedidos-entrada/:id/cancelar` | Cancela o pedido |
| GET | `/reposicao/sugestoes` | Lista o que comprar, agrupado por fornecedor |
| POST | `/reposicao/rascunhos` | Cria pedido de entrada em rascunho com a sugestão |

Os demais módulos seguem o mesmo padrão: `produtos`, `fornecedores`, `requisitantes`, `pedidos-entrada`, `pedidos-saida`, `movimentacoes` e `estoque`.

Erros seguem um formato único:

```json
{ "error": { "code": "SALDO_INSUFICIENTE", "message": "Saldo insuficiente para um ou mais itens", "details": [] } }
```

A coleção de requisições para teste (Thunder Client) está em **[PREENCHER: caminho do arquivo]**.

## Comandos úteis

| Comando | Onde | O que faz |
|---|---|---|
| `docker compose up -d` | raiz | Sobe o banco |
| `docker compose down` | raiz | Para o banco (dados preservados) |
| `docker compose down -v` | raiz | Para o banco e **apaga os dados** |
| `docker compose logs db` | raiz | Mostra os logs do banco |
| `npm run dev` | `back` | API com recarga automática |
| `npx prisma migrate deploy` | `back` | Aplica as migrações existentes |
| `npx prisma studio` | `back` | Abre uma interface para ver as tabelas |

## Problemas comuns

| Mensagem | Causa e solução |
|---|---|
| `failed to connect to the docker API ... dockerDesktopLinuxEngine` | O Docker Desktop não está aberto. Abra e espere o motor iniciar. |
| `P1001: Can't reach database server` | O banco não está no ar ou a porta está errada. Rode `docker compose ps` na raiz. |
| `P1000: Authentication failed` | A senha do `.env` é diferente da usada quando o volume foi criado. Rode `docker compose down -v` e suba de novo (apaga os dados). |
| `port is already allocated` | Já existe um Postgres na porta 5432. Mude `POSTGRES_PORT` (por exemplo, `5433`) no `.env` da raiz e a porta no `DATABASE_URL`. |
| `Environment variable not found: DATABASE_URL` | O `back/.env` não existe ou não tem o `DATABASE_URL`. |
| Saldo insuficiente (422) ao registrar uma saída | Comportamento esperado: o banco impede saldo negativo. |

## Fluxo de trabalho (Git)

- Antes de programar: **pull** da `main`.
- Commits pequenos, um assunto por commit, no padrão *Semantic Commits*: `feat`, `fix`, `docs`, `chore`, `build`.
- Exemplo: `feat: cria rota de listagem de produtos`, `docs: atualiza a tabela de interacoes da IA`.

## Gestão do projeto

- **Kanban:** **[PREENCHER: link do GitHub Projects]**
- **Prints da evolução do quadro:** [`docs/kanban-prints/`](docs/kanban-prints/)

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | Modelo de dados, decisões de arquitetura, fluxos e limitações |
| [`DOCUMENTACAO_IA.md`](DOCUMENTACAO_IA.md) | Como a IA foi usada: prompts, iterações e critérios de aceitação |

## Entrega

Apresentação em **09/11/2026** (10 minutos). O sistema roda localmente: banco via Docker, API Node.js e frontend.