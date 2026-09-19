export type CommerceLine = {
  itemId: number;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
};

export class CommerceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceValidationError";
  }
}

function numberField(value: unknown, label: string, minimum = 0) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < minimum) {
    throw new CommerceValidationError(`${label} غير صحيح`);
  }
  return number;
}

export function parseCommerceLines(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CommerceValidationError("يجب إضافة بند واحد على الأقل");
  }

  return value.map((raw, index): CommerceLine => {
    if (!raw || typeof raw !== "object") {
      throw new CommerceValidationError(`البند ${index + 1} غير صحيح`);
    }
    const row = raw as Record<string, unknown>;
    const itemId = Number(row.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new CommerceValidationError(`مادة البند ${index + 1} غير صحيحة`);
    }
    const quantity = numberField(row.quantity, `كمية البند ${index + 1}`, 0.000001);
    const unitPrice = numberField(row.unitPrice, `سعر البند ${index + 1}`);
    const discount = numberField(row.discount, `خصم البند ${index + 1}`);
    const vatRate = numberField(row.vatRate ?? 15, `ضريبة البند ${index + 1}`);
    const beforeVat = Math.max(quantity * unitPrice - discount, 0);
    const vatAmount = beforeVat * (vatRate / 100);
    return {
      itemId,
      quantity,
      unitPrice,
      discount,
      vatRate,
      vatAmount,
      totalAmount: beforeVat + vatAmount,
    };
  });
}

export function commerceTotals(lines: CommerceLine[]) {
  return {
    subtotal: lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    discount: lines.reduce((sum, line) => sum + line.discount, 0),
    vatAmount: lines.reduce((sum, line) => sum + line.vatAmount, 0),
    totalAmount: lines.reduce((sum, line) => sum + line.totalAmount, 0),
  };
}

export function requiredText(value: unknown, message: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new CommerceValidationError(message);
  return text;
}

export function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function optionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new CommerceValidationError("التاريخ غير صحيح");
  }
  return date;
}
