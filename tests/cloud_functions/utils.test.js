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
describe("UT-CF-01:slotKeyFromStart",()=>{
    test("returns with the form of HH:MM ",()=>{
        const d = new Date("2026-04-26T10:30:00Z");
        const key = slotKeyFromStart(d,"UTC");
        expect(key).toBe("10:30");
    });
    test("represents timezone difference properly",()=>{
        const d = new Date("2026-04-26T10:30:00Z");
        const key = slotKeyFromStart(d,"Asia/Famagusta");
        expect(key).toBe("13:30");
    });
});
/**
 * slotIdFromStart
 */
describe("UT-CF-01: slotIdFromStart",()=>{
    test("returns ID in YYYY-MM-DD_HH:MM format",()=>{
        const d = new Date("2026-01-15T12:45:00Z");
        expect(slotIdFromStart(d, "UTC")).toBe("2026-01-15_12:45");
    });
    test("represents timezone difference properly",()=>{
        const d = new Date("2026-04-26T10:30:00Z");
        const id = slotIdFromStart(d,"Asia/Famagusta");
        expect(id).toBe("2026-04-26_13:30");
    });
});
/**
 * muPerMinFromAvgServiceTime
 */
describe("UT-CF-02: muPerMinFromAvgServiceTime",()=>{
    test("10 minutes average → 0.1/minute", () => {
        expect(muPerMinFromAvgServiceTime(10)).toBeCloseTo(0.1);
    });
    test("returns zero for zero input",()=>{
        expect(muPerMinFromAvgServiceTime(0)).toBe(0);
    });
    test("returns 0 for null input",()=>{
        expect(muPerMinFromAvgServiceTime(null)).toBe(0);
    });
    test("returns zero for negative values",()=>{
        expect(muPerMinFromAvgServiceTime(-5)).toBe(0);
    })
});
/**
 * mm1Wq
 */
describe("UT-CF-03: mm1Wq",()=>{
    test("A stable queue calculates the correct Wq",()=>{
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
describe("UT-CF-04: lambdaTargetPerMin",()=>{
    test("80% utilization with 0.1 service rate",()=>{
        expect(lambdaTargetPerMin(0.8, 0.1)).toBeCloseTo(0.08);
    });
    test("returns zero for zero input", () => {
        expect(lambdaTargetPerMin(0.8, 0)).toBe(0);
    });
});
/**
 * optimalTruckPerSlot
 */
describe("UT-CF-04:optimalTruckPerSlot",()=>{
    test("10 min service time, 15 min slot => 1 truck", () => {
        expect(optimalTruckPerSlot(10)).toBe(1);
    });
    test("5 min service time, 15 min slot => 2 trucks", () => {
        expect(optimalTruckPerSlot(5)).toBe(2);
    });
    test("0 service time => 0 trucks", () => {
        expect(optimalTruckPerSlot(0)).toBe(0);
    });
    test("very long service time => 0 trucks", () => {
        expect(optimalTruckPerSlot(100)).toBe(0);
    });
})
