import type { Prisma } from "@prisma/client";

const supportedCodes = new Set([
  "QT", "PI", "SO", "PR", "PO", "GRN", "DN", "TR", "TRC", "INV", "PV", "RV", "JE", "BT", "BR", "VAT", "CN", "DBN", "ADJ", "FXR", "BUD", "FT", "FF", "FM", "IC", "EMP", "EWR", "PAY", "ADV", "EWC", "XTR", "XCO", "XEX", "PRJ", "PCT", "PCO", "PPC", "SCT", "SCC", "LEAD", "OPP", "ASSET", "MWO", "DMS", "APR", "PRQ", "JOB",
]);

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  code: string,
  date = new Date()
) {
  const normalized = code.trim().toUpperCase();
  if (!supportedCodes.has(normalized)) {
    throw new Error(`Unsupported document number code: ${normalized}`);
  }
  const year = date.getFullYear();
  const sequence = await tx.documentSequence.upsert({
    where: { code_year: { code: normalized, year } },
    create: { code: normalized, year, currentValue: 1, padding: 6, prefix: normalized },
    update: { currentValue: { increment: 1 } },
  });
  return `${sequence.prefix}-${year}-${String(sequence.currentValue).padStart(
    sequence.padding,
    "0"
  )}`;
}
