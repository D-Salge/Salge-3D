/**
 * Migrações incrementais do banco do Salge 3D.
 *
 * Mantemos as alterações aqui para que instalações existentes recebam novas
 * colunas sem precisar apagar o banco. Cada migração roda uma única vez.
 */

export const migrations = [
  {
    version: 1,
    name: 'operacao_erp_completa',
    sql: `
      CREATE TABLE IF NOT EXISTS impressoras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        modelo TEXT,
        potencia_w REAL NOT NULL DEFAULT 300 CHECK (potencia_w >= 0),
        custo_hora REAL NOT NULL DEFAULT 0 CHECK (custo_hora >= 0),
        status TEXT NOT NULL DEFAULT 'Disponivel'
          CHECK (status IN ('Disponivel', 'Em uso', 'Manutencao', 'Inativa')),
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_impressoras_tenant ON impressoras (tenant_id, ativo);

      INSERT INTO impressoras (tenant_id, nome, modelo, potencia_w)
      SELECT 1, 'P2S', 'Bambu Lab P2S', 350
      WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 1)
        AND NOT EXISTS (SELECT 1 FROM impressoras WHERE tenant_id = 1 AND nome = 'P2S');

      INSERT INTO impressoras (tenant_id, nome, modelo, potencia_w)
      SELECT 1, 'A1 Mini', 'Bambu Lab A1 Mini', 150
      WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 1)
        AND NOT EXISTS (SELECT 1 FROM impressoras WHERE tenant_id = 1 AND nome = 'A1 Mini');

      ALTER TABLE pedidos ADD COLUMN numero_orcamento TEXT;
      ALTER TABLE pedidos ADD COLUMN orcamento_status TEXT NOT NULL DEFAULT 'Aprovado'
        CHECK (orcamento_status IN ('Rascunho', 'Enviado', 'Aprovado', 'Recusado', 'Expirado'));
      ALTER TABLE pedidos ADD COLUMN validade_orcamento TEXT;
      ALTER TABLE pedidos ADD COLUMN vencimento_em TEXT;
      ALTER TABLE pedidos ADD COLUMN parcelas INTEGER NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 120);
      ALTER TABLE pedidos ADD COLUMN condicao_pagamento TEXT;
      ALTER TABLE pedidos ADD COLUMN impressora_id INTEGER REFERENCES impressoras (id) ON UPDATE CASCADE ON DELETE SET NULL;
      ALTER TABLE pedidos ADD COLUMN inicio_previsto TEXT;
      ALTER TABLE pedidos ADD COLUMN fim_previsto TEXT;
      ALTER TABLE pedidos ADD COLUMN tempo_real_horas REAL CHECK (tempo_real_horas IS NULL OR tempo_real_horas >= 0);
      ALTER TABLE pedidos ADD COLUMN custo_extra_real REAL NOT NULL DEFAULT 0 CHECK (custo_extra_real >= 0);
      ALTER TABLE pedidos ADD COLUMN falhas_impressao INTEGER NOT NULL DEFAULT 0 CHECK (falhas_impressao >= 0);

      UPDATE pedidos
      SET numero_orcamento = 'ORC-' || strftime('%Y', data_pedido) || '-' || printf('%06d', id)
      WHERE numero_orcamento IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_numero_orcamento
        ON pedidos (tenant_id, numero_orcamento);
      CREATE INDEX IF NOT EXISTS idx_pedidos_orcamento_status
        ON pedidos (tenant_id, orcamento_status);
      CREATE INDEX IF NOT EXISTS idx_pedidos_impressora
        ON pedidos (tenant_id, impressora_id, inicio_previsto);

      ALTER TABLE pedido_filamentos ADD COLUMN consumo_real_gramas REAL
        CHECK (consumo_real_gramas IS NULL OR consumo_real_gramas >= 0);
      ALTER TABLE pedido_insumos ADD COLUMN consumo_real REAL
        CHECK (consumo_real IS NULL OR consumo_real >= 0);

      ALTER TABLE recebimentos ADD COLUMN estornado_em TEXT;
      ALTER TABLE recebimentos ADD COLUMN estorno_motivo TEXT;
      ALTER TABLE despesas ADD COLUMN estornada_em TEXT;
      ALTER TABLE despesas ADD COLUMN estorno_motivo TEXT;

      CREATE TABLE IF NOT EXISTS movimentos_estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        tipo_item TEXT NOT NULL CHECK (tipo_item IN ('Filamento', 'Insumo')),
        item_id INTEGER NOT NULL,
        pedido_id INTEGER,
        tipo TEXT NOT NULL CHECK (tipo IN ('Entrada', 'Saida', 'Ajuste', 'Reversao')),
        quantidade REAL NOT NULL CHECK (quantidade > 0),
        saldo_anterior REAL NOT NULL,
        saldo_posterior REAL NOT NULL,
        motivo TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_item
        ON movimentos_estoque (tenant_id, tipo_item, item_id, criado_em);
      CREATE INDEX IF NOT EXISTS idx_movimentos_estoque_pedido
        ON movimentos_estoque (pedido_id);

      CREATE TABLE IF NOT EXISTS historico_pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        evento TEXT NOT NULL,
        descricao TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_historico_pedido
        ON historico_pedidos (pedido_id, criado_em DESC);

      CREATE TABLE IF NOT EXISTS anexos_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        url TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_anexos_pedido ON anexos_pedido (pedido_id);

      CREATE TRIGGER IF NOT EXISTS trg_impressoras_atualizado_em
      AFTER UPDATE ON impressoras FOR EACH ROW BEGIN
        UPDATE impressoras SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 2,
    name: 'controle_avancado_estoque_financeiro_auditoria',
    sql: `
      ALTER TABLE filamentos ADD COLUMN estoque_minimo_gramas REAL NOT NULL DEFAULT 150
        CHECK (estoque_minimo_gramas >= 0);
      ALTER TABLE movimentos_estoque ADD COLUMN lote_filamento_id INTEGER
        REFERENCES lotes_filamento (id) ON UPDATE CASCADE ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS lotes_filamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        filamento_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        peso_inicial_gramas REAL NOT NULL CHECK (peso_inicial_gramas > 0),
        saldo_gramas REAL NOT NULL CHECK (saldo_gramas >= 0),
        preco_compra REAL NOT NULL DEFAULT 0 CHECK (preco_compra >= 0),
        aberto_em TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        UNIQUE (tenant_id, codigo),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (filamento_id) REFERENCES filamentos (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_lotes_filamento_saldo
        ON lotes_filamento (tenant_id, filamento_id, ativo, saldo_gramas, criado_em);

      INSERT INTO lotes_filamento (
        tenant_id, filamento_id, codigo, peso_inicial_gramas, saldo_gramas,
        preco_compra, aberto_em
      )
      SELECT f.tenant_id, f.id, 'MIG-' || printf('%06d', f.id),
        MAX(COALESCE(f.estoque_gramas, f.peso_rolo_gramas), f.peso_rolo_gramas),
        COALESCE(f.estoque_gramas, f.peso_rolo_gramas), f.preco_rolo,
        substr(f.criado_em, 1, 10)
      FROM filamentos f
      WHERE COALESCE(f.estoque_gramas, f.peso_rolo_gramas) > 0
        AND NOT EXISTS (
          SELECT 1 FROM lotes_filamento l
          WHERE l.tenant_id = f.tenant_id AND l.filamento_id = f.id
        );

      CREATE TABLE IF NOT EXISTS parcelas_receber (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        numero INTEGER NOT NULL CHECK (numero > 0),
        valor REAL NOT NULL CHECK (valor >= 0),
        vencimento_em TEXT NOT NULL,
        observacao TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        cancelada_em TEXT,
        UNIQUE (pedido_id, numero),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_parcelas_receber_vencimento
        ON parcelas_receber (tenant_id, vencimento_em, cancelada_em);

      CREATE TABLE IF NOT EXISTS recebimento_alocacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recebimento_id INTEGER NOT NULL,
        parcela_id INTEGER NOT NULL,
        valor REAL NOT NULL CHECK (valor > 0),
        UNIQUE (recebimento_id, parcela_id),
        FOREIGN KEY (recebimento_id) REFERENCES recebimentos (id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (parcela_id) REFERENCES parcelas_receber (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_recebimento_alocacoes_parcela
        ON recebimento_alocacoes (parcela_id);

      WITH RECURSIVE numeros(n) AS (
        SELECT 1
        UNION ALL
        SELECT n + 1 FROM numeros WHERE n < 120
      )
      INSERT INTO parcelas_receber (tenant_id, pedido_id, numero, valor, vencimento_em)
      SELECT p.tenant_id, p.id, numeros.n,
        CASE
          WHEN numeros.n = p.parcelas THEN
            ROUND(p.valor_total_cobrado - ROUND(p.valor_total_cobrado / p.parcelas, 2) * (p.parcelas - 1), 2)
          ELSE ROUND(p.valor_total_cobrado / p.parcelas, 2)
        END,
        date(
          COALESCE(p.vencimento_em, substr(p.data_pedido, 1, 10)),
          printf('+%d months', numeros.n - 1)
        )
      FROM pedidos p
      JOIN numeros ON numeros.n <= p.parcelas
      WHERE p.orcamento_status = 'Aprovado'
        AND NOT EXISTS (SELECT 1 FROM parcelas_receber pr WHERE pr.pedido_id = p.id);

      INSERT INTO recebimento_alocacoes (recebimento_id, parcela_id, valor)
      SELECT r.id, pr.id, MIN(r.valor, pr.valor)
      FROM recebimentos r
      JOIN parcelas_receber pr ON pr.pedido_id = r.pedido_id AND pr.numero = 1
      WHERE r.estornado_em IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM recebimento_alocacoes ra WHERE ra.recebimento_id = r.id
        );

      ALTER TABLE despesas ADD COLUMN competencia_em TEXT;
      ALTER TABLE despesas ADD COLUMN vencimento_em TEXT;
      ALTER TABLE despesas ADD COLUMN pago_em TEXT;
      UPDATE despesas
      SET competencia_em = substr(data_despesa, 1, 10),
          vencimento_em = substr(data_despesa, 1, 10),
          pago_em = substr(data_despesa, 1, 10)
      WHERE competencia_em IS NULL;

      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        entidade TEXT NOT NULL,
        entidade_id INTEGER,
        acao TEXT NOT NULL,
        descricao TEXT NOT NULL,
        dados_json TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_auditoria_entidade
        ON auditoria (tenant_id, entidade, entidade_id, criado_em DESC);

      CREATE TRIGGER IF NOT EXISTS trg_lotes_filamento_atualizado_em
      AFTER UPDATE ON lotes_filamento FOR EACH ROW BEGIN
        UPDATE lotes_filamento
        SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 3,
    name: 'importacao_planilha_com_rastreabilidade',
    sql: `
      ALTER TABLE tenants ADD COLUMN saldo_inicial_caixa REAL NOT NULL DEFAULT 0;
      ALTER TABLE tenants ADD COLUMN margem_perdas_padrao REAL NOT NULL DEFAULT 0.10
        CHECK (margem_perdas_padrao BETWEEN 0 AND 1);
      ALTER TABLE tenants ADD COLUMN taxa_venda_padrao REAL NOT NULL DEFAULT 0
        CHECK (taxa_venda_padrao BETWEEN 0 AND 1);
      ALTER TABLE tenants ADD COLUMN valor_hora_trabalho REAL NOT NULL DEFAULT 0
        CHECK (valor_hora_trabalho >= 0);
      ALTER TABLE tenants ADD COLUMN fator_b2c_personalizado REAL NOT NULL DEFAULT 2
        CHECK (fator_b2c_personalizado > 0);
      ALTER TABLE tenants ADD COLUMN fator_b2c_lote REAL NOT NULL DEFAULT 1.7
        CHECK (fator_b2c_lote > 0);
      ALTER TABLE tenants ADD COLUMN fator_b2b_piloto REAL NOT NULL DEFAULT 1.8
        CHECK (fator_b2b_piloto > 0);
      ALTER TABLE tenants ADD COLUMN fator_b2b_recorrente REAL NOT NULL DEFAULT 1.5
        CHECK (fator_b2b_recorrente > 0);
      ALTER TABLE tenants ADD COLUMN pedido_minimo_b2b REAL NOT NULL DEFAULT 0
        CHECK (pedido_minimo_b2b >= 0);

      ALTER TABLE clientes ADD COLUMN codigo_externo TEXT;
      ALTER TABLE clientes ADD COLUMN tipo_cliente TEXT;
      ALTER TABLE clientes ADD COLUMN data_cadastro_origem TEXT;
      ALTER TABLE clientes ADD COLUMN ultimo_contato TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_externo
        ON clientes (tenant_id, codigo_externo) WHERE codigo_externo IS NOT NULL;

      ALTER TABLE lotes_filamento ADD COLUMN fornecedor TEXT;
      ALTER TABLE lotes_filamento ADD COLUMN comprado_em TEXT;
      ALTER TABLE lotes_filamento ADD COLUMN status_origem TEXT;
      ALTER TABLE lotes_filamento ADD COLUMN observacoes TEXT;
      ALTER TABLE pedido_filamentos ADD COLUMN lote_filamento_id INTEGER
        REFERENCES lotes_filamento (id) ON UPDATE CASCADE ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_pf_lote ON pedido_filamentos (lote_filamento_id);

      ALTER TABLE insumos ADD COLUMN codigo_externo TEXT;
      ALTER TABLE insumos ADD COLUMN categoria TEXT;
      ALTER TABLE insumos ADD COLUMN quantidade_inicial REAL;
      ALTER TABLE insumos ADD COLUMN valor_total_pago REAL;
      ALTER TABLE insumos ADD COLUMN comprado_em TEXT;
      ALTER TABLE insumos ADD COLUMN status_origem TEXT;
      ALTER TABLE insumos ADD COLUMN fornecedor TEXT;
      ALTER TABLE insumos ADD COLUMN observacoes_origem TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_insumos_codigo_externo
        ON insumos (tenant_id, codigo_externo) WHERE codigo_externo IS NOT NULL;

      ALTER TABLE pedidos ADD COLUMN codigo_externo TEXT;
      ALTER TABLE pedidos ADD COLUMN status_origem TEXT;
      ALTER TABLE pedidos ADD COLUMN tipo_venda TEXT;
      ALTER TABLE pedidos ADD COLUMN categoria_origem TEXT;
      ALTER TABLE pedidos ADD COLUMN quantidade REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0);
      ALTER TABLE pedidos ADD COLUMN preco_unitario REAL;
      ALTER TABLE pedidos ADD COLUMN canal TEXT;
      ALTER TABLE pedidos ADD COLUMN taxas_comissoes REAL NOT NULL DEFAULT 0;
      ALTER TABLE pedidos ADD COLUMN custo_total_origem REAL;
      ALTER TABLE pedidos ADD COLUMN lucro_estimado_origem REAL;
      ALTER TABLE pedidos ADD COLUMN margem_origem REAL;
      ALTER TABLE pedidos ADD COLUMN situacao_financeira_origem TEXT;
      ALTER TABLE pedidos ADD COLUMN tempo_impressao_informado INTEGER NOT NULL DEFAULT 1
        CHECK (tempo_impressao_informado IN (0, 1));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_codigo_externo
        ON pedidos (tenant_id, codigo_externo) WHERE codigo_externo IS NOT NULL;

      ALTER TABLE recebimentos ADD COLUMN codigo_externo TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recebimentos_codigo_externo
        ON recebimentos (tenant_id, codigo_externo) WHERE codigo_externo IS NOT NULL;

      ALTER TABLE despesas ADD COLUMN codigo_externo TEXT;
      ALTER TABLE despesas ADD COLUMN fornecedor TEXT;
      ALTER TABLE despesas ADD COLUMN tipo_origem TEXT;
      ALTER TABLE despesas ADD COLUMN forma_pagamento_origem TEXT;
      ALTER TABLE despesas ADD COLUMN status_origem TEXT;
      ALTER TABLE despesas ADD COLUMN pedido_id INTEGER
        REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE SET NULL;
      ALTER TABLE despesas ADD COLUMN observacoes_origem TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_codigo_externo
        ON despesas (tenant_id, codigo_externo) WHERE codigo_externo IS NOT NULL;

      ALTER TABLE fluxo_capital ADD COLUMN codigo_externo TEXT;
      ALTER TABLE fluxo_capital ADD COLUMN afeta_caixa INTEGER NOT NULL DEFAULT 1
        CHECK (afeta_caixa IN (0, 1));
      ALTER TABLE fluxo_capital ADD COLUMN forma_origem_destino TEXT;
      ALTER TABLE fluxo_capital ADD COLUMN observacoes TEXT;
      ALTER TABLE fluxo_capital ADD COLUMN pedido_id INTEGER
        REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE SET NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fluxo_codigo_externo
        ON fluxo_capital (tenant_id, codigo_externo) WHERE codigo_externo IS NOT NULL;

      CREATE TABLE IF NOT EXISTS importacoes_planilha (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        nome_arquivo TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        arquivo_original BLOB NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente'
          CHECK (status IN ('Pendente', 'Importando', 'Concluida', 'Falhou')),
        relatorio_json TEXT NOT NULL,
        erro TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        concluido_em TEXT,
        UNIQUE (tenant_id, sha256),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_importacoes_planilha_status
        ON importacoes_planilha (tenant_id, status, criado_em DESC);

      CREATE TABLE IF NOT EXISTS importacao_linhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        importacao_id INTEGER NOT NULL,
        aba TEXT NOT NULL,
        linha INTEGER NOT NULL,
        codigo_externo TEXT,
        entidade TEXT,
        entidade_id INTEGER,
        dados_json TEXT NOT NULL,
        UNIQUE (importacao_id, aba, linha),
        FOREIGN KEY (importacao_id) REFERENCES importacoes_planilha (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_importacao_linhas_entidade
        ON importacao_linhas (importacao_id, entidade, entidade_id);
    `,
  },
  {
    version: 4,
    name: 'parcelamento_contas_pagar',
    sql: `
      ALTER TABLE despesas ADD COLUMN grupo_parcelamento TEXT;
      ALTER TABLE despesas ADD COLUMN numero_parcela INTEGER NOT NULL DEFAULT 1
        CHECK (numero_parcela > 0);
      ALTER TABLE despesas ADD COLUMN total_parcelas INTEGER NOT NULL DEFAULT 1
        CHECK (total_parcelas BETWEEN 1 AND 120);
      ALTER TABLE despesas ADD COLUMN forma_pagamento TEXT;

      CREATE INDEX IF NOT EXISTS idx_despesas_parcelamento
        ON despesas (tenant_id, grupo_parcelamento, numero_parcela);
      CREATE INDEX IF NOT EXISTS idx_despesas_vencimento
        ON despesas (tenant_id, vencimento_em, pago_em, estornada_em);
    `,
  },
]

/** @param {import('better-sqlite3').Database} db */
export function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `)

  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
  const markApplied = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')

  const applyOne = db.transaction((migration) => {
      // Revalida já sob bloqueio de escrita para evitar corrida entre workers.
      if (applied.get(migration.version)) return
      db.exec(migration.sql)
      markApplied.run(migration.version, migration.name)
  })

  for (const migration of migrations) {
    applyOne.immediate(migration)
  }
}
