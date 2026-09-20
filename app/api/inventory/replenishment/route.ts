import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

/** Read-only replenishment suggestions. It considers company-owned stock only;
 * customer-owned balances are never silently mixed into procurement signals. */
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "INVENTORY", action: "READ" });
    const rows = await prisma.item.findMany({
      where: { tenantId: auth.tenantId, companyId: auth.companyId, isActive: true, minimumStock: { gt: 0 } },
      include: { unit: true, category: true, companyStock: true },
      orderBy: { nameAr: "asc" },
    });
    const suggestions = rows.map((item) => {
      const current = Number(item.companyStock?.quantity ?? 0);
      const minimum = Number(item.minimumStock);
      return { itemId: item.id, code: item.code, nameAr: item.nameAr, nameEn: item.nameEn, unit: item.unit.nameAr, category: item.category?.nameAr ?? null, currentQuantity: current, minimumStock: minimum, suggestedQuantity: Math.max(0, minimum - current), status: current <= 0 ? "OUT_OF_STOCK" : current < minimum ? "REORDER" : "OK" };
    }).filter((row) => row.status !== "OK");
    return NextResponse.json({ generatedAt: new Date().toISOString(), ownership: "COMPANY", suggestions, summary: { count: suggestions.length, outOfStock: suggestions.filter((row) => row.status === "OUT_OF_STOCK").length } });
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); return NextResponse.json({ error: "تعذر تحميل اقتراحات إعادة التوريد" }, { status: 500 });
  }
}
