import { Prisma } from "@prisma/client";
import { assertOpenAccountingPeriod, createBalancedJournal, reverseJournalEntry, type JournalLineInput } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { exchangeRateAt, functionalAmount } from "@/lib/currency";
import { getVerifiedDataScope } from "@/lib/data-scope";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { recordBankMovement } from "@/lib/finance";

type Tx = Prisma.TransactionClient;
export class ChequeError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
const clean = (value: unknown) => String(value ?? "").trim();
function id(value: unknown, label: string) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new ChequeError(`${label} غير صحيح`); return n; }
function date(value: unknown, label: string) {
  const raw = clean(value).slice(0, 10), result = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== raw) throw new ChequeError(`${label} غير صحيح`);
  return result;
}
function money(value: unknown) { try { const result = new Prisma.Decimal(clean(value)); if (!result.isFinite() || !result.gt(0) || result.decimalPlaces() > 2) throw new Error(); return result; } catch { throw new ChequeError("مبلغ الشيك يجب أن يكون موجبًا وبمنزلتين عشريتين كحد أقصى"); } }
async function bankFor(tx: Tx, bankAccountId: number) {
  const scope = await getVerifiedDataScope();
  const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, ...scope, isActive: true }, include: { ledgerAccount: true } });
  if (!bank?.ledgerAccount?.isActive || !bank.ledgerAccount.allowPosting) throw new ChequeError("الحساب البنكي أو حسابه المحاسبي غير صالح");
  return bank;
}

export async function createChequeBook(tx: Tx, input: Record<string, unknown>, userId: string) {
  const scope = await getVerifiedDataScope(), bankAccountId = id(input.bankAccountId, "الحساب البنكي"), firstNumber = id(input.firstNumber, "أول رقم"), lastNumber = id(input.lastNumber, "آخر رقم");
  if (lastNumber < firstNumber || lastNumber - firstNumber > 9999) throw new ChequeError("نطاق الدفتر غير صحيح؛ الحد الأقصى 10000 ورقة");
  await bankFor(tx, bankAccountId);
  if (await tx.chequeBook.findFirst({ where: { ...scope, bankAccountId, firstNumber: { lte: lastNumber }, lastNumber: { gte: firstNumber } } })) throw new ChequeError("نطاق أرقام الدفتر يتداخل مع دفتر موجود لنفس الحساب البنكي");
  const issueDate = date(input.issueDate, "تاريخ الإصدار");
  const book = await tx.chequeBook.create({ data: { ...scope, code: await nextDocumentNumber(tx, "CHQB", issueDate), bankAccountId, issueDate, firstNumber, lastNumber, createdBy: userId } });
  await audit(tx, { action: "CREATE", entityType: "CHEQUE_BOOK", entityId: book.id, userId, metadata: { bankAccountId, firstNumber, lastNumber } });
  return book;
}

export async function createCheque(tx: Tx, input: Record<string, unknown>, userId: string) {
  const scope = await getVerifiedDataScope(), direction = clean(input.direction).toUpperCase();
  if (!["PAID", "RECEIVED"].includes(direction)) throw new ChequeError("نوع الشيك غير صحيح");
  const bankAccountId = id(input.bankAccountId, "الحساب البنكي"), bank = await bankFor(tx, bankAccountId);
  const partyId = id(input.partyId, "الطرف"), counterAccountId = id(input.counterAccountId, "حساب الطرف"), suspenseAccountId = id(input.suspenseAccountId, "حساب أوراق القبض أو الدفع");
  const party = await tx.party.findFirst({ where: { id: partyId, ...scope } });
  if (!party) throw new ChequeError("الطرف غير تابع للشركة الحالية");
  const accounts = await tx.account.findMany({ where: { ...scope, id: { in: [counterAccountId, suspenseAccountId] }, isActive: true, allowPosting: true } });
  if (accounts.length !== 2 || counterAccountId === bank.ledgerAccountId || suspenseAccountId === bank.ledgerAccountId) throw new ChequeError("اختر حساب الطرف وحساب الأوراق مستقلين عن الحساب البنكي ونشطين للحركة");
  if (accounts.find(row => row.id === suspenseAccountId)?.accountType !== (direction === "PAID" ? "LIABILITY" : "ASSET")) throw new ChequeError("أوراق الدفع حساب خصوم وأوراق القبض حساب أصول");
  const amount = money(input.amount), issueDate = date(input.issueDate, "تاريخ الشيك"), dueDate = date(input.dueDate, "تاريخ الاستحقاق");
  if (dueDate < issueDate) throw new ChequeError("تاريخ الاستحقاق لا يسبق تاريخ الشيك");
  const description = clean(input.description);
  if (!description) throw new ChequeError("بيان الشيك مطلوب");
  const branchId = input.branchId ? id(input.branchId, "الفرع") : null;
  if (branchId && !(await tx.branch.findFirst({ where: { id: branchId, companyId: scope.companyId, isActive: true } }))) throw new ChequeError("الفرع غير تابع للشركة الحالية");
  let chequeBookId: number | null = null, chequeNumber = clean(input.chequeNumber), draweeBank = "", draweeAccount = "";
  if (direction === "PAID") {
    chequeBookId = id(input.chequeBookId, "دفتر الشيكات");
    const book = await tx.chequeBook.findFirst({ where: { id: chequeBookId, ...scope, bankAccountId, status: "ACTIVE" }, include: { cheques: { select: { chequeNumber: true } } } });
    if (!book) throw new ChequeError("دفتر الشيكات لا يطابق الحساب البنكي أو موقوف");
    if (issueDate < book.issueDate) throw new ChequeError("تاريخ الشيك لا يسبق إصدار الدفتر");
    const used = new Set(book.cheques.map(row => Number(row.chequeNumber)));
    if (!chequeNumber) { let next = book.firstNumber; while (used.has(next) && next <= book.lastNumber) next++; chequeNumber = String(next); }
    const number = id(chequeNumber, "رقم الشيك");
    if (number < book.firstNumber || number > book.lastNumber || used.has(number)) throw new ChequeError("رقم الشيك مستخدم أو خارج نطاق الدفتر");
    chequeNumber = String(number);
  } else {
    draweeBank = clean(input.draweeBank).toLocaleUpperCase(), draweeAccount = clean(input.draweeAccount).replace(/\s/g, "").toUpperCase();
    if (!draweeBank || !draweeAccount || !chequeNumber) throw new ChequeError("رقم الشيك والبنك المسحوب عليه ورقم حسابه مطلوبة");
  }
  const registrationKey = direction === "PAID" ? `PAID:${bankAccountId}:${chequeNumber}` : JSON.stringify(["RECEIVED", draweeBank, draweeAccount, chequeNumber]);
  if (await tx.cheque.findFirst({ where: { ...scope, registrationKey } })) throw new ChequeError("رقم الشيك مسجل بالفعل لنفس الحساب المسحوب عليه");
  const row = await tx.cheque.create({ data: { ...scope, internalNumber: await nextDocumentNumber(tx, "CHQ", issueDate), registrationKey, direction, chequeNumber, bankAccountId, draweeBank, draweeAccount, chequeBookId, partyId, counterAccountId, suspenseAccountId, branchId, amount, currency: bank.currency, issueDate, dueDate, description, referenceNumber: clean(input.referenceNumber) || null, createdBy: userId } });
  await audit(tx, { action: "CREATE", entityType: "CHEQUE", entityId: row.id, userId, metadata: { internalNumber: row.internalNumber, direction, chequeNumber, amount } });
  return row;
}

export async function chequeAction(tx: Tx, chequeId: number, action: string, input: Record<string, unknown>, userId: string) {
  const scope = await getVerifiedDataScope(), cheque = await tx.cheque.findFirst({ where: { id: chequeId, ...scope } });
  if (!cheque) throw new ChequeError("الشيك غير موجود", 404);
  const paid = cheque.direction === "PAID", issuedStatus = paid ? "ISSUED" : "RECEIVED";
  if ((action === "ISSUE" && cheque.issueJournalId) || (action === "CLEAR" && cheque.status === "CLEARED") || (action === "CANCEL" && cheque.status === "CANCELLED") || (action === "RETURN" && cheque.status === "RETURNED")) return cheque;
  if (!["ISSUE", "CLEAR", "CANCEL", "RETURN", "DEPOSIT", "STOP", "RESUME"].includes(action)) throw new ChequeError("الإجراء غير مدعوم");
  if (action === "STOP" || action === "RESUME" || action === "DEPOSIT") {
    if (action === "STOP" && (!paid || cheque.status !== "ISSUED")) throw new ChequeError("يمكن إيقاف الشيك الصادر غير المصروف فقط", 409);
    if (action === "RESUME" && cheque.status !== "STOPPED") throw new ChequeError("الشيك ليس موقوفًا", 409);
    if (action === "DEPOSIT" && (paid || cheque.status !== "RECEIVED")) throw new ChequeError("يمكن إيداع الشيك المستلم فقط", 409);
    const row = await tx.cheque.update({ where: { id: chequeId }, data: { status: action === "STOP" ? "STOPPED" : action === "RESUME" ? "ISSUED" : "DEPOSITED" } });
    await audit(tx, { action, entityType: "CHEQUE", entityId: chequeId, userId }); return row;
  }
  if (action === "ISSUE") {
    if (cheque.status !== "DRAFT") throw new ChequeError("لا يمكن إصدار هذه الحالة", 409);
    if (cheque.issueDate > new Date()) throw new ChequeError("تاريخ إصدار الشيك لم يحن بعد");
    await assertOpenAccountingPeriod(tx, cheque.issueDate);
    await bankFor(tx, cheque.bankAccountId);
    const fx = await exchangeRateAt(tx, cheque.currency, cheque.issueDate), carrying = functionalAmount(cheque.amount, fx.rate);
    const lines: JournalLineInput[] = [
      { accountId: paid ? cheque.counterAccountId : cheque.suspenseAccountId, debit: carrying, transactionDebit: cheque.amount, partyId: cheque.partyId },
      { accountId: paid ? cheque.suspenseAccountId : cheque.counterAccountId, credit: carrying, transactionCredit: cheque.amount, partyId: cheque.partyId },
    ];
    const entry = await createBalancedJournal(tx, { entryDate: cheque.issueDate, description: `${paid ? "إصدار" : "استلام"} الشيك ${cheque.chequeNumber} — ${cheque.description}`, referenceType: "CHEQUE_ISSUE", referenceId: cheque.id, referenceNumber: cheque.internalNumber, transactionCurrencyCode: cheque.currency, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate, lines });
    if (cheque.branchId) await tx.journalEntry.update({ where: { id: entry.id }, data: { branchId: cheque.branchId } });
    const row = await tx.cheque.update({ where: { id: cheque.id }, data: { status: issuedStatus, issueJournalId: entry.id, functionalAmount: carrying, exchangeRate: fx.rate, approvedBy: userId, approvedAt: new Date() } });
    await audit(tx, { action: "CHEQUE_ISSUE", entityType: "CHEQUE", entityId: cheque.id, userId, metadata: { journalId: entry.id } }); return row;
  }
  if (action === "CLEAR") {
    if (!["ISSUED", "RECEIVED", "DEPOSITED"].includes(cheque.status)) throw new ChequeError("الشيك يجب أن يكون صادرًا أو مستلمًا أو تحت التحصيل", 409);
    const clearedAt = date(input.date || new Date().toISOString(), "تاريخ الصرف أو التحصيل");
    if (clearedAt < cheque.issueDate || clearedAt > new Date()) throw new ChequeError("تاريخ التحصيل يجب أن يكون بين تاريخ الشيك واليوم");
    await assertOpenAccountingPeriod(tx, clearedAt);
    const bank = await bankFor(tx, cheque.bankAccountId), fx = await exchangeRateAt(tx, cheque.currency, clearedAt), settled = functionalAmount(cheque.amount, fx.rate), difference = settled.minus(cheque.functionalAmount);
    const lines: JournalLineInput[] = [
      { accountId: paid ? cheque.suspenseAccountId : bank.ledgerAccountId!, debit: paid ? cheque.functionalAmount : settled, transactionDebit: cheque.amount, partyId: cheque.partyId },
      { accountId: paid ? bank.ledgerAccountId! : cheque.suspenseAccountId, credit: paid ? settled : cheque.functionalAmount, transactionCredit: cheque.amount, partyId: cheque.partyId },
    ];
    if (!difference.isZero()) {
      const gain = paid ? difference.lt(0) : difference.gt(0);
      lines.push({ mappingKey: gain ? "REALIZED_FX_GAIN" : "REALIZED_FX_LOSS", ...(gain ? { credit: difference.abs(), transactionCredit: 0 } : { debit: difference.abs(), transactionDebit: 0 }) });
    }
    const entry = await createBalancedJournal(tx, { entryDate: clearedAt, description: `${paid ? "صرف" : "تحصيل"} الشيك ${cheque.chequeNumber}`, referenceType: "CHEQUE_CLEAR", referenceId: cheque.id, referenceNumber: cheque.internalNumber, transactionCurrencyCode: cheque.currency, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate, lines });
    if (cheque.branchId) await tx.journalEntry.update({ where: { id: entry.id }, data: { branchId: cheque.branchId } });
    await recordBankMovement(tx, { bankAccountId: cheque.bankAccountId, date: clearedAt, type: paid ? "CHEQUE_PAID" : "CHEQUE_RECEIVED", ...(paid ? { amountOut: cheque.amount } : { amountIn: cheque.amount }), referenceType: "CHEQUE_CLEAR", referenceId: cheque.id, referenceNumber: cheque.internalNumber, description: cheque.description });
    const row = await tx.cheque.update({ where: { id: cheque.id }, data: { status: "CLEARED", clearingJournalId: entry.id, clearingFunctionalAmount: settled, clearedAt } });
    await audit(tx, { action: "CHEQUE_CLEAR", entityType: "CHEQUE", entityId: cheque.id, userId, metadata: { journalId: entry.id } }); return row;
  }
  if (["RETURNED", "CANCELLED"].includes(cheque.status)) throw new ChequeError("الشيك مغلق بالفعل", 409);
  if (action === "CANCEL" && cheque.status === "CLEARED") throw new ChequeError("الشيك المصروف أو المحصل يعالج كمرتجع بعكس قيوده", 409);
  if (action === "RETURN" && cheque.status === "DRAFT") throw new ChequeError("المسودة تلغى ولا تسجل كشيك مرتجع", 409);
  const reason = clean(input.reason); if (!reason) throw new ChequeError("سبب الإلغاء أو الارتجاع مطلوب");
  let reversalJournalId: number | null = null;
  if (cheque.issueJournalId) {
    await assertOpenAccountingPeriod(tx, new Date());
    if (cheque.clearingJournalId) {
      await reverseJournalEntry(tx, { originalId: cheque.clearingJournalId, referenceType: "CHEQUE_CLEAR_REVERSAL", referenceId: cheque.id, referenceNumber: cheque.internalNumber, description: `عكس تحصيل/صرف الشيك ${cheque.chequeNumber}: ${reason}` });
      await recordBankMovement(tx, { bankAccountId: cheque.bankAccountId, date: new Date(), type: "CHEQUE_RETURN", ...(paid ? { amountIn: cheque.amount } : { amountOut: cheque.amount }), referenceType: "CHEQUE_CLEAR_REVERSAL", referenceId: cheque.id, referenceNumber: cheque.internalNumber, description: reason });
    }
    const reversal = await reverseJournalEntry(tx, { originalId: cheque.issueJournalId, referenceType: "CHEQUE_ISSUE_REVERSAL", referenceId: cheque.id, referenceNumber: cheque.internalNumber, description: `عكس الشيك ${cheque.chequeNumber}: ${reason}` });
    reversalJournalId = reversal.id;
  }
  const row = await tx.cheque.update({ where: { id: cheque.id }, data: { status: action === "RETURN" ? "RETURNED" : "CANCELLED", reversalJournalId, cancelledAt: new Date(), cancellationReason: reason } });
  await audit(tx, { action: `CHEQUE_${action}`, entityType: "CHEQUE", entityId: cheque.id, userId, metadata: { reason, reversalJournalId } }); return row;
}

export async function chequeWorkspace(tx: Tx, direction?: string) {
  const scope = await getVerifiedDataScope();
  const [books, cheques, banks, parties, accounts, branches] = await Promise.all([
    tx.chequeBook.findMany({ where: scope, include: { cheques: { select: { id: true, status: true, chequeNumber: true } } }, orderBy: { id: "desc" } }),
    tx.cheque.findMany({ where: { ...scope, ...(direction && ["PAID", "RECEIVED"].includes(direction) ? { direction } : {}) }, orderBy: [{ dueDate: "asc" }, { id: "desc" }] }),
    tx.bankAccount.findMany({ where: scope, select: { id: true, name: true, currency: true, isActive: true, bankName: true, accountNumber: true } }),
    tx.party.findMany({ where: scope, select: { id: true, nameAr: true } }),
    tx.account.findMany({ where: { ...scope, isActive: true, allowPosting: true }, select: { id: true, code: true, nameAr: true, accountType: true }, orderBy: { code: "asc" } }),
    tx.branch.findMany({ where: { companyId: scope.companyId, isActive: true }, select: { id: true, nameAr: true } }),
  ]);
  const journals = await tx.journalEntry.findMany({ where: { ...scope, referenceType: { in: ["CHEQUE_ISSUE", "CHEQUE_CLEAR", "CHEQUE_ISSUE_REVERSAL", "CHEQUE_CLEAR_REVERSAL"] }, referenceId: { in: cheques.map(row => row.id) } }, select: { id: true, entryNumber: true, referenceId: true, referenceType: true, status: true, totalDebit: true, totalCredit: true } });
  return { books: books.map(book => ({ ...book, total: book.lastNumber - book.firstNumber + 1, reserved: book.cheques.filter(cheque => cheque.status === "DRAFT").length, used: book.cheques.filter(cheque => !["DRAFT", "CANCELLED"].includes(cheque.status)).length, cancelled: book.cheques.filter(cheque => cheque.status === "CANCELLED").length, remaining: book.lastNumber - book.firstNumber + 1 - book.cheques.length })), cheques, banks, parties, accounts, branches, journals };
}
