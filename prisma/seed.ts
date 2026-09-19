import { prisma } from "../lib/prisma";

async function main() {
  const units = [
    { code: "TON", nameAr: "طن", nameEn: "Ton" },
    { code: "KG", nameAr: "كجم", nameEn: "Kg" },
    { code: "LITER", nameAr: "لتر", nameEn: "Liter" },
    { code: "PCS", nameAr: "قطعة", nameEn: "Piece" },
    { code: "BARREL", nameAr: "برميل", nameEn: "Barrel" },
  ];

  for (const unit of units) {
    await prisma.unit.upsert({
      where: { code: unit.code },
      update: unit,
      create: unit,
    });
  }

  console.log("تم تجهيز الوحدات الأساسية بنجاح");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
