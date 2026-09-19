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
- Parcelas com vencimentos individuais, caixa versus competência e despesas pendentes.
- Controle de rolos/lotes de filamento, perdas e consumo FIFO por pedido.
- Restauração validada de backup e trilha de auditoria.
- Importação validada da planilha Salge 3D, com prévia, backup e reconciliação de saldos.

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
npm run db:restore -- "C:\\caminho\\backup.sqlite" # restaura com validação e cópia de segurança
```

Para restaurar, pare o `npm run dev`. O comando valida a integridade do arquivo,
preserva automaticamente o banco atual em `database/backups/` e aplica as migrações pendentes.

## Importar a planilha

Abra **Configurações → Importar planilha**, selecione o arquivo `.xlsx`, revise a prévia e confirme. O ERP:

- valida abas, cabeçalhos, IDs, referências, datas, valores e saldos;
- bloqueia o mesmo arquivo e IDs externos já importados;
- exige confirmação para mesclar com uma base que já contém dados;
- cria um backup automático e grava tudo em uma única transação;
- preserva o XLSX original e vincula cada linha ao registro criado.

O mapeamento completo e as regras de reconciliação estão em [`docs/importacao-planilha.md`](docs/importacao-planilha.md).

## Validação

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
