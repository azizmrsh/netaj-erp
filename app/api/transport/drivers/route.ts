import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "TRANSPORT", action: "READ" });
    const drivers = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.driver.findMany({
      include: { documents: { orderBy: { expiryDate: "asc" } } },
      orderBy: { name: "asc" },
    }));
    return NextResponse.json(drivers);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل السائقين" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "TRANSPORT", action: "CREATE" });
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "اسم السائق مطلوب" }, { status: 400 });
    }
    const driver = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.driver.create({
      data: {
        name,
        idNumber: String(body.idNumber ?? "").trim() || null,
        idExpiry: dateOrNull(body.idExpiry),
        phone: String(body.phone ?? "").trim() || null,
        nationality: String(body.nationality ?? "").trim() || null,
        licenseNumber: String(body.licenseNumber ?? "").trim() || null,
        licenseCategory: String(body.licenseCategory ?? "").trim() || null,
        licenseIssueDate: dateOrNull(body.licenseIssueDate),
        licenseExpiry: dateOrNull(body.licenseExpiry),
        passportNumber: String(body.passportNumber ?? "").trim() || null,
        passportExpiry: dateOrNull(body.passportExpiry),
        driverCardNumber: String(body.driverCardNumber ?? "").trim() || null,
        driverCardExpiry: dateOrNull(body.driverCardExpiry),
        medicalExpiry: dateOrNull(body.medicalExpiry),
        employmentStatus: String(body.employmentStatus ?? "ACTIVE").trim().toUpperCase(),
        joiningDate: dateOrNull(body.joiningDate),
        tripWage: numberOrNull(body.tripWage) ?? 0,
        notes: String(body.notes ?? "").trim() || null,
      },
      include: { documents: true },
    }));
    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر إضافة السائق؛ تحقق من رقم الهوية" }, { status: 400 });
  }
}
