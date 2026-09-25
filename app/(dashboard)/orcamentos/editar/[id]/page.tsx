import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getClientesLista } from '@/app/actions/clientes'
import { getConfiguracoes } from '@/app/actions/configuracoes'
import { getFilamentosLista } from '@/app/actions/filamentos'
import { getInsumosLista } from '@/app/actions/insumos'
import { getImpressoras } from '@/app/actions/operacao'
import { getPedidoParaDuplicar, getReferenciasPrecos } from '@/app/actions/pedidos'
import { OrcamentoPage } from '@/app/components/OrcamentoPage'

export const metadata: Metadata = { title: 'Editar orçamento - Salge 3D' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pedidoId = Number(id)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) notFound()

  const [pedido, clientes, filamentos, insumos, config, impressoras, referenciasPrecos] = await Promise.all([
    getPedidoParaDuplicar(pedidoId),
    getClientesLista(),
    getFilamentosLista(),
    getInsumosLista(),
    getConfiguracoes(),
    getImpressoras(),
    getReferenciasPrecos(),
  ])
  if (!pedido || !['Rascunho', 'Enviado'].includes(pedido.orcamento_status)) notFound()

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
          <span>Workspace</span><span>/</span><span>Orçamentos</span><span>/</span><span className="text-white/65">Editar</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">Editar orçamento</h1>
      </div>
      <OrcamentoPage
        clientes={clientes}
        filamentos={filamentos}
        insumosList={insumos}
        impressoras={impressoras}
        custoHoraMaquina={config.custo_hora_maquina}
        tarifaEnergia={config.tarifa_energia_kwh}
        potenciaW={config.potencia_impressora_w}
        margemPerdasPadrao={config.margem_perdas_padrao}
        taxaVenda={config.taxa_venda_padrao}
        valorHoraTrabalho={config.valor_hora_trabalho}
        fatorB2CPersonalizado={config.fator_b2c_personalizado}
        fatorB2BPiloto={config.fator_b2b_piloto}
        fatorB2BRecorrente={config.fator_b2b_recorrente}
        pedidoMinimoB2B={config.pedido_minimo_b2b}
        referenciasPrecos={referenciasPrecos}
        clienteInicialId={pedido.cliente_id}
        pedidoInicial={pedido}
        pedidoEdicaoId={pedidoId}
      />
    </div>
  )
}
