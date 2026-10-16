function Bloco({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.055] ${className}`} />
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10" role="status" aria-label="Carregando página">
      <div className="mb-8 space-y-3">
        <Bloco className="h-3 w-36" />
        <Bloco className="h-9 w-64 max-w-[75vw]" />
        <Bloco className="h-4 w-96 max-w-full" />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, indice) => <Bloco key={indice} className="h-36" />)}
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-[#15171b] p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-3"><Bloco className="size-9" /><div className="flex-1 space-y-2"><Bloco className="h-4 w-44" /><Bloco className="h-3 w-64 max-w-full" /></div></div>
        <div className="space-y-3">{Array.from({ length: 5 }, (_, indice) => <Bloco key={indice} className="h-12" />)}</div>
      </div>
      <span className="sr-only">Carregando informações do ERP.</span>
    </div>
  )
}

