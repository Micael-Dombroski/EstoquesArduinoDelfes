# DOCUMENTAÇÃO DE USO DE IA

**Projeto:** Sistema de Controle de Estoque
**Disciplina:** Laboratório de Programação (Prof. Willen Leolatto Carneiro): UNIFACVEST
**Integrantes:** **Micael** e **Kevin**
**IA utilizada:** Claude (Anthropic), via interface de chat
**Repositório:** **https://github.com/Micael-Dombroski/EstoquesArduinoDelfes**
---

## 1. Como a IA foi utilizada

A IA atuou como assistente de engenharia em quatro frentes: **análise de requisitos e modelagem**, **configuração de infraestrutura** (Docker, variáveis de ambiente, nodemon), **modelagem do banco de dados** (Prisma e PostgreSQL) e **orientação de fluxo de trabalho** (Git e convenção de commits).

O grupo atuou como **revisor do código gerado**: nenhuma sugestão foi aceita sem leitura, execução local e conferência com as diretrizes da disciplina. Quando a IA errou ou não considerou o contexto real do projeto, o erro foi registrado na coluna *Refinamento* de cada entrada.

O domínio do sistema (estoque, atualmente controlado no sistema Symprod) e o levantamento inicial das entidades foram feitos pelo grupo. A IA foi usada para criticar e refinar esse levantamento, não para inventá-lo.

## 2. Critérios de aceitação do código gerado

Um trecho gerado pela IA só entra no repositório se atender a **todos** os critérios abaixo:

1. **Executa localmente** com `docker compose up -d` e `npm run dev`, sem passos manuais além dos documentados no `README.md`.
2. **Respeita as versões obrigatórias:** Node.js entre 22.x e 24.x, PostgreSQL entre 15 e 16.
3. **Sem credenciais no Git:** senhas e URLs de conexão ficam no `.env` (ignorado); apenas o `.env.example` é versionado.
4. **Integridade garantida no banco**, e não apenas na API: chaves estrangeiras, `CHECK` e restrições de unicidade.
5. **Compreendido pelo grupo:** nenhum trecho é aceito se algum integrante não consegue explicá-lo na apresentação.
6. **Separação de responsabilidades:** rotas, controllers e acesso a dados em camadas distintas.
7. **Tratamento de erros** com `try/catch` e códigos HTTP corretos.
8. **Testado manualmente** (Thunder Client ou equivalente) antes do commit.
9. **Commit semântico** (`feat`, `fix`, `docs`, `chore`, `build`) com mensagem clara.

## 3. Registro das interações

### 3.1 Configuração do nodemon no backend

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Configurar o `nodemon` para facilitar o desenvolvimento local (requisito de stack das diretrizes). | "como fazer isso no node.js? nodemon deve ser configurado para facilitar o desenvolvimento local" | A resposta inicial funcionou como base: instalação como dependência de desenvolvimento, scripts `start` e `dev` e um `nodemon.json`. Mais tarde, ao adotar um único `.env` na raiz, o `exec` precisou ser ajustado para `node --env-file=../.env src/index.js`. **[PREENCHER: confirmar se o `npm run dev` subiu a API sem erro]** | `nodemon` como `devDependency` (e não global) para que todos que clonarem o projeto usem a mesma versão. Configuração em `nodemon.json` para observar só `src`. Uso do `--env-file` nativo do Node 22+, evitando uma dependência extra. |

### 3.2 Levantamento de requisitos e definição do diferencial

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Validar o tema (sistema de estoque) e o esboço de entidades feito pelo grupo, e definir um diferencial para o projeto. | "Atue como um Engenheiro de Software Sênior e expert em user experience. Qual sua opinião? o sistema usado no estoque é o symprod, fiz um levantamento de entidades que devem ter no sistema e anexei um trabalho com requisitos? acha que fica bom usar isso? qual diferencial você colocaria no projeto que pode auxiliar no dia a dia usando esse projeto?"<br><br>Anexos: foto do esboço manuscrito de entidades e PDF das diretrizes. | A IA apontou ajustes no modelo do esboço: (1) quantidade não deve ser campo fixo do produto, e sim derivada de movimentações; (2) ponto de reposição pertence ao produto; (3) "tempo no estoque" é um valor calculado; (4) pedidos precisam de cabeçalho e itens; (5) Fornecedor × Produto é N:N e o tempo de entrega pertence a essa relação; (6) marca pode ser texto no MVP. Também pediu confirmação de um campo ilegível ("$ mín"). **[PREENCHER: quais ajustes foram aceitos, quais foram rejeitados e por quê; o que significava "$ mín"]** | Aprovado o uso de **movimentação como fonte da verdade do saldo** (histórico, auditoria e base para calcular consumo). Diferencial escolhido: **reposição inteligente** (consumo médio × prazo de entrega + margem), com a tela "O que comprar hoje". Escopo limitado a um núcleo (cadastros, entrada, saída, saldo) mais **um único** diferencial, por causa do prazo de 09/11/2026. |

### 3.3 Docker Compose e variáveis de ambiente

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Provisionar o PostgreSQL via Docker Compose (requisito obrigatório) e decidir onde guardar a senha. | "como defino no docker-compose o uso do postgres? o password eu guardo no .env ou não precisa?"<br><br>"prefiro um unico .env" | A primeira proposta usava dois arquivos `.env` (um na raiz para o Docker e outro em `back` para o Prisma). O grupo preferiu um só, e a IA reorganizou: `.env` único na raiz, lido pelo Compose automaticamente, pelo Node via `--env-file=../.env` e pelo Prisma via `dotenv-cli`.<br><br>Problemas na execução: o `docker compose up` falhou com erro de conexão com a API do Docker (`dockerDesktopLinuxEngine`) porque o **Docker Desktop não estava aberto**; o comando também foi rodado na pasta errada (`back\src`, em vez da raiz). **[PREENCHER: confirmar que o container ficou `healthy`]** | Imagem `postgres:16-alpine` (dentro do limite 15–16 exigido; evitado `latest`). Senha no `.env` fora do Git, com `.env.example` versionado. Volume nomeado para persistência. `healthcheck` para saber quando o banco aceita conexões. Um único `.env` para evitar divergência de credenciais. |

### 3.4 Modelagem do banco de dados (Prisma e PostgreSQL)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Criar o `schema.prisma` com as entidades e relacionamentos definidos, otimizando o banco com índices e consultas para a reposição inteligente. | "Você é um expert em prisma e banco de dados postgres, monte os schemas para as tabelas do projeto, tendo em vista os relacionamentos e especificacões idealizadas anteriormente, também use o conhecimento em postgres a seu favor para otimizar o banco pensando até em consultas inteligentes e indices se necessário." | **Não funcionou de primeira.** O `npm run migrate` falhou com o erro `P1012`: o projeto instalou o **Prisma 7.10.1**, que não aceita `url` dentro do `datasource` do `schema.prisma`, e a IA havia gerado o schema no formato do Prisma 6. A IA ofereceu duas saídas: fixar o Prisma na versão 6, ou migrar para o 7 (config em `prisma.config.ts`, novo generator e adapter `pg`).<br><br>**[PREENCHER: qual opção o grupo escolheu e por quê; se o migrate passou; se o `extras.sql` foi aplicado sem erro]** | Decisões aprovadas após revisão:<br>• `Movimentacao` imutável (correção por `ESTORNO`).<br>• `saldo_atual` mantido por **trigger**, com `CHECK (saldo_atual >= 0)`, garantindo consistência mesmo com saídas simultâneas.<br>• Prazo de entrega na relação N:N `ProdutoFornecedor`.<br>• Índice composto `(produto_id, tipo, data)` para consumo médio; GIN trigram para autocompletar; índice parcial para produtos abaixo do ponto; BRIN para a tabela de movimentações.<br>• Views `vw_estoque_situacao` e `vw_sugestao_reposicao` para o diferencial.<br>• `Decimal` para quantidades e valores; `Timestamptz` para datas.<br>Recursos que o Prisma não modela (triggers, views, índices parciais) ficam em `prisma/extras.sql`, aplicado por uma migração própria. |

### 3.5 Estrutura de pastas, Git e convenção de commits

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Organizar o repositório em `front` e `back`, definir o padrão de commits e conduzir o fluxo de Git pelo VS Code, sem usar o terminal. | "criei uma pasta para front e uma para back, na back eu boto o node modules né?"<br><br>"o commit para indicar que iniciei a estrutura das pastas e criei o docker fica como feature?"<br><br>"e como faco pelo vscode? não quero usar o terminal"<br><br>"fiz um commit errado mas não subi, como corrijo?"<br><br>"e deixar a senha no .env fica como feature?"<br><br>"como faco merge agora na main?" | A IA corrigiu a premissa do grupo: estrutura de pastas e Docker são **configuração**, não funcionalidade, então o prefixo adequado é `chore` ou `build`, e não `feat`. Para o schema do banco, o `feat(db)` é adequado.<br><br>Problema na execução: o `package.json`, o `package-lock.json` e a `node_modules` foram criados dentro de `back/src`, quando deveriam estar em `back`. Isso causou o erro `ENOENT` no `npm run migrate`. A solução foi mover os arquivos para a pasta correta. **[PREENCHER: confirmar que a estrutura foi corrigida]** | Padrão de commits: `chore`/`build` para infraestrutura, `feat(db)` para o modelo de dados, `docs` para documentação. Commits pequenos, um assunto por commit, para que o histórico mostre a evolução do trabalho. `node_modules` e `.env` ficam no `.gitignore`. |

### 3.6 Documentação de arquitetura e da IA

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Registrar as decisões de banco de dados em `docs/arquitetura.md` e montar este arquivo conforme o modelo da disciplina. | "a criacao do schema e do banco se encaixa como feature? como coloco explico na arquitetura as decisões de bd?"<br><br>"me ajude a criar o arquivo DOCUMENTACAO_IA.md baseado na exigência do trabalho" | A IA sugeriu o formato *decisão → motivo → alternativa descartada → consequência* e um diagrama ER em Mermaid. Este documento foi gerado a partir do histórico real de conversas e revisado pelo grupo. **[PREENCHER: o que o grupo alterou ou corrigiu neste texto]** | Documentação em Markdown dentro do repositório, versionada junto com o código. Diagrama em Mermaid, que o GitHub renderiza sem ferramentas extras. |

### 3.7 Estrutura e Arquitetura do Front-end (Next.js + App Router)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Criar a interface priorizando velocidade e zero treinamento (Retirar material, Hoje/Comprar, Produtos). | "Crie a interface com node.js e Next.js App Router para o estoque com foco em agilidade de almoxarifado..." | **Conflito de Porta e CORS:** O Next dev roda na porta 3000 por padrão, conflitando com a API Express. Ajustado o script para `next dev -p 3001`. Adicionado `rewrites` no `next.config.ts` para redirecionar `/api/*` à API backend.<br>**Roteamento:** Removido `src/app/page.tsx` gerado automaticamente pelo template para evitar conflito de rota com `src/app/(app)/page.tsx`. | • Next.js como interface client-heavy sem duplicar lógica de backend.<br>• **TanStack Query** para cache e invalidação inteligente.<br>• **Proxy local (`rewrites`)** evitando problemas de CORS em desenvolvimento.<br>• Leitor USB de código de barras integrado ao campo de busca focado. |

### 3.8 Tratamento de Erros e Integração de APIs

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Tratar respostas da API (`SALDO_INSUFICIENTE`, `EXCEDE_PEDIDO`) e estorno rápido via toast. | "Tratar os retornos da API em português e permitir Desfazer movimentação com Toast." | **Formatos de API:** Tipos isolados em `lib/types.ts`. Implementado `unwrapList` para tratar arrays puros ou envelopados (`{ data: [...] }`). Tratamento do erro 422 destacando itens sem saldo sem limpar o carrinho. | • `sonner` com botão "Desfazer" acionando `POST /pedidos-saida/:id/cancelar`.<br>• Centralização de mapeamento de códigos de erro em `lib/errors.ts`. |

---

## 4. Modelo para novas entradas

Copie a tabela abaixo para cada nova funcionalidade desenvolvida com a IA (rotas e controllers, tela de saída, tela "O que comprar hoje", etc.).

### 3.X Nome da funcionalidade

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Qual funcionalidade ou bug estava sendo resolvido. | Texto exato enviado à IA, com contexto e instruções. | Funcionou de primeira? O que a IA precisou corrigir? | Por que o código foi aprovado (segurança, performance, padrão). |

## 5. Funcionalidades previstas (a registrar)

- [ ] API REST de produtos, fornecedores e requisitantes (CRUD)
- [ ] Pedido de entrada (cabeçalho e itens) com recebimento
- [ ] Pedido de saída com geração de movimentações
- [ ] Tela "O que comprar hoje" (reposição inteligente)
- [ ] Semáforo de estoque e itens parados
- [ ] Frontend consumindo a API

## 1. Como a IA foi utilizada

- **IA utilizada:** Claude (Anthropic), em conversa de chat.
- **Papel da IA:** assistente de arquitetura e geração de código (boilerplate, rotas, serviços, scripts).
- **Papel do grupo:** definir o domínio e o escopo, revisar cada entrega como *code reviewers*, executar tudo localmente, reportar erros reais e decidir o que aprovar.
- **Fluxo adotado:** (1) analisar o domínio e a modelagem, (2) definir a arquitetura da API antes de gerar código, (3) gerar o backend por módulos, (4) subir o ambiente e testar manualmente, (5) devolver cada erro encontrado à IA com a mensagem completa.
- **Limite importante:** a IA **não executou nem compilou** o código do projeto (sem acesso à rede para instalar dependências). Ela só verificou erros de sintaxe. Todo o comportamento foi validado pelo grupo rodando o sistema (seção 3.7).

## 2. Critérios de aceitação adotados para o código gerado

Um trecho de código só foi aceito quando:

1. **Roda localmente** com o fluxo: `docker compose up -d` → `prisma migrate` → `npm run dev`.
2. **Respeita as versões exigidas:** Node 22.x a 24.x e PostgreSQL 16 (dentro da faixa 15–16).
3. **A integridade é garantida pelo banco**, não só pela API (CHECKs, trigger de saldo, imutabilidade das movimentações).
4. **A API nunca escreve o saldo:** `saldoAtual` e `saldoApos` só mudam pela trigger. Enviar esses campos no body retorna erro 400.
5. **Erros seguem um formato único** (`error.code`, `error.message`, `error.details`) com status HTTP coerentes (400, 404, 409, 422).
6. **Operações que geram movimentação são transacionais** (pedido, itens e movimentações entram juntos ou não entram).
7. **O roteiro de testes manual passa** (seção 3.7), incluindo os casos de erro.
8. **Segredos fora do Git:** `.env` no `.gitignore`; apenas `.env.example` com valores fictícios é versionado.
9. **Cada decisão é compreendida e registrada** neste documento, e não apenas copiada.

## 3. Registro por funcionalidade

### 3.1 Ambiente: PostgreSQL no Docker e variáveis de ambiente

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Provisionar o PostgreSQL via Docker Compose, com credenciais em `.env` (requisito das diretrizes). | `crie o.env para uso do postgres no docker` | A IA gerou `.env` e `docker-compose.yml` iniciais (`postgres:16`, volume nomeado, `env_file`).<br>O compose final do grupo difere da sugestão: `postgres:16-alpine`, `container_name`, `healthcheck` e porta padrão `51214`.<br>Erros encontrados depois (ver seção 4): mapeamento de porta e credenciais do volume. | `postgres:16` fica dentro da faixa permitida (15–16).<br>Volume nomeado `pgdata` para persistência.<br>`docker-compose.yml` na **raiz** do repositório (como no modelo das diretrizes), com um `.env` na raiz (lido pelo Compose) e outro em `back/` (lido pela API e pelo Prisma).<br>`.env` no `.gitignore`; só os `.env.example` são versionados. |

### 3.2 Modelagem do domínio

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Transformar o desenho inicial das entidades em um modelo relacional correto (`schema.prisma`). | `[PREENCHER: prompts da conversa em que a análise do projeto e o schema.prisma foram gerados]`<br>Documento gerado nessa conversa: `analise-de-ia-sobre-projeto-com-sugestoes.pdf`. | `[PREENCHER: o que a IA errou ou o grupo mudou no schema]` | Quantidade **não** é campo fixo do produto: o saldo vem de uma tabela de **Movimentação** (histórico + auditoria).<br>Ponto de reposição fica no Produto; "tempo no estoque" é **derivado** (calculado na consulta, não armazenado).<br>Pedido tem **cabeçalho + itens** (entrada e saída).<br>Fornecedor × Produto é N:N (`ProdutoFornecedor`), e o prazo de entrega e o preço pertencem a essa relação.<br>Marca como texto no MVP; valor mínimo de compra no Fornecedor.<br>Pergunta em aberto: estoque de **local único** (assumido). |

### 3.3 Regras no banco de dados (`extras.sql`)

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Garantir saldo consistente e sem valores negativos, mesmo com duas saídas simultâneas; fornecer views para semáforo e reposição. | `[PREENCHER: prompt(s) em que o extras.sql foi gerado]` | `[PREENCHER]`<br>Aplicação: o conteúdo é colado como segunda migração (`--create-only --name extras`), porque o Prisma não modela triggers, views e índices parciais. | **Trigger** `BEFORE INSERT` em `movimentacoes` aplica a variação ao saldo; o `UPDATE` trava a linha do produto, serializando saídas concorrentes.<br>**CHECKs** (saldo, quantidades e prazos não negativos; sinal coerente com o tipo da movimentação; ESTORNO sempre aponta para a original).<br>**Livro-razão imutável:** `UPDATE`/`DELETE` em movimentações são bloqueados; correção só por ESTORNO.<br>**Índice único parcial:** no máximo um fornecedor preferencial por produto.<br>**Índices trigram** para autocomplete, **BRIN** em tabela append-only e índice parcial para itens abaixo do ponto de reposição.<br>**Views** `vw_estoque_situacao` (semáforo, dias no estoque, itens parados) e `vw_sugestao_reposicao` (diferencial). |

### 3.4 Arquitetura das chamadas de API

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Definir como o front consome o backend: recursos, convenções, regras de transação, formato de erro e chamadas por tela. | `Você é um arquiteto de soluções, defina como as chamadas de API devem ocorrer, e monte a estrutura das chamadas, o ptojeto usa node.js com cors e express, e prisma.`<br>Anexos: `analise-de-ia-sobre-projeto-com-sugestoes.pdf`, `schema.prisma`, `extras.sql`.<br>Seguiram: `acha que precisa mudar mais alguma coisa? o arquivo em anexo permite usar ts para a api ou tem que ser js?` (com as diretrizes do professor anexadas). | A IA propôs endpoints, convenções e fluxos por tela.<br>Na revisão cruzada com as diretrizes, a IA apontou: automatizar o `extras.sql` na migração, criar seed para a demo, fixar versões (`engines`), alinhar a estrutura do repositório e priorizar o escopo para o prazo.<br>Pergunta sobre `app.ts`: o comentário `// ... demais routers` foi substituído pela lista completa dos 8 routers. | API REST versionada em `/api/v1`; rotas em português, plural e kebab-case.<br>**Não existe `POST /movimentacoes` genérico**: movimentações nascem de saída, recebimento, ajuste e estorno.<br>Ações de negócio como sub-recursos (`/:id/enviar`, `/:id/receber`, `/:id/cancelar`) em vez de `PATCH status`.<br>**Soft delete** (`ativo = false`) nos cadastros, porque o histórico usa `onDelete: Restrict`.<br>`Decimal` trafega como **string** (evita erro de ponto flutuante).<br>Código por módulo: `routes` → `controller` → `service` → `schemas`, para separar responsabilidades.<br>Reposição como **diferencial único**: `GET /reposicao/sugestoes` (agrupado por fornecedor) e `POST /reposicao/rascunhos`. |

### 3.5 Escolha de linguagem: TypeScript

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Verificar se as diretrizes permitem TypeScript no backend (os exemplos do PDF usam `.js`). | `o arquivo em anexo permite usar ts para a api ou tem que ser js?` | A IA leu as diretrizes: exigem Node.js + Express e `nodemon`, sem restringir a linguagem.<br>`[PREENCHER: se o grupo confirmou com o professor]` | Usar **TypeScript**, mantendo o `nodemon` como runner de desenvolvimento (`nodemon --exec tsx src/server.ts`).<br>Motivo: o client do Prisma é tipado e os tipos reduzem erros nas regras de negócio.<br>Plano alternativo: JS com ESM, se o TS atrapalhar a execução na apresentação. |

### 3.6 Implementação do backend

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Criar a base da API: middlewares, utilitários e os 8 módulos (produtos, fornecedores, requisitantes, pedidos de entrada e saída, movimentações, estoque, reposição). | `no app.ts você deixou // ... demais routers, quais routers seriam?`<br>`não tenho essa pasta e nem a middleware, crie a middleware e os arquivos necessários`<br>`gera os routes de cada modules` | A IA gerou 45 arquivos em um zip e verificou apenas a sintaxe (sem compilar com tipos).<br>Os erros de TypeScript no VS Code vieram de dependências não instaladas e client do Prisma não gerado (seção 4).<br>`[PREENCHER: ajustes feitos pelo grupo no código gerado]` | **Express 5** (erros assíncronos chegam ao `errorHandler` sem wrapper).<br>**zod** valida `params`, `query` e `body`; schemas `.strict()` rejeitam `saldoAtual`. O resultado fica em `res.locals.valid`, porque `req.query` é somente leitura no Express 5.<br>**`errorHandler` central** converte `ZodError`, erros de negócio e códigos do Prisma (`P2002`→409, `P2025`→404) e reconhece o CHECK de saldo pelo nome da constraint (→ 422 `SALDO_INSUFICIENTE`).<br>**`prisma.$transaction`** em toda operação que gera movimentação.<br>**Itens ordenados por `produtoId`** antes de gravar, para evitar deadlock (a trigger trava a linha do produto).<br>**Estorno de recebimento** devolve a quantidade ao item e recalcula o status do pedido, mantendo correto o "já a caminho" da view de reposição.<br>Recebimento acima do pedido retorna 422 `EXCEDE_PEDIDO`.<br>No envio, a previsão de entrega usa o maior prazo entre os itens, se não informada.<br>Rascunho de reposição pré-preenche quantidade sugerida, preço e marca. |

### 3.7 Subida do ambiente e testes manuais

| Problema / Requisito | Prompts utilizados | Refinamento (iterações) | Decisão de engenharia |
|---|---|---|---|
| Validar o backend de ponta a ponta antes de construir o front. | `como testo agora a api?`<br>(e as mensagens de erro da seção 4, enviadas com o texto completo.) | A IA propôs um roteiro no Thunder Client (sucesso + erro) e ajudou a diagnosticar cada falha.<br>Resultado informado pelo grupo: **todos os testes do roteiro passaram**. | Roteiro adotado como critério de aceitação:<br>1) `GET /health`.<br>2) Criar requisitante, fornecedor e produto; vincular fornecedor com prazo.<br>3) Pedido de entrada: criar → enviar → receber; saldo do produto passa a refletir a entrada.<br>4) Pedido de saída; saldo diminui.<br>5) Erros: saída maior que o saldo (422), `saldoAtual` no body (400), código duplicado (409), id inexistente (404), receber duas vezes (409), rota inexistente (404).<br>6) Estorno (e estorno repetido, 409) e cancelamento de saída.<br>7) Reposição: semáforo, sugestões agrupadas e geração de rascunho.<br>Coleção do Thunder Client: `[PREENCHER: caminho em docs/]`. |

## 4. Problemas encontrados e como foram resolvidos

| Sintoma | Causa | Solução | Observação sobre a IA |
|---|---|---|---|
| VS Code: `Cannot find module 'zod'`, `'express'`, `'@prisma/adapter-pg'`, `'../generated/prisma/client'` e `Cannot find name 'process'`. | Dependências não instaladas, client do Prisma não gerado, `tsconfig.json` e tipos do Node ausentes. | `npm install` das dependências e dev-dependencies, `tsconfig.json`, `npx prisma generate` e reinício do TS Server. | O código estava correto; a IA não pôde instalar pacotes no ambiente dela. |
| `docker compose ps` não mostrava a porta esperada; conexão recusada. | Mapeamento `"${POSTGRES_PORT:-51214}:51214"`: o lado do container deve ser **5432**, a porta interna do Postgres. | Alterar para `...:5432`. | Diagnóstico correto da IA a partir do print do compose. |
| `P1001: Can't reach database server at localhost:51214`, mesmo com o Prisma exibindo `localhost:5432`. | O `DATABASE_URL` era do tipo **`prisma+postgres://`**, gerado pelo `prisma init` (servidor local do Prisma). O `api_key` em Base64 embute `postgres://...:51214`. | Trocar por URL normal `postgresql://usuario:senha@localhost:PORTA/banco`, com a senha codificada (`+` → `%2B`). | **A IA errou na primeira hipótese** (variável de ambiente do Windows ou `shadowDatabaseUrl`). A causa real só apareceu quando o grupo colou o `.env`. |
| `P1000: Authentication failed` para o usuário `estoque`. | Causas prováveis: volume `pgdata` criado com credenciais antigas (o Postgres só lê usuário e senha na primeira criação) e/ou outro PostgreSQL na porta 5432. | `docker compose down -v`, alinhar usuário, senha, banco e **porta** (51214) entre o `.env` da raiz e o `back/.env`, e subir de novo. | Hipótese da IA; o banco estava vazio, então apagar o volume não perdia dados. |
| `npm error Missing script: "dev"`. | Os scripts sugeridos não estavam no `package.json`. | `npm pkg set` para `type=module` e scripts `dev`, `start`, `typecheck`, `migrate`, `generate`. | A IA mostrou os scripts como trecho; faltou deixar claro que era preciso aplicá-los. |
| `ROTA_NAO_ENCONTRADA` em `/api/v1` e em `/pedidos-entrada/1/receber`. | `/api/v1` sozinho não tem rota; `/receber` só existe como `POST`, e a chamada usava outro método ou omitia o prefixo `/api/v1`. | Usar `POST http://localhost:3000/api/v1/pedidos-entrada/1/receber` com body JSON. | O código de erro `ROTA_NAO_ENCONTRADA` (diferente de `NAO_ENCONTRADO`) ajudou a localizar a causa. |
| `.env` do `back` com valores de exemplo (usuário `postgres`, porta 5432) diferentes do `.env` da raiz. | Valores do `.env.example` não editados. | Alinhar os dois `.env` e padronizar os `.env.example` com valores fictícios. | A IA percebeu a divergência ao comparar os dois arquivos colados. |
| Ajuste de porta da API (zip usava 3333; `.env` do grupo usa 3000). | Valor de exemplo diferente. | `base_url` do Thunder Client apontando para a porta do `PORT` real. | — |

## 5. Postura crítica: onde a IA errou ou precisou de correção

- **Hipótese incorreta no erro P1001.** A IA sugeriu duas causas que não eram a real. A causa (URL `prisma+postgres://` do `prisma init`) foi encontrada ao analisar o `.env` completo enviado pelo grupo. Lição: enviar a mensagem de erro **e** o arquivo de configuração envolvido.
- **Afirmação corrigida sobre o `prisma7.config.ts`.** A IA disse que o arquivo não seria lido por causa do nome; a saída do Prisma (`Loaded Prisma config from prisma7.config.ts`) mostrou que era carregado. A IA reconheceu e corrigiu.
- **Código não executado pela IA.** Tudo o que foi gerado só foi validado em sintaxe; erros de tipo e de execução só aparecem rodando. Por isso o roteiro de testes (3.7) é o critério de aceitação.
- **Instruções incompletas.** Scripts do `package.json` e `tsconfig.json` foram entregues sem ficar claro que precisavam ser aplicados à mão, gerando o erro `Missing script: "dev"`.
- **Decisões que continuam sendo do grupo:** escopo (um único diferencial), estoque de local único e o que ficou de fora do MVP.

## 6. Pendências e próximos passos

- [ ] Seed para a demonstração (produtos, fornecedores com prazos diferentes e ~30 dias de saídas, para a tela "O que comprar hoje" não aparecer vazia).
- [ ] Frontend (ordem planejada: saída rápida, listagem com semáforo, "O que comprar hoje", cadastros e recebimento).
- [ ] README com a sequência para rodar do zero (copiar os dois `.env.example`, `docker compose up -d`, migrate, seed, `npm run dev`).
- [ ] Exportar a coleção do Thunder Client para `docs/`.
- [ ] Prints do Kanban em `docs/kanban-prints/` `[PREENCHER]`.
- [ ] Sem autenticação no MVP (a análise cita "usuário" na movimentação, que não existe no schema atual).
- [ ] Sem testes automatizados; a validação atual é manual.
