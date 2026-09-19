import { NextResponse } from "next/server";
import { accountStatement, agingReport, cashFlow, changesInEquity, generalLedger, reportDates, statementReport, trialBalance, vatReport } from "@/lib/financial-reports";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, report = params.get("report")?.toLowerCase(), { from, to } = reportDates(params);
    if (report === "ar-aging") return NextResponse.json(await agingReport("AR", to ?? new Date()));
    if (report === "ap-aging") return NextResponse.json(await agingReport("AP", to ?? new Date()));
    if (report === "trial-balance") return NextResponse.json(await trialBalance(from, to));
    if (report === "general-ledger") return NextResponse.json(await generalLedger(params));
    if (report === "account-statement") return NextResponse.json(await accountStatement(params));
    if (report === "statements") return NextResponse.json(await statementReport(from, to));
    if (report === "changes-in-equity") return NextResponse.json(await changesInEquity(from, to));
    if (report === "cash-flow") return NextResponse.json(await cashFlow(from, to));
    if (report === "vat") return NextResponse.json(await vatReport(from, to));
    return NextResponse.json({ error: "نوع التقرير غير معروف" }, { status: 400 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "تعذر إعداد التقرير المالي" }, { status: 500 }); }
}
