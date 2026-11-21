# Auditoria — ajustes iniciais de interface

Este lote pode ser aplicado junto ao lote de permissões. Não modifica cálculos,
ações de negócio, banco, preferência de tema ou a animação de troca de tema.

## Alterações

- Adiciona 28 px de separação entre a grade do dashboard e o monitor Bambu,
  exclusivamente quando esses blocos são irmãos adjacentes na visão geral.
- Remove o listener e a indicação de Ctrl/Cmd+K. A busca continua pelo botão.
- `Ver vendas` abre `/produtos?aba=vendas`. O catálogo permanece como padrão em
  `/produtos`; parâmetros desconhecidos também usam o catálogo. A chave do
  componente acompanha a aba inicial ao navegar para a mesma rota.
- A meta lateral passa a dizer **Faturamento no mês**, alinhada à meta de
  faturamento das configurações e relatórios. O cartão de recebimentos continua
  identificado separadamente.
- O indicador de filamento explicita **Estoque físico de filamento**; não afirma
  que esse saldo está livre de comprometimentos de produção.
- Mantém o texto dos dados Bambu legível quando desatualizado. A indicação de
  leitura antiga continua no status e nas informações de atualização.
- Os títulos das páginas passam a receber a marca somente pelo template do
  layout, eliminando sua duplicação na aba do navegador.

## Validação e limites

CI com Node 22.20.0: testes, lint, TypeScript, build e verificações HTTP do projeto.
O smoke HTTP adicional confere o link do dashboard, a aba de vendas aberta pela
URL, o catálogo padrão/fallback, os rótulos e o título sem duplicação.

As verificações HTTP inspecionam o HTML do servidor. Não constituem teste visual
em navegador, nem teste de foco, teclado, clique no seletor de tema ou animação.
Revisão visual de espaçamento, temas claro/escuro e larguras de 320, 390, 1280 e
1920 px permanece pendente. Modais acessíveis e compactação do painel offline
continuam como trabalhos separados.
