import { NextResponse } from "next/server";
import { getSessaoAtual } from "@/lib/session";
import { obterMonitoramentoBambu } from "@/lib/bambu-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessaoAtual();
  if (!session)
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const monitors = obterMonitoramentoBambu(session.tenantId);
  return NextResponse.json(
    { impressoras: monitors },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
