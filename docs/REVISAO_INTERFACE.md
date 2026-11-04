# Revisão de interface — 04/11/2026

Base: `287d2fdf7fcbbaf7b2cb523c868f516c983703ce` (PR #71).
Escopo: cortes, sobreposições e dimensionamento de botões, tabelas e formulários após a mudança visual.

## Problemas corrigidos

| Local | Evidência / causa | Correção |
| --- | --- | --- |
| Financeiro: Receber | Coluna fixa de 86 px com 36 px de padding deixava o botão com 50 px. O texto media 51,73 px, antes de considerar o padding do próprio botão. | Colunas de saldo e ação dimensionadas pelo conteúdo; botão com largura natural, sem quebra. |
| Financeiro: despesas | A mesma coluna estreita comprimia Reabrir / Dar baixa e o cabeçalho de vencimento. | Tabela com largura mínima própria, colunas não comprimidas e rolagem horizontal local quando necessária. |
| Financeiro: indicadores e cabeçalhos | Seis indicadores disputavam a largura de um notebook; ações de cabeçalho não podiam mudar de linha. | Três indicadores por linha em notebooks, seis somente a partir de 1800 px; cabeçalhos permitem quebra. |
| Tabelas: valores | Na lista de insumos em celular, `R$` ficava em uma linha e `5,00` em outra. | Células/valores numéricos com `font-mono` permanecem em uma linha e usam a rolagem da tabela. |
| Despesas, recorrências e impressoras: formulários | Em 320 px, datas e opções de pagamento eram cortadas pelas duas colunas. | Uma coluna no celular; duas a partir de 640 px. |
| Diálogos centralizados | Em uma janela de 390 × 480 px, Nova ocorrência tinha 900,92 px de altura e começava em y = -210,45; o começo e a ação final ficavam inacessíveis. | Limite pela altura dinâmica da janela e rolagem interna em 19 painéis que repetiam esse padrão. Após a correção: y = 16, altura = 448 px. |

Os painéis corrigidos abrangem agenda, qualidade/expedição, fornecedores, contas financeiras, recorrências, entregas, movimentação de capital, impressoras/manutenção, insumos, lotes de filamento, arquivamento de pedido, bloqueio de produção, usuários e WhatsApp. Diálogos já limitados por altura e os que usam rolagem externa com alinhamento no topo foram preservados.

## Cobertura

- Inspeção estrutural dos 96 arquivos TSX de `app/`, incluindo 24 tabelas e 563 controles nativos de formulário/ação. Revisão dos estilos globais, larguras fixas e containers de rolagem.
- Navegador com componentes reais e dados fictícios em uma cópia isolada: visão geral, orçamento, materiais, produção, catálogo, financeiro, lista de pedidos, clientes, insumos, impressoras, conciliação, compras, agenda, relatórios, inventário, configurações, backups, usuários, produtos acabados, fiscal, qualidade/expedição, integrações e fabricação para estoque.
- Conferência de limites do texto dos botões e links, além de inspeção visual. Larguras de celular de 390 e 320 px; cenários de notebook em 1280 px e janela normal do navegador. Diálogo de qualidade também conferido em 480 px de altura.
- A inspeção visual usa exemplos e estados vazios/populados, conforme o módulo. Não representa teste transacional completo de todas as combinações nem acesso aos dados reais do usuário.

## Validação automatizada

`npm run ci` com Node 22.20.0: 252 testes aprovados, lint, TypeScript, build de produção e testes HTTP de autorização, isolamento entre empresas, portal público e orçamento por plates aprovados.

As alterações são de layout. Não há migração, mudança de cálculos ou gravação em banco de produção. As rotas e dados de inspeção visual ficam fora do repositório publicado.
