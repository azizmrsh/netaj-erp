import type { Prisma } from "@prisma/client";

const supportedCodes = new Set([
  "QT", "PI", "SO", "PR", "PO", "GRN", "DN", "TR", "INV", "PV", "RV", "JE", "BT", "BR", "VAT", "FT", "FF", "FM", "EMP", "EWR", "PAY", "ADV", "EWC", "XTR", "XCO", "XEX",
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
