const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function englishUnderThousand(value: number) {
  const parts: string[] = [];
  if (value >= 100) {
    parts.push(`${EN_ONES[Math.floor(value / 100)]} hundred`);
    value %= 100;
  }
  if (value >= 20) {
    const ones = value % 10;
    parts.push(`${EN_TENS[Math.floor(value / 10)]}${ones ? `-${EN_ONES[ones]}` : ""}`);
  } else if (value > 0 || !parts.length) parts.push(EN_ONES[value]);
  return parts.join(" ");
}

function englishInteger(value: number) {
  if (value === 0) return EN_ONES[0];
  const scales: Array<[number, string]> = [[1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"]];
  const parts: string[] = [];
  for (const [scale, label] of scales) {
    if (value >= scale) {
      parts.push(`${englishUnderThousand(Math.floor(value / scale))} ${label}`);
      value %= scale;
    }
  }
  if (value) parts.push(englishUnderThousand(value));
  return parts.join(" ");
}

const AR_ONES = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function joinArabic(parts: string[]) { return parts.filter(Boolean).join(" و"); }
function arabicUnderThousand(value: number) {
  const parts: string[] = [];
  if (value >= 100) { parts.push(AR_HUNDREDS[Math.floor(value / 100)]); value %= 100; }
  if (value >= 20) {
    const ones = value % 10;
    if (ones) parts.push(AR_ONES[ones]);
    parts.push(AR_TENS[Math.floor(value / 10)]);
  } else if (value > 0 || !parts.length) parts.push(AR_ONES[value]);
  return joinArabic(parts);
}

function arabicScale(value: number, singular: string, dual: string, plural: string) {
  if (value === 1) return singular;
  if (value === 2) return dual;
  if (value >= 3 && value <= 10) return `${arabicUnderThousand(value)} ${plural}`;
  return `${arabicUnderThousand(value)} ${singular}`;
}

function arabicInteger(value: number) {
  if (value === 0) return AR_ONES[0];
  const parts: string[] = [];
  const scales: Array<[number, string, string, string]> = [[1_000_000_000, "مليار", "ملياران", "مليارات"], [1_000_000, "مليون", "مليونان", "ملايين"], [1_000, "ألف", "ألفان", "آلاف"]];
  for (const [scale, singular, dual, plural] of scales) {
    const count = Math.floor(value / scale);
    if (count) { parts.push(arabicScale(count, singular, dual, plural)); value %= scale; }
  }
  if (value) parts.push(arabicUnderThousand(value));
  return joinArabic(parts);
}

function normalizedAmount(value: number) {
  if (!Number.isFinite(value) || value < 0 || value >= 1_000_000_000_000) throw new Error("المبلغ خارج النطاق المدعوم");
  const rounded = Math.round(value * 100);
  return { whole: Math.floor(rounded / 100), fraction: rounded % 100 };
}

export function amountInWords(value: number, locale: "ar" | "en") {
  const { whole, fraction } = normalizedAmount(value);
  if (locale === "en") return `${englishInteger(whole)} Saudi riyals${fraction ? ` and ${englishInteger(fraction)} halalas` : ""} only`;
  return `${arabicInteger(whole)} ريال سعودي${fraction ? ` و${arabicInteger(fraction)} هللة` : ""} فقط لا غير`;
}
