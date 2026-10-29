-- Abrir SOMENTE com sqlite3 -readonly /caminho/salge3d.sqlite
-- Não importar lib/db: inicialização da aplicação pode executar migrações.
BEGIN;
SELECT tenant_id, ativo, COUNT(*) AS quantidade FROM produtos_catalogo GROUP BY tenant_id, ativo;
SELECT id, tenant_id, codigo, nome, nome_chave, ativo FROM produtos_catalogo ORDER BY tenant_id, id;
SELECT id, tenant_id, codigo, nome, nome_chave, ativo FROM produtos_catalogo
WHERE nome_chave IN ('mini jesus', 'jesus') ORDER BY tenant_id, ativo;
WITH candidatos AS (
 SELECT tenant_id, MAX(id) + 1 AS proximo FROM produtos_catalogo GROUP BY tenant_id
)
SELECT c.tenant_id, c.proximo, p.id AS produto_conflitante, p.codigo, p.nome, p.ativo
FROM candidatos c JOIN produtos_catalogo p ON p.tenant_id = c.tenant_id
AND p.codigo = 'PRD-' || printf('%06d', c.proximo);
SELECT name, sql FROM sqlite_schema WHERE tbl_name = 'produtos_catalogo';
ROLLBACK;
