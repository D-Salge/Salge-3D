import Link from 'next/link'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import db from '@/lib/db'

export const metadata = { title: 'Pagamento · Salge 3D', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function RetornoPagamento({ searchParams }: {
  searchParams: Promise<{ resultado?: string; portal?: string; external_reference?: string }>
}) {
  const { resultado, portal, external_reference: externalReference } = await searchParams
  let portalToken = /^[a-f0-9]{48}$/.test(portal || '') ? portal! : null
  if (!portalToken && externalReference && externalReference.length <= 160) {
    const link = db.prepare(`
      SELECT pl.token FROM mercado_pago_cobrancas mc
      JOIN portal_links pl ON pl.tenant_id = mc.tenant_id AND pl.pedido_id = mc.pedido_id
      WHERE mc.external_reference = ? AND pl.revogado_em IS NULL
        AND datetime(pl.expira_em) > datetime('now')
      ORDER BY pl.id DESC LIMIT 1
    `).get(externalReference) as { token: string } | undefined
    portalToken = link?.token ?? null
  }
  const dados = resultado === 'sucesso'
    ? { Icone: CheckCircle2, titulo: 'Pagamento enviado', texto: 'A confirmação será registrada automaticamente no pedido.', cor: 'text-emerald-300' }
    : resultado === 'pendente'
      ? { Icone: Clock3, titulo: 'Pagamento em análise', texto: 'Assim que for aprovado, o pedido será atualizado automaticamente.', cor: 'text-amber-300' }
      : { Icone: XCircle, titulo: 'Pagamento não concluído', texto: 'Nenhuma baixa foi feita. Você pode tentar novamente pelo mesmo link.', cor: 'text-red-300' }
  return <main className="flex min-h-screen items-center justify-center bg-[#0d0e10] p-4 text-white"><section className="w-full max-w-md rounded-3xl border border-white/[0.09] bg-[#15171b] p-8 text-center shadow-2xl"><dados.Icone className={`mx-auto ${dados.cor}`} size={42} /><h1 className="mt-5 text-2xl font-semibold">{dados.titulo}</h1><p className="mt-3 text-sm leading-6 text-white/45">{dados.texto}</p><p className="mt-6 text-xs text-white/30">Você já pode fechar esta página e voltar à conversa com a Salge 3D.</p>{portalToken && <Link href={`/portal/${portalToken}`} className="mt-5 inline-block text-xs text-[#d8f45a]">Acompanhar meu pedido</Link>}</section></main>
}
