import Database from 'better-sqlite3'
import { aplicarMigracoesComBackup } from '../../lib/migracao-segura.mjs'

const [caminhoBanco, inicioInformado] = process.argv.slice(2)
const espera = Math.max(0, Number(inicioInformado) - Date.now())
if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera))

const db = new Database(caminhoBanco)
try {
  db.pragma('busy_timeout = 30000')
  const resultado = aplicarMigracoesComBackup(db, { caminhoBanco })
  console.log(JSON.stringify(resultado))
} finally {
  db.close()
}
