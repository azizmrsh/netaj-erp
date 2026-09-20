import test from "node:test";
import assert from "node:assert/strict";
import { amountInWords } from "../lib/amount-in-words.ts";

test("voucher amount is written in English with halalas", () => {
  assert.equal(amountInWords(1234.56, "en"), "one thousand two hundred thirty-four Saudi riyals and fifty-six halalas only");
});

test("voucher amount is written in Arabic with halalas", () => {
  const result = amountInWords(1234.56, "ar");
  assert.match(result, /ألف/);
  assert.match(result, /ريال سعودي/);
  assert.match(result, /هللة/);
});

test("amount words reject unsafe values", () => {
  assert.throws(() => amountInWords(-1, "ar"));
  assert.throws(() => amountInWords(Number.NaN, "en"));
});
