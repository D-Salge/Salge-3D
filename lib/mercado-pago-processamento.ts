import db from '@/lib/db'
import { processarPagamentoMercadoPagoNoBanco } from '@/lib/mercado-pago-processamento-db.mjs'

export type PagamentoMercadoPago = {
  id: number
  status: string
  status_detail?: string
  external_reference?: string
  transaction_amount?: number
  payment_method_id?: string
  payment_type_id?: string
  date_approved?: string
  transaction_details?: { net_received_amount?: number }
  fee_details?: Array<{ type?: string; amount?: number }>
}

export type ResultadoProcessamentoMercadoPago = {
  duplicado: boolean
  status: string
  valor: number | null
}

export function processarPagamentoMercadoPago(
  pagamento: PagamentoMercadoPago,
  payload: unknown,
  acao: string | null,
): ResultadoProcessamentoMercadoPago {
  return processarPagamentoMercadoPagoNoBanco(
    db,
    pagamento,
    payload,
    acao,
  ) as ResultadoProcessamentoMercadoPago
}
