-- =============================================================================
--  Salge 3D | Sistema de Gestao de Orcamentos de Impressao 3D
--  v3 - ERP Completo: insumos, recebimentos, despesas, fluxo de capital
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =============================================================================
--  TABELA: tenants
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                      INTEGER     PRIMARY KEY AUTOINCREMENT,
    nome                    TEXT        NOT NULL,
    plano                   TEXT        NOT NULL DEFAULT 'free'
                                        CHECK (plano IN ('free', 'pro', 'enterprise')),
    meta_mensal             REAL        NOT NULL DEFAULT 2000.0,
    taxa_operacional        REAL        NOT NULL DEFAULT 18.0,
    custo_hora_maquina      REAL        NOT NULL DEFAULT 8.5,
    tarifa_energia_kwh      REAL        NOT NULL DEFAULT 0.92,
    potencia_impressora_w   REAL        NOT NULL DEFAULT 300.0,
    ativo                   INTEGER     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em               TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
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
    perfil              TEXT        NOT NULL DEFAULT 'operador' CHECK (perfil IN ('admin', 'operador', 'visualizador')),
    ativo               INTEGER     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (tenant_id, email),
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON usuarios (tenant_id);

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
    instagram           TEXT,
    cidade              TEXT,
    origem              TEXT        DEFAULT 'Instagram' CHECK (origem IN ('Instagram', 'Indicacao', 'Google', 'WhatsApp', 'Presencial', 'Outro')),
    observacoes         TEXT,
    ativo               INTEGER     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant  ON clientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes (usuario_id);

-- =============================================================================
--  TABELA: filamentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS filamentos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    usuario_id          INTEGER     NOT NULL,
    material            TEXT        NOT NULL,
    cor                 TEXT        NOT NULL,
    marca               TEXT,
    fornecedor          TEXT,
    peso_rolo_gramas    REAL        NOT NULL CHECK (peso_rolo_gramas > 0),
    preco_rolo          REAL        NOT NULL CHECK (preco_rolo >= 0),
    estoque_gramas      REAL        DEFAULT NULL,
    ativo               INTEGER     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_filamentos_tenant   ON filamentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_filamentos_usuario  ON filamentos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_filamentos_material ON filamentos (tenant_id, material);

-- =============================================================================
--  TABELA: insumos
-- =============================================================================
CREATE TABLE IF NOT EXISTS insumos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    usuario_id          INTEGER     NOT NULL,
    nome                TEXT        NOT NULL,
    unidade             TEXT        NOT NULL DEFAULT 'unid' CHECK (unidade IN ('unid', 'g', 'ml', 'cm', 'm')),
    custo_unitario      REAL        NOT NULL DEFAULT 0 CHECK (custo_unitario >= 0),
    estoque_atual       REAL        NOT NULL DEFAULT 0 CHECK (estoque_atual >= 0),
    estoque_minimo      REAL        NOT NULL DEFAULT 0,
    ativo               INTEGER     NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    atualizado_em       TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_insumos_tenant ON insumos (tenant_id);

-- =============================================================================
--  TABELA: pedidos (v3 ERP)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pedidos (
    id                          INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id                   INTEGER     NOT NULL,
    usuario_id                  INTEGER     NOT NULL,
    cliente_id                  INTEGER     NOT NULL,
    nome_da_peca                TEXT        NOT NULL,
    descricao                   TEXT,
    tempo_impressao_horas       REAL        NOT NULL CHECK (tempo_impressao_horas > 0),
    custo_filamento             REAL        NOT NULL DEFAULT 0,
    custo_insumos               REAL        NOT NULL DEFAULT 0,
    custo_energia               REAL        NOT NULL DEFAULT 0,
    valor_reserva_maquina       REAL        NOT NULL DEFAULT 0,
    taxa_operacional            REAL        NOT NULL DEFAULT 18.0,
    custo_embalagem             REAL        NOT NULL DEFAULT 0,
    desconto                    REAL        NOT NULL DEFAULT 0,
    frete_cobrado               REAL        NOT NULL DEFAULT 0,
    frete_pago                  REAL        NOT NULL DEFAULT 0,
    valor_total_cobrado         REAL        NOT NULL CHECK (valor_total_cobrado >= 0),
    data_entrega                TEXT,
    status                      TEXT        NOT NULL DEFAULT 'Fila'
                                            CHECK (status IN ('Fila', 'Imprimindo', 'Acabamento', 'Finalizado', 'Cancelado')),
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
-- =============================================================================
CREATE TABLE IF NOT EXISTS pedido_filamentos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    pedido_id           INTEGER     NOT NULL,
    filamento_id        INTEGER     NOT NULL,
    peso_gasto_gramas   REAL        NOT NULL CHECK (peso_gasto_gramas > 0),
    custo_calculado     REAL        NOT NULL DEFAULT 0,
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (pedido_id)    REFERENCES pedidos    (id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (filamento_id) REFERENCES filamentos (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pf_pedido    ON pedido_filamentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pf_filamento ON pedido_filamentos (filamento_id);

-- =============================================================================
--  TABELA: pedido_insumos
-- =============================================================================
CREATE TABLE IF NOT EXISTS pedido_insumos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    pedido_id           INTEGER     NOT NULL,
    insumo_id           INTEGER     NOT NULL,
    quantidade          REAL        NOT NULL CHECK (quantidade > 0),
    custo_unitario_snap REAL        NOT NULL DEFAULT 0,
    custo_calculado     REAL        NOT NULL DEFAULT 0,
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (insumo_id) REFERENCES insumos (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pi_pedido ON pedido_insumos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pi_insumo ON pedido_insumos (insumo_id);

-- =============================================================================
--  TABELA: recebimentos
-- =============================================================================
CREATE TABLE IF NOT EXISTS recebimentos (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    pedido_id           INTEGER     NOT NULL,
    valor               REAL        NOT NULL CHECK (valor > 0),
    forma_pagamento     TEXT        NOT NULL DEFAULT 'Pix'
                                    CHECK (forma_pagamento IN ('Pix', 'Dinheiro', 'Cartao Credito', 'Cartao Debito', 'Transferencia', 'Outro')),
    data_recebimento    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    observacao          TEXT,
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recebimentos_tenant ON recebimentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_pedido ON recebimentos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_data   ON recebimentos (tenant_id, data_recebimento);

-- =============================================================================
--  TABELA: despesas
-- =============================================================================
CREATE TABLE IF NOT EXISTS despesas (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    usuario_id          INTEGER     NOT NULL,
    categoria           TEXT        NOT NULL DEFAULT 'Outros'
                                    CHECK (categoria IN ('Filamentos', 'Insumos', 'Equipamento', 'Energia', 'Marketing', 'Software', 'Manutencao', 'Embalagens', 'Frete', 'Outros')),
    descricao           TEXT        NOT NULL,
    valor               REAL        NOT NULL CHECK (valor > 0),
    data_despesa        TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_despesas_tenant    ON despesas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria ON despesas (tenant_id, categoria);
CREATE INDEX IF NOT EXISTS idx_despesas_data      ON despesas (tenant_id, data_despesa);

-- =============================================================================
--  TABELA: fluxo_capital
-- =============================================================================
CREATE TABLE IF NOT EXISTS fluxo_capital (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    tenant_id           INTEGER     NOT NULL,
    usuario_id          INTEGER     NOT NULL,
    tipo                TEXT        NOT NULL CHECK (tipo IN ('Aporte', 'Retirada')),
    valor               REAL        NOT NULL CHECK (valor > 0),
    descricao           TEXT,
    data_movimentacao   TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    criado_em           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (tenant_id)  REFERENCES tenants  (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_fluxo_tenant ON fluxo_capital (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_data   ON fluxo_capital (tenant_id, data_movimentacao);

-- =============================================================================
--  TRIGGERS
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_tenants_atualizado_em AFTER UPDATE ON tenants FOR EACH ROW BEGIN UPDATE tenants SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_usuarios_atualizado_em AFTER UPDATE ON usuarios FOR EACH ROW BEGIN UPDATE usuarios SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_filamentos_atualizado_em AFTER UPDATE ON filamentos FOR EACH ROW BEGIN UPDATE filamentos SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_clientes_atualizado_em AFTER UPDATE ON clientes FOR EACH ROW BEGIN UPDATE clientes SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_pedidos_atualizado_em AFTER UPDATE ON pedidos FOR EACH ROW BEGIN UPDATE pedidos SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;
CREATE TRIGGER IF NOT EXISTS trg_insumos_atualizado_em AFTER UPDATE ON insumos FOR EACH ROW BEGIN UPDATE insumos SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id; END;

-- =============================================================================
--  VIEW: resumo completo de pedidos
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_pedidos_completo AS
SELECT
    p.id AS pedido_id, p.tenant_id,
    t.nome AS tenant_nome,
    u.nome AS usuario_nome,
    c.nome AS cliente_nome,
    c.telefone AS cliente_telefone,
    c.instagram AS cliente_instagram,
    p.nome_da_peca, p.tempo_impressao_horas,
    COALESCE(
        (SELECT GROUP_CONCAT(f.material || ' ' || f.cor, ' x ')
         FROM pedido_filamentos pf JOIN filamentos f ON f.id = pf.filamento_id
         WHERE pf.pedido_id = p.id), 'Sem filamento'
    ) AS materiais,
    COALESCE((SELECT SUM(pf.peso_gasto_gramas) FROM pedido_filamentos pf WHERE pf.pedido_id = p.id), 0) AS peso_total_gramas,
    p.custo_filamento, p.custo_insumos, p.custo_energia,
    p.valor_reserva_maquina, p.taxa_operacional, p.custo_embalagem,
    p.desconto, p.frete_cobrado, p.frete_pago, p.valor_total_cobrado,
    COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0) AS total_recebido,
    p.status, p.data_pedido, p.data_entrega, p.data_entrega_prevista, p.data_conclusao
FROM pedidos p
JOIN tenants  t ON t.id = p.tenant_id
JOIN usuarios u ON u.id = p.usuario_id
JOIN clientes c ON c.id = p.cliente_id;

-- =============================================================================
--  SEED
-- =============================================================================
INSERT INTO tenants (nome, plano, tarifa_energia_kwh, potencia_impressora_w)
    VALUES ('Salge 3D', 'pro', 0.92, 300.0);
INSERT INTO usuarios (tenant_id, nome, email, senha_hash, perfil)
    VALUES (1, 'Daniel', 'daniel@salge3d.com', 'HASH', 'admin');
