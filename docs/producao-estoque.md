# Produção para estoque e produtos acabados

## Fluxo operacional

1. Cadastre o produto e sua versão no **Catálogo técnico**.
2. Abra **Produção → Produzir para estoque**, crie uma ordem e informe a quantidade, a plate, a impressora e os consumos previstos.
3. Avance a ordem por **Planejada → Em produção → Conferência**.
4. Na conclusão, informe quantidades fabricada, aprovada e reprovada, tempo e consumos reais. O ERP baixa filamentos e insumos por FIFO e cria um lote acabado em uma única transação.
5. Consulte saldos, lotes, custos e movimentos em **Estoque → Produtos acabados**.
6. Em um orçamento, selecione **Atender com estoque**, escolha o produto e informe a quantidade. O saldo é reservado ao salvar e a saída ocorre na entrega ou no fechamento do pedido.

A ordem interna não cria cliente, receita, parcela ou recebimento. Uma venda atendida com estoque não baixa novamente os materiais da fabricação.

## Custos e rastreabilidade

O custo real total do lote soma materiais efetivamente consumidos, energia, reserva de máquina, trabalho e custos adicionais informados. Quando existem lotes de material, são usados os custos históricos efetivos da baixa FIFO. O custo unitário acabado é:

`custo real total / quantidade aprovada`

Assim, peças reprovadas permanecem no custo do lote e são rateadas apenas entre as aprovadas. A reserva comercial mantém os lotes acabados FIFO; cada saída registra lote, pedido, entrega, quantidade e custo. Cancelamentos liberam reservas e devolvem saídas já feitas, sem desfazer o consumo real da fabricação.

Os saldos são derivados do livro de movimentos. Perdas e ajustes exigem quantidade, motivo e perfil administrador ou operador, e não podem consumir saldo reservado.

## Segurança e migração

A migração é aditiva. Em bancos existentes, o mecanismo geral de migrações cria e valida um snapshot SQLite consistente antes de alterar o esquema, incluindo dados presentes no WAL. Se o backup falhar, nenhuma migração é aplicada. O caminho do backup validado aparece no log; veja a seção de recuperação no README.

Todas as mutações validam sessão, perfil e empresa no servidor. Conclusões, reservas, saídas e devoluções são transacionais, serializadas com `IMMEDIATE` e protegidas por identificadores de operação contra repetição.

## Limitações desta primeira versão

- Um pedido usa integralmente estoque acabado ou produção sob encomenda; atendimento misto não é inferido automaticamente.
- Arquivos de fabricação são registrados como referências textuais; o ERP não hospeda binários.
- Ajustes manuais de estoque não implementam conciliação contábil externa.
- O campo legado de tempo do pedido exige valor positivo no banco. Pedidos de estoque armazenam um valor técnico mínimo, mas o cálculo comercial usa tempo, energia e máquina iguais a zero e reconhece o custo acabado separadamente.

