import {Prisma} from "@prisma/client";

const decimal=(value:Prisma.Decimal.Value)=>new Prisma.Decimal(value);

export function assertOdometerProgress(previous:Prisma.Decimal.Value|undefined,next:Prisma.Decimal.Value,correctionReason?:string|null){
  if(previous!==undefined&&decimal(next).lt(decimal(previous))&&!String(correctionReason??"").trim())throw new Error("لا يمكن إدخال عداد أقل دون سبب تصحيح مدقق");
}

export function calculateFuelVariance(input:{distanceKm:Prisma.Decimal.Value;litersPer100Km:Prisma.Decimal.Value;actualLiters:Prisma.Decimal.Value;pricePerLiter?:Prisma.Decimal.Value}){
  const distance=decimal(input.distanceKm),rate=decimal(input.litersPer100Km),actual=decimal(input.actualLiters),expected=distance.mul(rate).div(100),variance=actual.minus(expected),variancePercent=expected.gt(0)?variance.div(expected).mul(100):new Prisma.Decimal(0),costVariance=variance.mul(decimal(input.pricePerLiter??0));
  return{expected,variance,variancePercent,costVariance};
}

export function calculateTransportProfit(input:{revenue:Prisma.Decimal.Value;fuelCost:Prisma.Decimal.Value;driverTripFee:Prisma.Decimal.Value;maintenanceCost:Prisma.Decimal.Value;administrativeCost?:Prisma.Decimal.Value;roadPermitCost:Prisma.Decimal.Value;otherCost:Prisma.Decimal.Value;additionalExpenses?:Prisma.Decimal.Value}){
  const totalCost=decimal(input.fuelCost).add(input.driverTripFee).add(input.maintenanceCost).add(input.administrativeCost??0).add(input.roadPermitCost).add(input.otherCost).add(input.additionalExpenses??0),netProfit=decimal(input.revenue).sub(totalCost),margin=decimal(input.revenue).gt(0)?netProfit.div(input.revenue).mul(100):new Prisma.Decimal(0);
  return{totalCost,netProfit,margin};
}
