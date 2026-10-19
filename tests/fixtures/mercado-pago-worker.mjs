import Database from 'better-sqlite3'
import { processarPagamentoMercadoPagoNoBanco } from '../../lib/mercado-pago-processamento-db.mjs'

const [caminhoBanco, pagamentoBase64, inicioTexto] = process.argv.slice(2)
const pagamento = JSON.parse(Buffer.from(pagamentoBase64, 'base64url').toString('utf8'))
const espera = Math.max(0, Number(inicioTexto) - Date.now())
if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera))

const db = new Database(caminhoBanco)
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 10000')
try {
  const resultado = processarPagamentoMercadoPagoNoBanco(
    db,
    pagamento,
    { source: 'concurrency_test', payment_id: pagamento.id },
    'payment.updated',
  )
  process.stdout.write(JSON.stringify(resultado))
} finally {
  db.close()
}
