# Auditoria — primeiro lote: permissões e empresa da sessão

Implementação iniciada em 21/11/2026 sobre a `main` em `b418928`.

## Comportamento corrigido

- Toda ação de escrita interna exige perfil de escrita no servidor. O bloqueio
  independe do cabeçalho `Next-Action`, incluindo formulários multipart do React.
- As consultas internas exigem sessão. O portal público conserva sua validação
  específica de token e o primeiro acesso/login continuam sendo entradas públicas.
- Os 25 arquivos de ações com empresa fixa passam a obter empresa e autoria da
  sessão, inclusive nos auxiliares de agenda, planejamento, inventário,
  recorrências e expiração de orçamentos.
- As gravações de clientes, filamentos, movimentos e auditoria deixam de atribuir
  operações ao usuário 1. A auditoria exige contexto explícito no tipo da função.
- Editar um cliente de outra empresa responde como não encontrado.

Administradores continuam gerenciando configurações, usuários, importação e
backups. Operadores continuam executando a operação diária; visualizadores leem
os módulos disponíveis ao seu perfil. A materialização automática de recorrências
e a expiração que já ocorriam durante consultas permanecem, agora limitadas à
empresa da sessão e com o usuário que acionou a consulta registrado no histórico.

Este lote trata as ações e consultas da aplicação. Backup completo continua
sendo uma operação administrativa da instalação SQLite, não uma exportação
segregada de uma empresa. Nenhuma migração, restauração ou alteração retroativa
de dados foi introduzida.

## Verificação

`tests/actions-autorizacao.test.mjs` carrega as ações reais com sessão e cache do
Next substituídos. Verifica recusa das 101 ações internas de escrita para sessão
ausente e visualizador antes de acesso ao banco, autenticação de todas as
consultas internas e cenários com duas empresas/operador usando SQLite real.

`scripts/portal-security-http.mjs` inclui formulário multipart de alteração de
saldo com visualizador, anônimo e operador. O operador é o controle positivo do
payload: a gravação precisa funcionar e sua autoria precisa chegar à auditoria.
Também verifica os materiais e configurações de duas empresas no build real.

Validação local: CI completa com Node 22.20.0 aprovada (270 testes na execução da
CI, lint, TypeScript, build e HTTP). A última ampliação dos testes de leitura
passou nos oito cenários dirigidos e na repetição completa dos testes (271).
Nenhum banco ou serviço externo de produção foi utilizado.

## Continuação da auditoria

Os demais itens permanecem em lotes separados: custos de rolos e fechamento,
inventário concorrente, histórico de checklists, coerência financeira,
planejamento por execução física e interface. A aprovação deste lote não deve
ser interpretada como resolução de todos os achados da auditoria de 16/11.
