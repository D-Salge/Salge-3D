import { NextRequest, NextResponse } from 'next/server'
import {
  configuracaoMercadoPago,
  consultarPagamentoMercadoPago,
  validarAssinaturaMercadoPago,
} from '@/lib/mercado-pago.mjs'
import {
  processarPagamentoMercadoPago,
  type PagamentoMercadoPago,
} from '@/lib/mercado-pago-processamento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const config = configuracaoMercadoPago()
  if (!config.configurado) return NextResponse.json({ error: 'integration_not_configured' }, { status: 503 })
  const dataId = request.nextUrl.searchParams.get('data.id') || request.nextUrl.searchParams.get('id')
  const tipoQuery = request.nextUrl.searchParams.get('type') || request.nextUrl.searchParams.get('topic')
  const assinatura = request.headers.get('x-signature')
  const requestId = request.headers.get('x-request-id')
  if (!dataId || !validarAssinaturaMercadoPago({ assinatura, requestId, dataId, secret: config.webhookSecret })) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }
  const payload = await request.json().catch(() => ({})) as { type?: string; action?: string; data?: { id?: string | number } }
  const tipo = tipoQuery || payload.type
  if (tipo !== 'payment') return NextResponse.json({ received: true, ignored: true })
  try {
    const pagamento = await consultarPagamentoMercadoPago(dataId, config.accessToken) as PagamentoMercadoPago
    processarPagamentoMercadoPago(pagamento, payload, payload.action || null)
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[webhook-mercado-pago]', error)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
