import { type NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/server/auth/session";
import { EXPORTS, type ExportKind, buildExport } from "@/server/services/export";
import { logger, newErrorId } from "@/server/logger";
import { TOO_MANY, hit } from "@/server/rate-limit";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/export/[report]">) {
  const { report } = await params;
  if (!EXPORTS.includes(report as ExportKind)) return NextResponse.json({ error: "Relatório inválido." }, { status: 404 });
  const ctx = await requireTenant();
  if (!(await hit("exportUser", ctx.userId))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  try {
    const sp = request.nextUrl.searchParams;
    const { filename, csv } = await buildExport(ctx, report as ExportKind, {
      de: sp.get("de") ?? undefined,
      ate: sp.get("ate") ?? undefined,
      mes: sp.get("mes") ?? undefined,
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const errorId = newErrorId();
    logger.error("export.failed", { report, errorId, err });
    return NextResponse.json({ error: `Não foi possível gerar o arquivo (código ${errorId}).` }, { status: 500 });
  }
}
