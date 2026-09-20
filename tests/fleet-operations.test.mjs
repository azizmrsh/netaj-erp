import assert from "node:assert/strict";
import {test} from "node:test";
import {assertOdometerProgress,calculateFuelVariance,calculateTransportProfit} from "../lib/fleet.ts";
import {scopedModels} from "../lib/data-scope.ts";

test("العداد لا يقبل قراءة أقل إلا بسبب تصحيح مدقق",()=>{
  assert.throws(()=>assertOdometerProgress(120000,119500,""),/سبب تصحيح/);
  assert.doesNotThrow(()=>assertOdometerProgress(120000,119500,"تصحيح ترحيل قديم"));
  assert.doesNotThrow(()=>assertOdometerProgress(120000,120250,""));
});

test("الوقود المتوقع والفعلي يحسبان الكمية والنسبة وانحراف التكلفة",()=>{
  const result=calculateFuelVariance({distanceKm:500,litersPer100Km:30,actualLiters:165,pricePerLiter:2.5});
  assert.equal(Number(result.expected),150);
  assert.equal(Number(result.variance),15);
  assert.equal(Number(result.variancePercent),10);
  assert.equal(Number(result.costVariance),37.5);
});

test("ربحية النقليات تجمع كل التكاليف مرة واحدة",()=>{
  const result=calculateTransportProfit({revenue:10000,fuelCost:1800,driverTripFee:700,maintenanceCost:500,administrativeCost:300,roadPermitCost:200,otherCost:100,additionalExpenses:400});
  assert.equal(Number(result.totalCost),4000);
  assert.equal(Number(result.netProfit),6000);
  assert.equal(Number(result.margin),60);
});

test("جميع سجلات تشغيل الأسطول وإيصال النقليات خاضعة لنطاق الشركة",()=>{
  for(const model of ["VehicleOdometerReading","VehicleTireRecord","VehicleBatteryRecord","VehicleFuelTransaction","VehicleMaintenanceRecord","TransportReceipt"])assert.ok(scopedModels.has(model),`${model} must be tenant scoped`);
});
