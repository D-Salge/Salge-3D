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
  {
    version: 5,
    name: 'modelos_orcamento',
    sql: `
      CREATE TABLE IF NOT EXISTS modelos_orcamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (tenant_id, nome COLLATE NOCASE),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_modelos_orcamento_tenant
        ON modelos_orcamento (tenant_id, ativo, atualizado_em DESC);

      CREATE TRIGGER IF NOT EXISTS trg_modelos_orcamento_atualizado_em
      AFTER UPDATE ON modelos_orcamento FOR EACH ROW BEGIN
        UPDATE modelos_orcamento
        SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 6,
    name: 'entradas_calculo_orcamento',
    sql: `
      ALTER TABLE pedidos ADD COLUMN materiais_avulsos_por_unidade REAL NOT NULL DEFAULT 0
        CHECK (materiais_avulsos_por_unidade >= 0);
      ALTER TABLE pedidos ADD COLUMN horas_trabalho_ativo REAL NOT NULL DEFAULT 0
        CHECK (horas_trabalho_ativo >= 0);
      ALTER TABLE pedidos ADD COLUMN setup_projeto REAL NOT NULL DEFAULT 0
        CHECK (setup_projeto >= 0);
      ALTER TABLE pedidos ADD COLUMN margem_perdas REAL NOT NULL DEFAULT 0.1
        CHECK (margem_perdas BETWEEN 0 AND 1);
    `,
  },
  {
    version: 7,
    name: 'manutencao_qualidade_impressoras',
    sql: `
      ALTER TABLE impressoras ADD COLUMN bico_atual TEXT;
      ALTER TABLE impressoras ADD COLUMN horas_base REAL NOT NULL DEFAULT 0
        CHECK (horas_base >= 0);
      ALTER TABLE impressoras ADD COLUMN intervalo_manutencao_horas REAL NOT NULL DEFAULT 250
        CHECK (intervalo_manutencao_horas > 0);

      CREATE TABLE IF NOT EXISTS manutencoes_impressora (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        impressora_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        despesa_id INTEGER,
        tipo TEXT NOT NULL CHECK (tipo IN (
          'Preventiva', 'Limpeza', 'Lubrificacao', 'Troca de bico',
          'Calibracao', 'Corretiva', 'Outro'
        )),
        descricao TEXT,
        custo REAL NOT NULL DEFAULT 0 CHECK (custo >= 0),
        horas_no_momento REAL NOT NULL CHECK (horas_no_momento >= 0),
        realizada_em TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (impressora_id) REFERENCES impressoras (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (despesa_id) REFERENCES despesas (id) ON UPDATE CASCADE ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_manutencoes_impressora_data
        ON manutencoes_impressora (tenant_id, impressora_id, realizada_em DESC, id DESC);
    `,
  },
  {
    version: 8,
    name: 'despesas_recorrentes_e_central_pendencias',
    sql: `
      CREATE TABLE IF NOT EXISTS despesas_recorrentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        categoria TEXT NOT NULL CHECK (categoria IN (
          'Filamentos', 'Insumos', 'Equipamento', 'Energia', 'Marketing',
          'Software', 'Manutencao', 'Embalagens', 'Frete', 'Outros'
        )),
        descricao TEXT NOT NULL,
        valor REAL NOT NULL CHECK (valor > 0),
        dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
        forma_pagamento TEXT NOT NULL,
        paga_automaticamente INTEGER NOT NULL DEFAULT 0 CHECK (paga_automaticamente IN (0, 1)),
        inicia_em TEXT NOT NULL,
        termina_em TEXT,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_despesas_recorrentes_ativas
        ON despesas_recorrentes (tenant_id, ativo, inicia_em, termina_em);

      ALTER TABLE despesas ADD COLUMN despesa_recorrente_id INTEGER
        REFERENCES despesas_recorrentes (id) ON UPDATE CASCADE ON DELETE SET NULL;
      ALTER TABLE despesas ADD COLUMN competencia_chave TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_recorrencia_competencia
        ON despesas (despesa_recorrente_id, competencia_chave)
        WHERE despesa_recorrente_id IS NOT NULL AND competencia_chave IS NOT NULL;

      CREATE TRIGGER IF NOT EXISTS trg_despesas_recorrentes_atualizado_em
      AFTER UPDATE ON despesas_recorrentes FOR EACH ROW BEGIN
        UPDATE despesas_recorrentes
        SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 9,
    name: 'metas_e_relatorios_gerenciais',
    sql: `
      ALTER TABLE tenants ADD COLUMN meta_lucro_mensal REAL NOT NULL DEFAULT 0
        CHECK (meta_lucro_mensal >= 0);
      ALTER TABLE tenants ADD COLUMN meta_pedidos_mensal INTEGER NOT NULL DEFAULT 0
        CHECK (meta_pedidos_mensal >= 0);
      ALTER TABLE tenants ADD COLUMN dias_cliente_inativo INTEGER NOT NULL DEFAULT 60
        CHECK (dias_cliente_inativo BETWEEN 1 AND 3650);
    `,
  },
  {
    version: 10,
    name: 'agenda_followup_e_pos_venda',
    sql: `
      ALTER TABLE tenants ADD COLUMN dias_followup_orcamento INTEGER NOT NULL DEFAULT 2
        CHECK (dias_followup_orcamento BETWEEN 1 AND 30);
      ALTER TABLE tenants ADD COLUMN dias_pos_venda INTEGER NOT NULL DEFAULT 3
        CHECK (dias_pos_venda BETWEEN 1 AND 90);

      CREATE TABLE IF NOT EXISTS tarefas_agenda (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        pedido_id INTEGER,
        cliente_id INTEGER,
        tipo TEXT NOT NULL DEFAULT 'Outro'
          CHECK (tipo IN ('Entrega', 'Cobranca', 'Follow-up', 'Pos-venda', 'Outro')),
        titulo TEXT NOT NULL,
        descricao TEXT,
        vencimento_em TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendente'
          CHECK (status IN ('Pendente', 'Concluida', 'Cancelada')),
        concluida_em TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON UPDATE CASCADE ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tarefas_agenda_pendentes
        ON tarefas_agenda (tenant_id, status, vencimento_em, id);

      CREATE TABLE IF NOT EXISTS avaliacoes_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
        comentario TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (tenant_id, pedido_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_avaliacoes_pedido_nota
        ON avaliacoes_pedido (tenant_id, nota, criado_em DESC);

      CREATE TRIGGER IF NOT EXISTS trg_tarefas_agenda_atualizado_em
      AFTER UPDATE ON tarefas_agenda FOR EACH ROW BEGIN
        UPDATE tarefas_agenda SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_avaliacoes_pedido_atualizado_em
      AFTER UPDATE ON avaliacoes_pedido FOR EACH ROW BEGIN
        UPDATE avaliacoes_pedido SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 11,
    name: 'producao_e_entregas_parciais',
    sql: `
      ALTER TABLE pedidos ADD COLUMN quantidade_produzida REAL NOT NULL DEFAULT 0
        CHECK (quantidade_produzida >= 0);
      UPDATE pedidos SET quantidade_produzida = quantidade WHERE status = 'Finalizado';

      CREATE TABLE IF NOT EXISTS entregas_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        recebimento_id INTEGER,
        quantidade REAL NOT NULL CHECK (quantidade > 0),
        valor_referente REAL NOT NULL DEFAULT 0 CHECK (valor_referente >= 0),
        entregue_em TEXT NOT NULL,
        observacao TEXT,
        cancelada_em TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (recebimento_id) REFERENCES recebimentos (id) ON UPDATE CASCADE ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entregas_pedido
        ON entregas_pedido (pedido_id, cancelada_em, entregue_em, id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entregas_recebimento
        ON entregas_pedido (recebimento_id) WHERE recebimento_id IS NOT NULL;
    `,
  },
  {
    version: 12,
    name: 'compras_e_fornecedores',
    sql: `
      CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        documento TEXT,
        telefone TEXT,
        email TEXT,
        site TEXT,
        observacoes TEXT,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (tenant_id, nome),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_fornecedores_tenant ON fornecedores (tenant_id, ativo, nome);

      CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        fornecedor_id INTEGER NOT NULL,
        numero TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pedido'
          CHECK (status IN ('Pedido', 'Recebido', 'Cancelado')),
        pedido_em TEXT NOT NULL,
        previsao_entrega TEXT,
        recebido_em TEXT,
        frete REAL NOT NULL DEFAULT 0 CHECK (frete >= 0),
        desconto REAL NOT NULL DEFAULT 0 CHECK (desconto >= 0),
        forma_pagamento TEXT NOT NULL,
        vencimento_em TEXT NOT NULL,
        pago_em TEXT,
        observacoes TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (tenant_id, numero),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_compras_status ON compras (tenant_id, status, pedido_em DESC);

      CREATE TABLE IF NOT EXISTS compra_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compra_id INTEGER NOT NULL,
        tipo_item TEXT NOT NULL CHECK (tipo_item IN ('Filamento', 'Insumo')),
        item_id INTEGER NOT NULL,
        quantidade_volumes REAL NOT NULL CHECK (quantidade_volumes > 0),
        quantidade_estoque REAL NOT NULL CHECK (quantidade_estoque > 0),
        valor_total REAL NOT NULL CHECK (valor_total > 0),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (compra_id) REFERENCES compras (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_compra_itens_item
        ON compra_itens (tipo_item, item_id, compra_id);

      ALTER TABLE despesas ADD COLUMN compra_id INTEGER
        REFERENCES compras (id) ON UPDATE CASCADE ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_despesas_compra ON despesas (compra_id);

      CREATE TRIGGER IF NOT EXISTS trg_fornecedores_atualizado_em
      AFTER UPDATE ON fornecedores FOR EACH ROW BEGIN
        UPDATE fornecedores SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
      END;
      CREATE TRIGGER IF NOT EXISTS trg_compras_atualizado_em
      AFTER UPDATE ON compras FOR EACH ROW BEGIN
        UPDATE compras SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 13,
    name: 'compras_parceladas_e_fornecedores_legados',
    sql: `
      ALTER TABLE compras ADD COLUMN parcelas INTEGER NOT NULL DEFAULT 1
        CHECK (parcelas BETWEEN 1 AND 120);

      INSERT OR IGNORE INTO fornecedores (tenant_id, usuario_id, nome)
      SELECT tenant_id, 1, TRIM(fornecedor) FROM filamentos
      WHERE fornecedor IS NOT NULL AND TRIM(fornecedor) <> '';
      INSERT OR IGNORE INTO fornecedores (tenant_id, usuario_id, nome)
      SELECT tenant_id, 1, TRIM(fornecedor) FROM insumos
      WHERE fornecedor IS NOT NULL AND TRIM(fornecedor) <> '';
      INSERT OR IGNORE INTO fornecedores (tenant_id, usuario_id, nome)
      SELECT tenant_id, 1, TRIM(fornecedor) FROM despesas
      WHERE fornecedor IS NOT NULL AND TRIM(fornecedor) <> '';
    `,
  },
  {
    version: 14,
    name: 'catalogo_qualidade_e_expedicao',
    sql: `
      CREATE TABLE IF NOT EXISTS produtos_catalogo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        nome_chave TEXT NOT NULL,
        categoria TEXT,
        descricao TEXT,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (tenant_id, codigo),
        UNIQUE (tenant_id, nome_chave),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_produtos_catalogo ON produtos_catalogo (tenant_id, ativo, nome);

      CREATE TABLE IF NOT EXISTS produto_versoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL,
        versao INTEGER NOT NULL CHECK (versao > 0),
        preco_base_unitario REAL NOT NULL DEFAULT 0 CHECK (preco_base_unitario >= 0),
        tempo_impressao_horas_unidade REAL NOT NULL DEFAULT 0 CHECK (tempo_impressao_horas_unidade >= 0),
        observacoes TEXT,
        pedido_origem_id INTEGER,
        ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE (produto_id, versao),
        FOREIGN KEY (produto_id) REFERENCES produtos_catalogo (id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (pedido_origem_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_produto_versoes_ativa ON produto_versoes (produto_id, ativa, versao DESC);

      CREATE TABLE IF NOT EXISTS produto_versao_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        versao_id INTEGER NOT NULL,
        tipo_item TEXT NOT NULL CHECK (tipo_item IN ('Filamento', 'Insumo')),
        item_id INTEGER NOT NULL,
        quantidade_por_unidade REAL NOT NULL CHECK (quantidade_por_unidade > 0),
        UNIQUE (versao_id, tipo_item, item_id),
        FOREIGN KEY (versao_id) REFERENCES produto_versoes (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_produto_versao_itens ON produto_versao_itens (versao_id, tipo_item);

      ALTER TABLE pedidos ADD COLUMN produto_id INTEGER
        REFERENCES produtos_catalogo (id) ON UPDATE CASCADE ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_pedidos_produto ON pedidos (tenant_id, produto_id, data_pedido DESC);

      INSERT OR IGNORE INTO produtos_catalogo (
        tenant_id, usuario_id, codigo, nome, nome_chave, categoria
      )
      SELECT p.tenant_id, 1, 'PRD-' || printf('%06d', MIN(p.id)), TRIM(p.nome_da_peca),
        LOWER(TRIM(p.nome_da_peca)), 'Personalizado'
      FROM pedidos p
      WHERE TRIM(p.nome_da_peca) <> ''
      GROUP BY p.tenant_id, LOWER(TRIM(p.nome_da_peca));

      UPDATE pedidos SET produto_id = (
        SELECT pc.id FROM produtos_catalogo pc
        WHERE pc.tenant_id = pedidos.tenant_id
          AND pc.nome_chave = LOWER(TRIM(pedidos.nome_da_peca))
      ) WHERE produto_id IS NULL;

      INSERT INTO produto_versoes (
        produto_id, versao, preco_base_unitario, tempo_impressao_horas_unidade,
        observacoes, pedido_origem_id
      )
      SELECT pc.id, 1, COALESCE(p.preco_unitario, p.valor_total_cobrado / MAX(p.quantidade, 1)),
        p.tempo_impressao_horas / MAX(p.quantidade, 1),
        'Ficha inicial criada automaticamente pelo histórico de pedidos', p.id
      FROM produtos_catalogo pc
      JOIN pedidos p ON p.id = (
        SELECT p2.id FROM pedidos p2
        WHERE p2.tenant_id = pc.tenant_id AND p2.produto_id = pc.id
        ORDER BY p2.data_pedido DESC, p2.id DESC LIMIT 1
      )
      WHERE NOT EXISTS (SELECT 1 FROM produto_versoes pv WHERE pv.produto_id = pc.id);

      INSERT OR IGNORE INTO produto_versao_itens (versao_id, tipo_item, item_id, quantidade_por_unidade)
      SELECT pv.id, 'Filamento', pf.filamento_id, pf.peso_gasto_gramas / MAX(p.quantidade, 1)
      FROM produto_versoes pv
      JOIN pedidos p ON p.id = pv.pedido_origem_id
      JOIN pedido_filamentos pf ON pf.pedido_id = p.id;
      INSERT OR IGNORE INTO produto_versao_itens (versao_id, tipo_item, item_id, quantidade_por_unidade)
      SELECT pv.id, 'Insumo', pi.insumo_id, pi.quantidade / MAX(p.quantidade, 1)
      FROM produto_versoes pv
      JOIN pedidos p ON p.id = pv.pedido_origem_id
      JOIN pedido_insumos pi ON pi.pedido_id = p.id;

      CREATE TABLE IF NOT EXISTS ocorrencias_qualidade (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('Falha de impressão', 'Defeito', 'Devolução', 'Garantia', 'Reimpressão', 'Outro')),
        status TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta', 'Em análise', 'Resolvida', 'Cancelada')),
        acao TEXT NOT NULL DEFAULT 'Sem ação' CHECK (acao IN ('Reimprimir', 'Trocar', 'Estornar', 'Crédito', 'Sem ação')),
        quantidade REAL NOT NULL DEFAULT 1 CHECK (quantidade > 0),
        custo_estimado REAL NOT NULL DEFAULT 0 CHECK (custo_estimado >= 0),
        descricao TEXT NOT NULL,
        resolucao TEXT,
        prazo_em TEXT,
        resolvida_em TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ocorrencias_qualidade ON ocorrencias_qualidade (tenant_id, status, prazo_em, id DESC);

      CREATE TABLE IF NOT EXISTS expedicoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        entrega_id INTEGER,
        modalidade TEXT NOT NULL CHECK (modalidade IN ('Retirada', 'Entrega local', 'Transportadora', 'Correios', 'Outro')),
        transportadora TEXT,
        codigo_rastreio TEXT,
        url_rastreio TEXT,
        status TEXT NOT NULL DEFAULT 'Preparando' CHECK (status IN ('Preparando', 'Postado', 'Em trânsito', 'Entregue', 'Cancelada')),
        postado_em TEXT,
        previsao_entrega TEXT,
        entregue_em TEXT,
        custo REAL NOT NULL DEFAULT 0 CHECK (custo >= 0),
        observacoes TEXT,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (entrega_id) REFERENCES entregas_pedido (id) ON UPDATE CASCADE ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expedicoes_status ON expedicoes (tenant_id, status, previsao_entrega, id DESC);

      CREATE TRIGGER IF NOT EXISTS trg_produtos_catalogo_atualizado_em
      AFTER UPDATE ON produtos_catalogo FOR EACH ROW BEGIN
        UPDATE produtos_catalogo SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
      END;
      CREATE TRIGGER IF NOT EXISTS trg_ocorrencias_qualidade_atualizado_em
      AFTER UPDATE ON ocorrencias_qualidade FOR EACH ROW BEGIN
        UPDATE ocorrencias_qualidade SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
      END;
      CREATE TRIGGER IF NOT EXISTS trg_expedicoes_atualizado_em
      AFTER UPDATE ON expedicoes FOR EACH ROW BEGIN
        UPDATE expedicoes SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = OLD.id;
      END;
    `,
  },
  {
    version: 15,
    name: 'tarefas_de_reimpressao',
    sql: `
      ALTER TABLE ocorrencias_qualidade ADD COLUMN tarefa_id INTEGER
        REFERENCES tarefas_agenda (id) ON UPDATE CASCADE ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_ocorrencias_tarefa ON ocorrencias_qualidade (tarefa_id);
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
