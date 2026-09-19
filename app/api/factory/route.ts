import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureFactoryFoundation } from "@/lib/factory";

const number=(value:unknown)=>Number(value??0);
const boundary=(value:string|null,end=false)=>value?new Date(`${value}${value.includes("T")?"":end?"T23:59:59.999":"T00:00:00.000"}`):undefined;
export async function GET(request:Request){
  try{
    await prisma.$transaction((tx)=>ensureFactoryFoundation(tx));
    const params=new URL(request.url).searchParams,from=boundary(params.get("from")),to=boundary(params.get("to"),true),partyId=Number(params.get("partyId")),itemId=Number(params.get("itemId"));
    const dateWhere:Prisma.DateTimeFilter={...(from?{gte:from}:{}),...(to?{lte:to}:{})};
    const [transactions,expenses,revenues,fuelMovements,maintenance,stockAccounts,stockMovements,feeRates,parties,items,banks]=await Promise.all([
      prisma.factoryTransaction.findMany({where:{status:"POSTED",...(from||to?{transactionDate:dateWhere}:{}),...(partyId>0?{partyId}:{}),...(itemId>0?{itemId}:{})},include:{party:true,item:{include:{unit:true}}},orderBy:[{transactionDate:"desc"},{id:"desc"}]}),
      prisma.expense.findMany({where:{status:"POSTED",costCenter:"FACTORY",...(from||to?{expenseDate:dateWhere}:{})},include:{category:true},orderBy:{expenseDate:"desc"}}),
      prisma.revenue.findMany({where:{status:"POSTED",OR:[{costCenter:"FACTORY"},{activity:"FACTORY"}],...(from||to?{revenueDate:dateWhere}:{})},include:{category:true},orderBy:{revenueDate:"desc"}}),
      prisma.factoryFuelMovement.findMany({where:{...(from||to?{movementDate:dateWhere}:{}),...(itemId>0?{itemId}:{})},include:{item:{include:{unit:true}}},orderBy:[{movementDate:"desc"},{id:"desc"}]}),
      prisma.factoryMaintenance.findMany({where:{status:"POSTED",...(from||to?{maintenanceDate:dateWhere}:{})},include:{expense:true},orderBy:[{maintenanceDate:"desc"},{id:"desc"}]}),
      prisma.partyStockAccount.findMany({where:{...(partyId>0?{partyId}:{}),...(itemId>0?{itemId}:{})},include:{party:true,item:{include:{unit:true}}},orderBy:[{partyId:"asc"},{itemId:"asc"}]}),
      prisma.stockMovement.findMany({where:{ownershipType:"PARTY",...(partyId>0?{partyId}:{}),...(itemId>0?{itemId}:{}),...(from||to?{movementDate:dateWhere}:{})},include:{party:true,item:true},orderBy:[{movementDate:"desc"},{id:"desc"}]}),
      prisma.factoryFeeRate.findMany({where:{isActive:true,...(partyId>0?{partyId}:{}),...(itemId>0?{itemId}:{})},include:{party:true,item:true},orderBy:[{partyId:"asc"},{itemId:"asc"}]}),
      prisma.party.findMany({where:{isActive:true,isCustomer:true},select:{id:true,nameAr:true},orderBy:{nameAr:"asc"}}),
      prisma.item.findMany({where:{isActive:true},include:{unit:true},orderBy:{nameAr:"asc"}}),prisma.bankAccount.findMany({where:{isActive:true},orderBy:{name:"asc"}}),
    ]);
    const manufacturingRevenue=transactions.reduce((sum,row)=>sum+number(row.manufacturingFeeTotal),0),otherRevenue=revenues.reduce((sum,row)=>sum+number(row.amountBeforeVat),0);
    const operatingExpenses=expenses.reduce((sum,row)=>sum+number(row.amountBeforeVat),0),fuelCost=fuelMovements.filter(row=>number(row.quantityOut)>0).reduce((sum,row)=>sum+number(row.totalValue),0);
    const productionTons=transactions.reduce((sum,row)=>sum+number(row.quantity),0),totalRevenue=manufacturingRevenue+otherRevenue,totalCost=operatingExpenses+fuelCost,netProfit=totalRevenue-totalCost;
    const months=new Map<string,{month:string;revenue:number;cost:number;tons:number}>();const monthly=(d:Date)=>d.toISOString().slice(0,7);
    for(const row of transactions){const key=monthly(row.transactionDate),entry=months.get(key)??{month:key,revenue:0,cost:0,tons:0};entry.revenue+=number(row.manufacturingFeeTotal);entry.tons+=number(row.quantity);months.set(key,entry);}
    for(const row of revenues){const key=monthly(row.revenueDate),entry=months.get(key)??{month:key,revenue:0,cost:0,tons:0};entry.revenue+=number(row.amountBeforeVat);months.set(key,entry);}
    for(const row of expenses){const key=monthly(row.expenseDate),entry=months.get(key)??{month:key,revenue:0,cost:0,tons:0};entry.cost+=number(row.amountBeforeVat);months.set(key,entry);}
    for(const row of fuelMovements.filter(row=>number(row.quantityOut)>0)){const key=monthly(row.movementDate),entry=months.get(key)??{month:key,revenue:0,cost:0,tons:0};entry.cost+=number(row.totalValue);months.set(key,entry);}
    return NextResponse.json({summary:{manufacturingRevenue,otherRevenue,totalRevenue,operatingExpenses,fuelCost,totalCost,netProfit,margin:totalRevenue?netProfit/totalRevenue*100:0,productionTons,costPerTon:productionTons?totalCost/productionTons:0},
      transactions,expenses,revenues,fuelMovements,maintenance,feeRates,stockAccounts:stockAccounts.map(row=>({...row,quantity:number(row.quantity),averageValue:number(row.averageValue),value:number(row.quantity)*number(row.averageValue),isNegative:number(row.quantity)<0})),stockMovements,
      monthly:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(row=>({...row,profit:row.revenue-row.cost,profitPerTon:row.tons?(row.revenue-row.cost)/row.tons:0})),options:{parties,items,banks},filters:{from:from?.toISOString()??null,to:to?.toISOString()??null,partyId:partyId||null,itemId:itemId||null}});
  }catch(error){console.error(error);return NextResponse.json({error:"تعذر تحميل تقرير المصنع"},{status:500});}
}
