import {
  parseISO,
  slotKeyFromStart,
  slotIdFromStart,
  minutesBetween,
  muPerMinFromAvgServiceTime,
  mm1Wq,
  lambdaTargetPerMin,
  optimalTruckPerSlot,
  SLOT_INTERVAL_MIN,
  HISTORY_DAYS,
  ACTIVE_QUEUE_STATES,
} from "../../functions/src/utils.js";

/**
 * slotKeyFromStart
 */
describe("slotKeyFromStart",()=>{
    test("HH:MM formatında slot key döner",()=>{
        const d = new Date("2026-04-26T10:30:00Z");
        const key = slotKeyFromStart(d,"UTC");
        expect(key).toBe("10:30");
    });
    test("timezone farkını doğru yansıtır",()=>{
        const d = new Date("2026-04-26T10:30:00Z");
        const key = slotKeyFromStart(d,"Asia/Famagusta");
        expect(key).toBe("13:30");
    });
});
/**
 * slotIdFromStart
 */
describe("slotIdFromStart",()=>{
    test("YYYY-MM-DD_HH:MM formatında ID döner",()=>{
        const d = new Date("2026-01-15T12:45:00Z");
        expect(slotIdFromStart(d, "UTC")).toBe("2026-01-15_12:45");
    });
    test("timezone farkını doğru yansıtır",()=>{
        const d = new Date("2026-04-26T10:30:00Z");
        const id = slotIdFromStart(d,"Asia/Famagusta");
        expect(id).toBe("2026-04-26_13:30");
    });
});
/**
 * muPerMinFromAvgServiceTime
 */
describe("muPerMinFromAvgServiceTime",()=>{
    test("10 dk ortalama → 0.1/dk", () => {
        expect(muPerMinFromAvgServiceTime(10)).toBeCloseTo(0.1);
    });
    test("0 -> 0 döner",()=>{
        expect(muPerMinFromAvgServiceTime(0)).toBe(0);
    });
    test("null -> 0 döner",()=>{
        expect(muPerMinFromAvgServiceTime(null)).toBe(0);
    });
    test("negatif değer -> 0 döner",()=>{
        expect(muPerMinFromAvgServiceTime(-5)).toBe(0);
    })
});
/**
 * mm1Wq
 */
describe("mm1Wq",()=>{
    test("stabil kuyruk doğru Wq hesaplar",()=>{
        const result = mm1Wq(0.05, 0.1);
        expect(result.stable).toBe(true);
        expect(result.rho).toBeCloseTo(0.5);
        expect(result.Wq).toBeCloseTo(10);
    });
    test("(λ = μ) → unstable", () => {
        const result = mm1Wq(0.1, 0.1);
        expect(result.stable).toBe(false);
        expect(result.Wq).toBe(Infinity);
    });
    test("(λ > μ) → unstable", () => {
        const result = mm1Wq(0.2, 0.1);
        expect(result.stable).toBe(false);
    });
    test("μ = 0 → unstable", () => {
        const result = mm1Wq(0.05, 0);
        expect(result.stable).toBe(false);
        expect(result.rho).toBe(Infinity);
    });
});
/**
 * lambdaTargetPerMin
 */
describe("lambdaTargetPerMin",()=>{
    test("%80 utilization ile hedef lambda",()=>{
        expect(lambdaTargetPerMin(0.8, 0.1)).toBeCloseTo(0.08);
    });
    test("μ = 0 → 0 döner", () => {
        expect(lambdaTargetPerMin(0.8, 0)).toBe(0);
    });
});
/**
 * optimalTruckPerSlot
 */
describe("optimalTruckPerSlot",()=>{
    test("10dk servis, 15dk slot => 1 kamyon", () => {
        expect(optimalTruckPerSlot(10)).toBe(1);
    });
    test("5dk servis, 15dk slot => 2 kamyon", () => {
        expect(optimalTruckPerSlot(5)).toBe(2);
    });
    test("0 servis süresi => 0 döner", () => {
        expect(optimalTruckPerSlot(0)).toBe(0);
    });
    test("çok uzun servis süresi => 0 döner", () => {
        expect(optimalTruckPerSlot(100)).toBe(0);
    });
})
