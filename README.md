# Salge 3D ERP

ERP local para a operação da Salge 3D, construído com Next.js e SQLite.

## Módulos

- Dashboard com faturamento, lucro, margem, pendências e alertas de estoque.
- Orçamentos com validade, PDF, aprovação e conversão para produção.
- Produção em Kanban, planejamento por impressora e registro de falhas.
- Custos estimados e consumo real de filamentos e insumos.
- Histórico de movimentações com baixa e estorno automáticos.
- Clientes, filamentos, insumos e equipamentos.
- Contas a receber, pagamentos parciais, despesas e fluxo de capital.
- Detalhe do pedido com arquivos por link e histórico de alterações.
- Backup SQLite e exportação CSV.

## Instalação

```bash
npm install
npm run db:init
npm run db:seed # opcional: dados de demonstração
npm run dev
```

Abra `http://localhost:3000`.

## Atualização de uma instalação existente

As migrações também são aplicadas automaticamente quando o ERP abre, mas é recomendado executá-las explicitamente após atualizar o código:

```bash
npm install
npm run db:migrate
npm test
npm run lint
npm run typecheck
npm run build
```

O comando `db:migrate` preserva os registros existentes. Não use `db:reset` em um banco com dados reais.

## Banco de dados

O arquivo local fica em `database/salge3d.sqlite` e não deve ser versionado. Antes de atualizações importantes, use **Configurações → Backup completo**.

Comandos disponíveis:

```bash
npm run db:init      # cria o banco se necessário
npm run db:migrate   # aplica migrações pendentes
npm run db:seed      # insere dados de demonstração sem duplicar cadastros
npm run db:clear     # limpa dados operacionais conforme o script
npm run db:reset     # apaga e recria o banco (destrutivo)
```

## Validação

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
