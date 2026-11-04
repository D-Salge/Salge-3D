// This module writes only integration configuration and the explicit monitoring link.
// It never changes production, stock, costs, payments or printer operational status.
export function listarConfiguracoesBambu(db, tenantId) {
  return db
    .prepare(
      `SELECT b.*, i.nome FROM impressoras_bambu b JOIN impressoras i
    ON i.id = b.impressora_id AND i.tenant_id = b.tenant_id
    WHERE b.tenant_id = ? AND b.ativo = 1 AND i.ativo = 1 ORDER BY i.nome`,
    )
    .all(tenantId);
}

export function salvarConfiguracaoBambu(db, tenantId, input) {
  return db
    .transaction(() => {
      if (
        !db
          .prepare(
            "SELECT id FROM impressoras WHERE id = ? AND tenant_id = ? AND ativo = 1",
          )
          .get(input.impressoraId, tenantId)
      )
        throw new Error("IMPRESSORA_NAO_ENCONTRADA");
      const duplicate = db
        .prepare(
          "SELECT impressora_id FROM impressoras_bambu WHERE tenant_id = ? AND serial = ? AND impressora_id != ?",
        )
        .get(tenantId, input.serial, input.impressoraId);
      if (duplicate) throw new Error("SERIAL_JA_VINCULADO");
      db.prepare(
        `INSERT INTO impressoras_bambu(tenant_id, impressora_id, host, serial, codigo_cifrado)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, impressora_id) DO UPDATE SET
      host=excluded.host, serial=excluded.serial, codigo_cifrado=excluded.codigo_cifrado, ativo=1,
      atualizado_em=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
      ).run(
        tenantId,
        input.impressoraId,
        input.host,
        input.serial,
        input.codigoCifrado,
      );
      db.prepare(
        "DELETE FROM impressoras_bambu_vinculos WHERE tenant_id = ? AND impressora_id = ?",
      ).run(tenantId, input.impressoraId);
    })
    .immediate();
}

export function opcoesLotesBambu(db, tenantId, impressoraId) {
  return db
    .prepare(
      `SELECT l.id, l.codigo, l.pedido_id AS pedidoId, p.nome_da_peca AS nome,
    l.placa_referencia AS referencia, p.numero_orcamento AS pedido
    FROM lotes_producao l JOIN pedidos p ON p.id = l.pedido_id AND p.tenant_id = l.tenant_id
    WHERE l.tenant_id = ? AND (l.impressora_id = ? OR l.impressora_id IS NULL)
    AND l.status IN ('Planejado','Imprimindo') AND p.orcamento_status = 'Aprovado'
    AND p.status NOT IN ('Finalizado','Cancelado') ORDER BY l.id DESC LIMIT 100`,
    )
    .all(tenantId, impressoraId);
}

export function vincularLoteBambu(db, tenantId, input) {
  return db
    .transaction(() => {
      const config = listarConfiguracoesBambu(db, tenantId).find(
        (c) => c.impressora_id === input.impressoraId,
      );
      if (!config) throw new Error("IMPRESSORA_NAO_ENCONTRADA");
      if (
        !opcoesLotesBambu(db, tenantId, input.impressoraId).some(
          (l) => l.id === input.loteId,
        )
      )
        throw new Error("LOTE_INVALIDO");
      db.prepare(
        `INSERT INTO impressoras_bambu_vinculos(tenant_id, impressora_id, lote_id, referencia_execucao, job_key)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, impressora_id) DO UPDATE SET
      lote_id=excluded.lote_id, referencia_execucao=excluded.referencia_execucao, job_key=excluded.job_key,
      criado_em=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
      ).run(
        tenantId,
        input.impressoraId,
        input.loteId,
        input.referencia,
        input.jobKey,
      );
    })
    .immediate();
}

export function obterVinculoBambu(db, tenantId, impressoraId) {
  return (
    db
      .prepare(
        `SELECT v.lote_id AS loteId, v.referencia_execucao AS referencia, v.job_key AS jobKey,
    l.codigo, p.nome_da_peca AS nome, l.pedido_id AS pedidoId, p.numero_orcamento AS pedido
    FROM impressoras_bambu_vinculos v JOIN lotes_producao l ON l.id = v.lote_id AND l.tenant_id = v.tenant_id
    JOIN pedidos p ON p.id = l.pedido_id AND p.tenant_id = l.tenant_id
    WHERE v.tenant_id = ? AND v.impressora_id = ? AND l.status != 'Cancelado' AND p.status != 'Cancelado'
    AND (l.impressora_id = v.impressora_id OR l.impressora_id IS NULL)`,
      )
      .get(tenantId, impressoraId) ?? null
  );
}
