import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getClientesLista } from '@/app/actions/clientes'
import { getFilamentosLista } from '@/app/actions/filamentos'
import { getInsumosLista } from '@/app/actions/insumos'
import { getConfiguracoes } from '@/app/actions/configuracoes'
import { getPedidoParaDuplicar } from '@/app/actions/pedidos'
import { OrcamentoPage } from '@/app/components/OrcamentoPage'

export const metadata: Metadata = { title: 'Duplicar pedido - Salge 3D' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pedidoId = Number(id)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) notFound()

  const [pedido, clientes, filamentos, insumos, config] = await Promise.all([
    getPedidoParaDuplicar(pedidoId),
    getClientesLista(),
    getFilamentosLista(),
    getInsumosLista(),
    getConfiguracoes(),
  ])
  if (!pedido) notFound()

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
          <span>Workspace</span><span>/</span><span>Orçamentos</span><span>/</span><span className="text-white/65">Duplicar</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">Duplicar pedido</h1>
      </div>
      <OrcamentoPage
        clientes={clientes}
        filamentos={filamentos}
        insumosList={insumos}
        taxaOperacional={config.taxa_operacional}
        custoHoraMaquina={config.custo_hora_maquina}
        tarifaEnergia={config.tarifa_energia_kwh}
        potenciaW={config.potencia_impressora_w}
        pedidoInicial={pedido}
      />
    </div>
  )
}
