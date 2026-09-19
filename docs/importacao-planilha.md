# Política de importação da planilha

## Mapeamento das abas

| Aba | Destino no ERP |
| --- | --- |
| Painel | Indicadores recalculados pelo ERP; conteúdo mantido no arquivo original |
| Recebimentos | Recebimentos e alocações de parcelas |
| Vendas | Pedidos, itens, parcelas e histórico |
| Gastos | Despesas ou retiradas de capital, conforme a descrição |
| Clientes | Clientes; totais derivados são recalculados |
| Estoque | Produtos, lotes de filamento e movimentos de estoque |
| Calculadora | Premissas de preço; cenário atual mantido no arquivo original |
| Configurações | Configurações do negócio e de precificação |
| Aportes e retiradas | Fluxo de capital |
| Como usar | Conteúdo mantido no arquivo original |
| Materiais | Insumos, itens de pedido e movimentos de estoque |

## Cobertura dos campos

- Os campos operacionais são normalizados nas tabelas do ERP.
- IDs da planilha são gravados como códigos externos únicos, impedindo duplicação em uma segunda importação.
- Até quatro filamentos e quatro materiais por venda são suportados.
- Dados de lote, fornecedor, compra, custo, quantidade, saldo, status e observações são preservados.
- Totais de clientes, painel, contas a receber e estoque são derivados das transações importadas.
- Datas, status, tipo, categoria, quantidade, preços, descontos, fretes, taxas, canal, custos e observações dos pedidos são preservados.
- Competência, vencimento, pagamento, fornecedor, tipo, forma de pagamento, vínculo com venda e observações de gastos são preservados.
- As premissas da aba Configurações são armazenadas, incluindo fatores B2C/B2B, perdas, taxa de venda, valor da hora, reserva da máquina e pedido mínimo B2B.
- O arquivo XLSX original é armazenado na base local como parte da importação. Cada linha operacional também é arquivada em JSON e vinculada ao registro criado.

## Reconciliação

- Recebimentos são comparados com o valor recebido informado em cada venda.
- Pagamentos acima do valor cobrado são preservados como crédito não alocado.
- Consumo de filamentos e materiais vinculado a pedidos é registrado individualmente.
- Diferenças entre consumo detalhado e saldo final são registradas como ajustes históricos auditáveis.
- Lançamentos identificados como retirada do proprietário são classificados como fluxo de capital, sem alterar o efeito total no caixa.
- Campos derivados e fórmulas não são tratados como novos lançamentos.

## Regras de segurança

1. A análise é executada antes de qualquer alteração operacional.
2. Estrutura, cabeçalhos, IDs, referências, datas, números e saldos são validados.
3. Um backup SQLite é criado imediatamente antes da confirmação.
4. A gravação roda em uma única transação; qualquer falha reverte tudo.
5. Uma base que já contém dados exige confirmação explícita de mesclagem.
6. Hash do arquivo e códigos externos impedem importações duplicadas.
7. O relatório detalhado fica na base local e não é publicado no repositório.
