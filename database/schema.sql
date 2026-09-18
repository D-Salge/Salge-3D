-- =============================================================================
--  Salge 3D | Sistema de Gestão de Orçamentos de Impressão 3D
--  Banco de dados: SQLite (MVP) | Arquitetura: Multi-Tenant
--  v2 — Suporte a múltiplos filamentos por pedido (pedido_filamentos)
-- =============================================================================
--  ESTRATÉGIA MULTI-TENANT
--  Modelo adotado: "Shared Database, Shared Schema" com coluna tenant_id
--  em cada tabela. Todos os dados de todos os tenants vivem no mesmo banco,
--  isolados pela chave tenant_id.
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA encoding = 'UTF-8';


-- =============================================================================
--  TABELA: tenants
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    nome                TEXT        NOT NULL,
    plano               TEXT        NOT NULL DEFAULT 'free'
                                    CHECK (plano IN ('free', 'pro', 'enterprise')),
    meta_mensal         REAL        NOT NULL DEFAULT 2000.0,
    taxa_operacional    REAL        NOT NULL DEFAULT 18.0,
    custo_hora_maquina  REAL        NOT NULL DEFAULT 8.5,
    ativo               INTEGER     NOT NULL DEFAULT 1
                                    CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);


-- =============================================================================
--  TABELA: usuarios
-- =============================================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    nome                TEXT        NOT NULL,
    email               TEXT        NOT NULL,
    senha_hash          TEXT        NOT NULL,
    perfil              TEXT        NOT NULL DEFAULT 'operador'
                                    CHECK (perfil IN ('admin', 'operador', 'visualizador')),
    ativo               INTEGER     NOT NULL DEFAULT 1
                                    CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    UNIQUE (tenant_id, email),
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON usuarios (tenant_id);


-- =============================================================================
--  TABELA: filamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS filamentos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    usuario_id          INTEGER     NOT NULL,
    material            TEXT        NOT NULL,
    cor                 TEXT        NOT NULL,
    peso_rolo_gramas    REAL        NOT NULL CHECK (peso_rolo_gramas > 0),
    preco_rolo          REAL        NOT NULL CHECK (preco_rolo >= 0),
    estoque_gramas      REAL                 DEFAULT NULL,
    ativo               INTEGER     NOT NULL DEFAULT 1
                                    CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_filamentos_tenant   ON filamentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_filamentos_usuario  ON filamentos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_filamentos_material ON filamentos (tenant_id, material);


-- =============================================================================
--  TABELA: clientes
-- =============================================================================
CREATE TABLE IF NOT EXISTS clientes (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    usuario_id          INTEGER     NOT NULL,
    nome                TEXT        NOT NULL,
    telefone            TEXT,
    email               TEXT,
    observacoes         TEXT,
    ativo               INTEGER     NOT NULL DEFAULT 1
                                    CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant  ON clientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes (usuario_id);


-- =============================================================================
--  TABELA: pedidos
--  v2: filamento_id e peso_gasto_gramas removidos → movidos para pedido_filamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS pedidos (
    id                          INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id                   INTEGER     NOT NULL,
    usuario_id                  INTEGER     NOT NULL,
    cliente_id                  INTEGER     NOT NULL,

    -- Dados da peça
    nome_da_peca                TEXT        NOT NULL,
    descricao                   TEXT,
    tempo_impressao_horas       REAL        NOT NULL CHECK (tempo_impressao_horas > 0),

    -- Valores financeiros (calculados no momento da criação)
    custo_filamento             REAL        NOT NULL DEFAULT 0 CHECK (custo_filamento >= 0),
    valor_reserva_maquina       REAL        NOT NULL DEFAULT 0 CHECK (valor_reserva_maquina >= 0),
    taxa_operacional            REAL        NOT NULL DEFAULT 18.00 CHECK (taxa_operacional >= 0),
    valor_total_cobrado         REAL        NOT NULL CHECK (valor_total_cobrado >= 0),

    -- Status do ciclo de vida
    status                      TEXT        NOT NULL DEFAULT 'Fila'
                                            CHECK (status IN (
                                                'Fila',
                                                'Imprimindo',
                                                'Acabamento',
                                                'Finalizado',
                                                'Cancelado'
                                            )),

    data_pedido                 TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    data_entrega_prevista       TEXT,
    data_conclusao              TEXT,
    observacoes                 TEXT,
    criado_em                   TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em               TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant  ON pedidos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status  ON pedidos (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_data    ON pedidos (tenant_id, data_pedido);


-- =============================================================================
--  TABELA: pedido_filamentos
--  Relacionamento N:N entre pedidos e filamentos com quantidade.
--  Permite múltiplos filamentos/cores em um único pedido.
-- =============================================================================
CREATE TABLE IF NOT EXISTS pedido_filamentos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    pedido_id           INTEGER     NOT NULL,
    filamento_id        INTEGER     NOT NULL,
    peso_gasto_gramas   REAL        NOT NULL CHECK (peso_gasto_gramas > 0),
    custo_calculado     REAL        NOT NULL DEFAULT 0,   -- snapshot do custo no momento do pedido
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    FOREIGN KEY (pedido_id)    REFERENCES pedidos    (id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (filamento_id) REFERENCES filamentos (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pf_pedido    ON pedido_filamentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pf_filamento ON pedido_filamentos (filamento_id);


-- =============================================================================
--  TRIGGERS: atualiza atualizado_em automaticamente
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_tenants_atualizado_em
    AFTER UPDATE ON tenants FOR EACH ROW
    BEGIN
        UPDATE tenants SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS trg_usuarios_atualizado_em
    AFTER UPDATE ON usuarios FOR EACH ROW
    BEGIN
        UPDATE usuarios SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS trg_filamentos_atualizado_em
    AFTER UPDATE ON filamentos FOR EACH ROW
    BEGIN
        UPDATE filamentos SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS trg_clientes_atualizado_em
    AFTER UPDATE ON clientes FOR EACH ROW
    BEGIN
        UPDATE clientes SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS trg_pedidos_atualizado_em
    AFTER UPDATE ON pedidos FOR EACH ROW
    BEGIN
        UPDATE pedidos SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
    END;


-- =============================================================================
--  DADOS DE SEED — MVP
-- =============================================================================

INSERT INTO tenants (nome, plano)
SELECT 'Salge 3D', 'pro'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE nome = 'Salge 3D');

INSERT INTO usuarios (tenant_id, nome, email, senha_hash, perfil)
SELECT t.id, 'Daniel', 'daniel@salge3d.com', 'SUBSTITUA_POR_HASH_BCRYPT', 'admin'
FROM tenants t
WHERE t.nome = 'Salge 3D'
  AND NOT EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.tenant_id = t.id AND u.email = 'daniel@salge3d.com'
  )
ORDER BY t.id
LIMIT 1;


-- =============================================================================
--  VIEW: resumo de pedidos com filamentos agregados
-- =============================================================================

CREATE VIEW IF NOT EXISTS vw_pedidos_completo AS
SELECT
    p.id                                                AS pedido_id,
    p.tenant_id,
    t.nome                                              AS tenant_nome,
    u.nome                                              AS usuario_nome,
    c.nome                                              AS cliente_nome,
    c.telefone                                          AS cliente_telefone,
    p.nome_da_peca,
    p.tempo_impressao_horas,
    COALESCE(
        (SELECT GROUP_CONCAT(f.material || ' ' || f.cor, ' · ')
         FROM pedido_filamentos pf
         JOIN filamentos f ON f.id = pf.filamento_id
         WHERE pf.pedido_id = p.id), '—'
    )                                                   AS materiais,
    COALESCE(
        (SELECT SUM(pf.peso_gasto_gramas)
         FROM pedido_filamentos pf
         WHERE pf.pedido_id = p.id), 0
    )                                                   AS peso_total_gramas,
    p.custo_filamento,
    p.valor_reserva_maquina,
    p.taxa_operacional,
    p.valor_total_cobrado,
    p.status,
    p.data_pedido,
    p.data_entrega_prevista,
    p.data_conclusao
FROM      pedidos  p
JOIN      tenants  t ON t.id = p.tenant_id
JOIN      usuarios u ON u.id = p.usuario_id
JOIN      clientes c ON c.id = p.cliente_id;
