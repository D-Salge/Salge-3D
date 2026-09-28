import { createHmac, timingSafeEqual } from 'node:crypto'
import db from '@/lib/db'
import { configuracaoWhatsApp, traduzirStatusWebhook } from '@/lib/whatsapp-cloud.mjs'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const config = configuracaoWhatsApp()
  const modo = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const desafio = request.nextUrl.searchParams.get('hub.challenge')
  if (modo === 'subscribe' && config.verifyToken && token === config.verifyToken && desafio) {
    return new NextResponse(desafio, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new NextResponse('Verificação recusada', { status: 403 })
}

function assinaturaValida(corpo: string, assinatura: string | null, segredo: string) {
  if (!assinatura?.startsWith('sha256=') || !segredo) return false
  const recebida = Buffer.from(assinatura.slice(7), 'hex')
  const esperada = Buffer.from(createHmac('sha256', segredo).update(corpo).digest('hex'), 'hex')
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
}

type StatusWebhook = { id?: string; status?: string; errors?: Array<{ title?: string; message?: string }> }

export async function POST(request: NextRequest) {
  const config = configuracaoWhatsApp()
  const corpo = await request.text()
  if (!assinaturaValida(corpo, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return new NextResponse('Assinatura inválida', { status: 401 })
  }
  let payload: {
    object?: string
    entry?: Array<{ changes?: Array<{ value?: { statuses?: StatusWebhook[] } }> }>
  }
  try { payload = JSON.parse(corpo) } catch { return new NextResponse('JSON inválido', { status: 400 }) }
  if (payload.object !== 'whatsapp_business_account') return NextResponse.json({ received: true })
  const statuses = payload.entry?.flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.statuses || []) || []
  const atualizar = db.transaction((itens: StatusWebhook[]) => {
    for (const item of itens) {
      if (!item.id) continue
      const status = traduzirStatusWebhook(item.status)
      if (!status) continue
      const erro = item.errors?.map((e) => e.title || e.message).filter(Boolean).join('; ').slice(0, 500) || null
      db.prepare(`UPDATE whatsapp_envios SET status = ?, erro = ?,
        entregue_em = CASE WHEN ? IN ('Entregue', 'Lido') THEN COALESCE(entregue_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) ELSE entregue_em END,
        lido_em = CASE WHEN ? = 'Lido' THEN COALESCE(lido_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) ELSE lido_em END
        WHERE wamid = ?`
      ).run(status, erro, status, status, item.id)
    }
  })
  atualizar(statuses)
  return NextResponse.json({ received: true })
}

