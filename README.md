# Salge 3D ERP

ERP local para a operação da Salge 3D, construído com Next.js e SQLite.

## Módulos

- Dashboard com faturamento, lucro, margem, pendências e alertas de estoque.
- Orçamentos com validade, PDF, aprovação e conversão para produção.
- Produção em Kanban, planejamento por impressora e registro de falhas.
- Prioridade e ordem manual da fila, com distribuição automática dos pedidos sem impressora.
- Planejamento que respeita bloqueios de máquina e intervalos de preparação entre impressões.
- Custos estimados e consumo real de filamentos e insumos.
- Histórico de movimentações com baixa e estorno automáticos.
- Clientes, filamentos, insumos e equipamentos.
- Contas a receber, pagamentos parciais, despesas e fluxo de capital.
- Detalhe do pedido com arquivos reais de produção, versionamento e histórico de alterações.
- Checklists reutilizáveis de produção e qualidade por produto.
- Comparação automática entre custos, tempo e materiais previstos e realizados.
- Perfil versionado de impressão por produto, com impressora, bico, camada e capacidade por placa.
- Versão técnica fixada no pedido, com histórico restaurável sem alterar vendas antigas.
- Geração automática de lotes/placas e indicadores reais de desempenho do produto.
- Portal do cliente limitado a dados comerciais e logísticos, sem expor gramagem ou insumos internos.
- PDF comercial separado da ordem interna de produção com materiais, arquivos e checklist.
- Backup SQLite e exportação CSV.
- Parcelas com vencimentos individuais, caixa versus competência e despesas pendentes.
- Controle de rolos/lotes de filamento, perdas e consumo FIFO por pedido.
- Restauração validada de backup e trilha de auditoria.
- Importação validada da planilha Salge 3D, com prévia, backup e reconciliação de saldos.
- Controle fiscal do MEI com vendas, serviços, receitas externas, DAS, relatório mensal e DASN.
- WhatsApp Cloud API opcional com templates aprovados, webhook assinado e estados de entrega/leitura.
- Backup externo opcional para pasta sincronizada, com conferência SHA-256.
- Diagnóstico de segurança e prontidão para uma implantação em rede.

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

## Integrações e hospedagem

Abra **Configurações → Integrações e hospedagem** para verificar cada requisito. Os segredos ficam somente em `.env.local` ou nas variáveis protegidas do servidor.

```dotenv
APP_URL=https://seu-dominio.com
AUTH_COOKIE_SECURE=true
BACKUP_EXTERNAL_DIR=D:\OneDrive\Salge3D\Backups

WHATSAPP_GRAPH_VERSION=vXX.X
WHATSAPP_TEST_MODE=true
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
META_APP_SECRET=
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_TEMPLATE_ORCAMENTO=salge_orcamento
WHATSAPP_TEMPLATE_FOLLOWUP=salge_followup
WHATSAPP_TEMPLATE_COBRANCA=salge_cobranca
WHATSAPP_TEMPLATE_PRODUCAO=salge_producao
WHATSAPP_TEMPLATE_PRONTO=salge_pronto
WHATSAPP_TEMPLATE_POS_VENDA=salge_pos_venda
```

Cada template do WhatsApp deve ser aprovado na Meta e conter uma variável de corpo (`{{1}}`), preenchida com a mensagem revisada no ERP. Configure o webhook público em `https://seu-dominio.com/api/webhooks/whatsapp`.

Durante a homologação com o número de teste da Meta, mantenha `WHATSAPP_TEST_MODE=true`. Nesse modo o ERP envia o template padrão `hello_world` em `en_US`, sem o texto editado. Depois de cadastrar o número real e aprovar os seis templates, remova a variável (ou use `false`) para liberar as mensagens personalizadas.

O SQLite atende vários usuários conectados à mesma instância do Salge 3D, mas a hospedagem deve manter **uma única instância do servidor** e um **disco persistente**. Antes de escalar horizontalmente, migre o banco para PostgreSQL.

## Fiscal e MEI

Abra **Financeiro → Fiscal e MEI**. Os recebimentos registrados no ERP entram automaticamente no relatório; receitas do mesmo CNPJ que ocorrerem fora do ERP, como trabalho PJ, devem ser lançadas em **Receita fora do ERP**. A tela separa vendas de serviços, acompanha o limite anual configurável e exporta CSV.

O módulo é gerencial: pagamento do DAS, emissão de notas e entrega da DASN-SIMEI continuam nos portais oficiais.

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
