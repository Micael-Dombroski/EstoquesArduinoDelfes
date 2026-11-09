# DOCUMENTAÇÃO DE USO DE IA

**Projeto:** Sistema de Controle de Estoque e Reposição Inteligente  
**Disciplina:** Laboratório de Programação II (Prof. Willen Leolatto Carneiro) — UNIFACVEST  
**Integrantes:** **Micael** e **Kevin**  
**IAs utilizadas:** Claude (Anthropic) e Antigravity (Google DeepMind)  
**Repositório:** [https://github.com/Micael-Dombroski/EstoquesArduinoDelfes](https://github.com/Micael-Dombroski/EstoquesArduinoDelfes)

---

## 1. Como a IA foi utilizada

A Inteligência Artificial atuou como **assistente de engenharia de software e pair programmer** ao longo de todo o ciclo de desenvolvimento, apoiando em cinco frentes principais:

1. **Análise de requisitos e modelagem de domínio:** crítica ao levantamento inicial de entidades feito pelo grupo a partir da operação real de estoque (inspirada no fluxo do sistema Symprod) e definição do diferencial de reposição inteligente.
2. **Infraestrutura e banco de dados:** configuração do PostgreSQL 16 via Docker Compose, variáveis de ambiente (`.env`), migrações com Prisma 7 e implementação de regras de integridade no PostgreSQL (`extras.sql` com triggers, `CHECK` constraints, índices parciais/GIN/BRIN e views).
3. **Arquitetura e implementação do Backend (API REST):** estruturação modular em camadas (`routes` → `controller` → `service` → `schemas`) com Node.js 22+, Express 5, TypeScript, validação com `zod` e transações atômicas via `prisma.$transaction`.
4. **Desenvolvimento do Frontend (Next.js App Router):** construção das interfaces operacionais em React/Next.js com Tailwind CSS, `shadcn/ui` e `@tanstack/react-query`, incluindo suporte a tema claro/escuro, filtros avançados e feedback imediato.
5. **Evolução de regras de negócio complexas e fluxo Git:** implementação de controle de acesso baseado em perfis (RBAC), recebimento em duas etapas (Ordem de Compra + Nota Fiscal), separação detalhada de materiais com classificação de faltantes, unificação de telas, resolução de conflitos de merge e organização de commits semânticos.

O grupo atuou rigorosamente como **revisor crítico (*code reviewer*)**: nenhuma sugestão ou código gerado foi aceito sem leitura linha a linha, compilação (`tsc --noEmit` / `eslint`), execução local e validação contra as diretrizes da disciplina.

---

## 2. Critérios de aceitação do código gerado

Um trecho de código gerado pela IA só ingressou no repositório após atender a **todos** os critérios abaixo:

1. **Execução local reproduzível:** sobe integralmente com `docker compose up -d`, `npx prisma migrate deploy`, `npm run seed` e `npm run dev`.
2. **Conformidade estrita de versões:** Node.js entre `22.x` e `24.x` e PostgreSQL entre `15` e `16` (`postgres:16-alpine`).
3. **Segurança e sigilo de credenciais:** senhas e URLs de banco ficam exclusivamente em arquivos `.env` ignorados pelo Git; apenas `.env.example` com valores fictícios são versionados.
4. **Integridade garantida pelo banco de dados:** chaves estrangeiras (`RESTRICT`), `CHECK (saldo_atual >= 0)`, imutabilidade do livro-razão (`movimentacoes`) e atualização de saldo exclusivamente via trigger no PostgreSQL.
5. **A API nunca sobrescreve o saldo diretamente:** `saldoAtual` e `saldoApos` são calculados pelo banco; tentativas de enviá-los no payload retornam `400 VALIDATION_ERROR`.
6. **Separação de responsabilidades:** divisão clara entre `routes`, `controller`, `service` e `schemas` no backend, e isolamento por domínio em `src/features/` no frontend.
7. **Tratamento padronizado de erros:** respostas consistentes (`error.code`, `error.message`, `error.details`) com status HTTP semânticos (`400`, `401`, `403`, `404`, `409`, `422`).
8. **Compreensão total pela equipe:** nenhum trecho foi mantido sem que ambos os integrantes soubessem explicar seu funcionamento para a arguição final.
9. **Versionamento limpo:** uso de Conventional Commits (`feat`, `fix`, `docs`, `chore`, `build`) refletindo a evolução real do software.

---

## 3. Registro das interações por funcionalidade

Abaixo estão documentadas as interações com a IA seguindo o modelo exigido pelas diretrizes da disciplina.

### 3.1 Configuração do ambiente: Docker Compose, `.env` e `nodemon`

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Provisionar o PostgreSQL 16 via Docker Compose com persistência, isolar credenciais em `.env` e configurar o `nodemon` para desenvolvimento local no backend. | `"como defino no docker-compose o uso do postgres? o password eu guardo no .env ou não precisa?"`<br><br>`"como fazer isso no node.js? nodemon deve ser configurado para facilitar o desenvolvimento local"`<br><br>`"crie o .env para uso do postgres no docker"` | Na primeira tentativa, o mapeamento de portas no `docker-compose.yml` estava invertido (`51214:51214` em vez de `${POSTGRES_PORT:-51214}:5432`), impedindo a conexão externa. Além disso, o volume `pgdata` havia sido inicializado com credenciais antigas, gerando erro `P1000: Authentication failed`. Foi necessário executar `docker compose down -v`, alinhar `.env` da raiz e `back/.env` e recriar o container até ficar `healthy`. | Uso da imagem `postgres:16-alpine` (dentro da faixa 15–16 exigida), volume nomeado `pgdata` e `healthcheck` com `pg_isready`. O `nodemon` foi instalado como `devDependency` executando `tsx src/server.ts`, garantindo recarregamento automático sem depender de pacotes globais. |

### 3.2 Levantamento de requisitos e modelagem do domínio (`schema.prisma`)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Transformar o esboço inicial de entidades (baseado na rotina com o sistema Symprod) em um modelo relacional robusto e definir o diferencial do projeto. | `"Atue como um Engenheiro de Software Sênior e expert em user experience. Qual sua opinião? o sistema usado no estoque é o symprod, fiz um levantamento de entidades que devem ter no sistema e anexei um trabalho com requisitos? acha que fica bom usar isso? qual diferencial você colocaria no projeto que pode auxiliar no dia a dia usando esse projeto?"`<br><br>`"Você é um expert em prisma e banco de dados postgres, monte os schemas para as tabelas do projeto, tendo em vista os relacionamentos e especificações idealizadas anteriormente..."` | O `npm run migrate` inicial falhou com erro `P1012` porque o projeto instalou o **Prisma 7**, que mudou a configuração do datasource para `prisma.config.ts` e passou a exigir o driver adapter `@prisma/adapter-pg`, enquanto a IA havia gerado a sintaxe do Prisma 6. O grupo optou por manter o Prisma 7 e adaptar `prisma.config.ts` e `src/lib/prisma.ts`. Também foi esclarecido que o campo `"$ mín"` do rascunho manuscrito representava o `valorMinimoPedido` do fornecedor. | • **Saldo derivado de movimentações:** `saldo_atual` não é editado manualmente, garantindo trilha de auditoria.<br>• **Relação N:N `ProdutoFornecedor`:** prazo de entrega (`prazoEntregaDias`) e preço unitário pertencem ao vínculo produto-fornecedor.<br>• **Diferencial definido:** Reposição Inteligente (*"O que comprar hoje"*), cruzando consumo médio dos últimos 30 dias com o lead time do fornecedor. |

### 3.3 Regras de integridade no PostgreSQL (`extras.sql`: Triggers, Views e Índices)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Garantir que o saldo nunca fique negativo mesmo em retiradas simultâneas, bloquear edição do histórico de movimentações e criar as consultas de semáforo e reposição inteligente. | `"monte os triggers, checks, indices e views em SQL para garantir que o saldo nunca fique negativo, que movimentações sejam imutáveis (apenas estorno) e crie a view de sugestão de reposição"` | Como o `schema.prisma` não modela triggers, `CHECK` constraints nem views, a aplicação direta via `prisma migrate dev` sobrescrevia ou ignorava esses objetos. A solução foi isolar todo o SQL avançado em `back/prisma/migrations/20260413200926_extras/migration.sql` (e manter `back/prisma/extras.sql` como referência documentada). | • **Trigger `BEFORE INSERT` em `movimentacoes`:** executa `UPDATE produtos SET saldo_atual = saldo_atual + NEW.variacao`, travando a linha (`row-level lock`) e preenchendo `saldo_apos`.<br>• **Imutabilidade:** trigger que bloqueia `UPDATE` e `DELETE` em `movimentacoes`.<br>• **Views `vw_estoque_situacao` e `vw_sugestao_reposicao`:** concentram a matemática de consumo médio diário e ponto de reposição sugerido diretamente no banco.<br>• **Índices:** GIN trigram para busca textual rápida, BRIN para data de movimento e índice único parcial para fornecedor preferencial. |

### 3.4 Arquitetura da API REST, TypeScript e Módulos do Backend

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Definir os contratos da API REST, tratamento centralizado de erros, validação de entrada e implementar os módulos do backend em TypeScript com Express 5. | `"Você é um arquiteto de soluções, defina como as chamadas de API devem ocorrer, e monte a estrutura das chamadas, o projeto usa node.js com cors e express, e prisma."`<br><br>`"acha que precisa mudar mais alguma coisa? o arquivo em anexo permite usar ts para a api ou tem que ser js?"`<br><br>`"no app.ts você deixou // ... demais routers, quais routers seriam? crie a middleware e os arquivos necessários"` | No Express 5, `req.query` tornou-se uma propriedade *getter* somente leitura, o que causava erro ao tentar sobrescrevê-la no middleware de validação do `zod`. O middleware `validate.ts` foi refinado para gravar os dados validados e tipados em `res.locals.valid`. Também foi ajustada a ordenação dos itens por `produtoId` dentro de `prisma.$transaction` antes de inserir movimentações. | • **TypeScript + Express 5:** captura nativa de rejeições assíncronas pelo `errorHandler` central.<br>• **Ações de domínio explícitas:** rotas semânticas (`/:id/enviar`, `/:id/receber`, `/:id/cancelar`, `/:id/estornar`) em vez de `PATCH` genérico de status.<br>• **Prevenção de Deadlock:** ordenação determinística de itens por `produtoId` nas transações.<br>• **Precisão numérica:** valores `Decimal` serializados como `string` na API para evitar erros de ponto flutuante IEEE 754. |

### 3.5 Arquitetura do Frontend (Next.js App Router + TanStack Query)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Construir a interface web focada em agilidade operacional para o almoxarifado (Retirada de material com leitor de código de barras, Reposição do dia e Catálogo de produtos). | `"Crie a interface com node.js e Next.js App Router para o estoque com foco em agilidade de almoxarifado..."`<br><br>`"Tratar os retornos da API em português e permitir Desfazer movimentação com Toast."` | O Next.js iniciava por padrão na porta `3000`, conflitando com o backend Express. Ajustamos o script `dev` do `web/package.json` para rodar na porta `3001` e configuramos `rewrites` no `next.config.ts` redirecionando `/api/*` para `http://localhost:3000/api/*`, eliminando erros de CORS. No tratamento do erro `422 SALDO_INSUFICIENTE`, refinamos a tela de saída para destacar em vermelho apenas os itens que excederam o estoque, preservando o carrinho preenchido. | • **Next.js App Router + TanStack Query:** invalidação automática de cache (`produtos`, `reposicao`, `pedidos-saida`) após cada mutação.<br>• **UX à prova de erros:** notificações via `sonner` com botão de ação imediata **"Desfazer"**, que aciona o cancelamento/estorno transacional.<br>• **Padronização de respostas:** helper `unwrapList` e mapeamento de erros em `web/src/lib/errors.ts`. |

### 3.6 Histórico de Saídas com Filtros e Paginação

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Exibir na tela de retiradas um histórico paginado (20, 50 ou 100 itens) com filtros por período (máximo 1 ano), produto e requisitante, permitindo estornar retiradas. | `"Você é um expert em desenvolvimento front end com muita experiência em UX, baseado no diretório web que você gerou, quero que, além da tela que permita eu retirar os materiais, quero que seja exibido também um histórico com filtros: período, produto e funcionário. Por padrão ele vai exibir 20 itens por página, mas é possível aumentar para 50 ou 100, o período filtrado não pode possuir intervalo maior que um ano..."` | Inicialmente a listagem mostrava apenas o cabeçalho da retirada. O grupo solicitou refinamento para exibir os itens detalhados com suas quantidades e botão de desfazer diretamente em cada registro do histórico, além de validar o limite de 365 dias antes de disparar a requisição. | • Validação de intervalo máximo de 1 ano tanto no frontend (com alerta visual imediato) quanto na query da API.<br>• Paginação server-side integrada ao `keepPreviousData` do TanStack Query para transições suaves de página. |

### 3.7 Tema Claro/Escuro (Dark/Light Mode)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Implementar alternância entre modo claro e escuro em todo o sistema e corrigir cartões que permaneciam brancos no histórico de saídas. | `"adicione a opção de modo claro e escuro no sistema"`<br><br>`"no modo escuro a parte de historico de saidas ficou branca"` | Na primeira versão do tema escuro, o componente `historico.tsx` continha classes utilitárias fixas (`bg-white`, `bg-slate-50`, `text-slate-900`) que ignoravam o seletor `.dark`. Foi feita uma varredura substituindo cores estáticas por tokens semânticos (`bg-card`, `bg-muted/40`, `text-foreground`, `border-border`) e variantes `dark:`. | • Criação do `ThemeProvider` (`web/src/components/theme-provider.tsx`) sincronizado com `localStorage` (`estoque:tema`) e classe `.dark` no elemento `<html>`.<br>• Botão alternador persistente na barra lateral (`nav.tsx`) com suporte completo em todas as telas e modais. |

### 3.8 Autenticação, Sessão e Controle de Acesso por Perfil (RBAC)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Criar sistema de login com 4 níveis de permissão (`SOLICITANTE`, `ALMOXARIFADO`, `COMPRAS`, `SUPERVISOR`) e fluxo de aprovação de solicitações de compra. | `"adicione um sistema de login com 4 niveis de permissão: solicitante, almoxarifado, compras e supervisor, onde a sugestão de compra do almoxarifado vai para aprovação de compras ou supervisor"` | Foi necessário criar a tabela `usuarios` e o enum `PerfilUsuario` no Prisma, além de adicionar o status `SOLICITADO` no ciclo de vida de `PedidoEntrada` e a relação com `solicitanteUsuarioId`. Na revisão da barra lateral, adicionamos troca rápida de perfil / logout e badges indicando pendências por perfil. | • **RBAC em duas camadas:** proteção visual e de rotas no `AppLayout` (`web/src/app/(app)/layout.tsx`) combinada com verificação de perfil nos endpoints do backend.<br>• **Segregação de funções:** o `ALMOXARIFADO` gera solicitações de reposição (`SOLICITADO`), mas apenas `COMPRAS` ou `SUPERVISOR` podem aprovar e emitir a Ordem de Compra (`ENVIADO`). |

### 3.9 Recebimento de Materiais em 2 Etapas (Conferência por OC + Nota Fiscal)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Criar tela de recebimento vinculada à Ordem de Compra (OC) suportando entregas parciais, onde o saldo só entra no estoque após a conferência física do Almoxarifado **e** o lançamento da Nota Fiscal pelo setor de Compras. | `"crie uma tela de recebimento de materiais por OC (permitindo chegada parcial com checkbox e quantidade editavel), onde os itens só entram no estoque após o almoxarifado confirmar o recebimento fisico e o setor de compras lançar a NF"` | Para suportar múltiplos recebimentos parciais de uma mesma OC sem incrementar o estoque precocemente, não bastava usar a coluna `quantidadeRecebida` diretamente na primeira etapa. Criamos as tabelas `recebimentos_entrada` e `itens_recebimento_entrada` com duas etapas independentes (`conferidoPorId`/`dataConferencia` e `nfLancadaPorId`/`numeroNf`/`dataLancamentoNf`). | • **Dupla custódia antes da entrada no estoque:** o lote de recebimento fica `PENDENTE` até que **ambas** as etapas (Conferência Física pelo `ALMOXARIFADO` e Nota Fiscal por `COMPRAS`/`SUPERVISOR`) sejam concluídas, em qualquer ordem.<br>• **Geração atômica de movimentação:** somente quando a segunda etapa do lote é confirmada o serviço chama `efetivarEntradaEstoqueNoBanco`, gerando as linhas em `movimentacoes` (que acionam a trigger de saldo) e atualizando o status do pedido para `RECEBIDO_PARCIAL` ou `RECEBIDO`. |

### 3.10 Resolução de Conflitos Git, Gestão de Fornecedores e Unificação de Pedidos/OC

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Resolver conflitos de merge da branch de fornecedores/acompanhamento, corrigir desalinhamento nos filtros avançados, adicionar filtro de pedidos atrasados e unificar `/compras` e `/pedidos` em uma única tela. | `"resolva os conflitos de merge..."`<br><br>`"unifique a tela de solicitações de compra e acompanhamento de pedidos em uma só"`<br><br>`"no filtro avançado as caixas de texto estão desalinhadas, e adicione a funcionalidade de filtrar os pedidos atrasados"`<br><br>`"essa junção das duas telas se encaixa como feat?"` | Ao mesclar a branch do colega (que trazia `acompanhamento`, `cadastro-fornecedor` e `gestao-fornecedor`), faltava a função `fmtMoeda` em `web/src/lib/format.ts` e o enum `StatusPedidoEntrada` não incluía `SOLICITADO` em `tipos.ts`. Além disso, nos filtros avançados de `/pedidos`, o rótulo `"Entrega prevista ou realizada entre"` quebrava em duas linhas empurrando os inputs de data para baixo; corrigimos usando `mt-auto` nos grupos de inputs dentro do grid CSS. | • **Tela unificada `/pedidos` (`acompanhamento.tsx`):** reúne solicitações aguardando revisão (com botões de *Aprovar e emitir OC* ou *Rejeitar* para `COMPRAS`/`SUPERVISOR`), ordens em andamento e atalho para Recebimento (OC/NF). A rota antiga `/compras` redireciona automaticamente para `/pedidos`.<br>• **Filtro de atrasados (`atrasados=true`):** filtra no backend pedidos com status `ENVIADO` ou `RECEBIDO_PARCIAL` cuja `previsaoEntrega < CURRENT_DATE`.<br>• **Classificação de commit:** orientado o uso de `feat(pedidos)` por entregar nova experiência funcional unificada e filtro inédito. |

### 3.11 Restrição do Perfil Solicitante e Fluxo de Separação Detalhada no Almoxarifado

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Restringir o perfil `SOLICITANTE` apenas às telas de Produtos e Retirada de material (enviando lista com destinatário), e permitir que o `ALMOXARIFADO`/`SUPERVISOR` registre a separação detalhada item a item (marcando itens separados, itens faltantes e se necessitam compra ou já estão a caminho) antes de dar baixa no estoque. | `"o usuario solicitante não deve ter acesso a tela de pedidos e OC, apenas a tela de produtos e o preenchimento de uma lista de materiais para a retirada informando o destinatario desse material, que sera enviada para o funcionario do amoxarifado e para o usuario supervisor (onde esses usuarios teriam o registro e poderiam dar baixa desses itens no estoque)"`<br><br>`"no usuario do almoxarifado gostaria dessa lista que o solicitante envia, tenha mais detalhes na hora da separação, sendo possivel o funcionario do almoxarifado informar quais itens foram separados quais itens estão faltando para envio (e se esses itens faltantes seram necessarios a compra ou já estão a caminho)"` | Na primeira versão, qualquer retirada já abatia o estoque imediatamente. Com a mudança de requisito, criamos o status `PENDENTE` em `PedidoSaida` e adicionamos nas linhas de `itens_pedido_saida` os campos `separado`, `quantidade_separada` e `situacao_faltante` (`NECESSITA_COMPRA` \| `A_CAMINHO`). Durante a verificação com ESLint v9 (`react-hooks/set-state-in-effect`), refatoramos o estado do painel de separação em `historico.tsx` para inicializar via *lazy state* ao abrir o card, evitando `setState` dentro de `useEffect`. | • **Solicitação sem baixa precoce:** quando o `SOLICITANTE` envia uma lista de retirada, o pedido nasce como `PENDENTE` sem gerar linhas em `movimentacoes`.<br>• **Painel interativo de separação (`historico.tsx` + `PATCH /pedidos-saida/:id/separacao`):** o almoxarife marca o que separou fisicamente, ajusta a quantidade disponível e classifica o motivo da falta (`Precisa comprar` ou `Já a caminho (OC)`), com cálculo automático de sugestões baseado no saldo atual e nas OCs ativas.<br>• **Baixa efetiva (`POST /pedidos-saida/:id/baixar`):** atualiza as quantidades do pedido para o que foi efetivamente separado e executa a baixa transacional no estoque apenas dos itens entregues. |

### 3.12 Gestão de Usuários (CRUD exclusivo do Supervisor)

| Problema / Requisito | Prompts Utilizados | Refinamento (Iterações) | Decisão de Engenharia |
|---|---|---|---|
| Criar uma tela completa de gerenciamento de usuários (CRUD) acessível exclusivamente pelo perfil `SUPERVISOR`, seguindo boas práticas de Next.js e segurança de regras de negócio. | `"pensando como um expert em next.js faça para o usuario supervisor uma tela CRUD de usuarios"`<br><br>`"esse primeiro topico destacado em azul"` / `"opção 1 e 3 (deixar o ambar)"` (ajuste visual na navegação lateral para remover o destaque azul fixo de *Retirar material* e padronizar o badge em âmbar). | Implementamos o módulo `/api/v1/usuarios` no backend e a feature `gestao-usuarios.tsx` no frontend. Para evitar que o sistema ficasse trancado sem administradores, adicionamos travas de segurança no `usuarios.service.ts` impedindo que o supervisor desative a própria conta ou rebaixe/desative o último usuário com perfil `SUPERVISOR` ativo. | • **Proteção de integridade administrativa:** validação transacional que garante a existência de pelo menos 1 `SUPERVISOR` ativo em qualquer operação de edição ou ativação/desativação (`422 ULTIMO_SUPERVISOR` e `422 AUTO_DESATIVACAO_BLOQUEADA`).<br>• **Interface reativa:** cards de métricas por perfil, busca com *debounce*, filtro por nível de acesso e status, modal único para criação/edição e sincronização imediata com a sessão caso o supervisor atualize o próprio nome/e-mail. |

---

## 4. Problemas técnicos encontrados e soluções adotadas

| Sintoma / Erro | Causa Raiz | Solução Aplicada | Aprendizado / Revisão sobre a IA |
|---|---|---|---|
| `P1012` ao rodar `prisma migrate` na configuração inicial. | O projeto instalou o Prisma 7, que removeu `url = env("DATABASE_URL")` do `schema.prisma` em favor do `prisma.config.ts` e adapter `pg`. | Configuração do `prisma.config.ts` e instanciação do `PrismaPg` em `back/src/lib/prisma.ts`. | A IA inicialmente gerou sintaxe do Prisma 6 por ser o padrão mais comum no treinamento; a leitura do log real permitiu migrar para a arquitetura do Prisma 7. |
| `P1001: Can't reach database server` / `P1000: Authentication failed`. | Porta do container mapeada como `51214:51214` (em vez de `:5432`) e volume Docker antigo com senha divergente. | Ajuste do `docker-compose.yml` para `${POSTGRES_PORT:-51214}:5432`, recriação do volume (`docker compose down -v`) e alinhamento dos arquivos `.env`. | A primeira hipótese da IA não identificou a URL `prisma+postgres://`; colar o `.env` completo foi essencial para o diagnóstico exato. |
| Erro ao atribuir `req.query = ...` no middleware de validação. | No Express 5, `req.query` passou a ser apenas um *getter* imutável. | Armazenamento do payload validado pelo `zod` em `res.locals.valid` (`validate.ts`). | Demonstra a importância de testar a execução real em Node 22 + Express 5 em vez de confiar apenas na análise estática. |
| Erro de compilação em `acompanhamento.tsx` após merge Git (`fmtMoeda` e `StatusEntrada`). | Conflito semântico entre branches: a tela de acompanhamento importava `fmtMoeda` ainda não existente em `format.ts` e desconhecia o status `SOLICITADO`. | Adição de `fmtMoeda` em `web/src/lib/format.ts` e unificação da tipagem com `StatusPedidoEntrada` em `web/src/features/entradas/tipos.ts`. | Revisão manual pós-merge seguida de `tsc --noEmit` em ambos os projetos (`back` e `web`). |
| Avisos do ESLint v9 (`react-hooks/set-state-in-effect`) em `acompanhamento.tsx` e `historico.tsx`. | Uso de `useEffect` para sincronizar estado de paginação e rascunho de separação a partir de props/dados assíncronos. | Substituição por cálculo derivado (`paginaEfetiva`) e inicialização preguiçosa (*lazy state initializer*) no evento de abertura do painel. | As regras do React 19 / Next 16 no ESLint exigem evitar efeitos colaterais de renderização cascata; o código ficou mais limpo e previsível. |

---

## 5. Postura crítica: onde a IA precisou de intervenção humana

1. **Adaptação à realidade operacional do almoxarifado:** A primeira versão sugerida pela IA tratava toda entrada e toda saída como eventos de um único passo. Foi a análise crítica do grupo sobre o processo físico real que levou à criação:
   - Do **Recebimento em 2 Etapas (OC + NF)**, separando a conferência física do almoxarife do lançamento fiscal de Compras;
   - Do **Fluxo de Separação de Retiradas**, permitindo ao almoxarife informar exatamente quanto conseguiu separar de cada item e classificar o que faltou (`NECESSITA_COMPRA` ou `A_CAMINHO`) antes de dar baixa no estoque.
2. **Alinhamento ao ecossistema Prisma 7 + Express 5 + React 19:** Em diversos momentos a IA recorreu a padrões de versões anteriores (como `url` dentro do `schema.prisma`, mutação de `req.query` no Express 4 ou `setState` dentro de `useEffect`). A execução rigorosa de `npm run typecheck` e `eslint` pelo grupo identificou e corrigiu todos esses pontos antes dos commits.
3. **Consistência visual e UX:** Detalhes de interface como cartões claros vazando no modo escuro, desalinhamento vertical de inputs quando um label quebrava linha no filtro avançado e excesso de destaque azul na barra de navegação foram identificados visualmente pelo grupo durante os testes manuais e refinados iterativamente.
