const SLOT_INTERVAL_MIN = 15;
const HISTORY_DAYS = 7;
const ACTIVE_QUEUE_STATES = ['Queued', 'InProgress'];
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Famagusta";

// Kullanıcının seçtiği iso formatındaki tarih string'ini Date objesine çevirmek için
function parseISO(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE");
  return d;
}

function datePartsInTimeZone(date, timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const valueOf = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
    hour: valueOf("hour"),
    minute: valueOf("minute"),
  };
}
// Lambda hesaplamak için kullanılıcak slotkey'i oluşturmak için. (12:45)
function slotKeyFromStart(slotStartDate, timeZone = APP_TIME_ZONE) {
  const { hour, minute } = datePartsInTimeZone(slotStartDate, timeZone);
  return `${hour}:${minute}`; // ör: "12:45"
}
// Gün ve slotu kullanarak benzersiz bir key oluşturmak için. (2026-01-15_12:45)
function slotIdFromStart(slotStartDate, timeZone = APP_TIME_ZONE) {
  const { year, month, day, hour, minute } = datePartsInTimeZone(slotStartDate, timeZone);
  return `${year}-${month}-${day}_${hour}:${minute}`; // ör: "2026-01-15_12:45"
}

function minutesBetween(a, b) {
  return (b.getTime() - a.getTime()) / 60000;
}
// mu (dakikade ne kadar iş yapılabiliyor) hesaplamak için 
function muPerMinFromAvgServiceTime(avgServiceTimeMin) {
  const t = Number(avgServiceTimeMin ?? 0);
  if (!t || t <= 0) return 0;
  return 1 / t;
}

// M/M/1 kullanarak bekleme süresi hesaplamak için
function mm1Wq(lambdaPerMin, muPerMin) {
  // Henüz servis verisi yoksa (mu=0 veya lambda=0) bekleme süresi 0 kabul edilir
  if (muPerMin <= 0 || lambdaPerMin <= 0) return { stable: true, rho: 0, Wq: 0 };
  const rho = lambdaPerMin / muPerMin;
  if (rho >= 1) return { stable: false, rho, Wq: Infinity };
  const Wq = lambdaPerMin / (muPerMin * (muPerMin - lambdaPerMin));
  return { stable: true, rho, Wq };
}

function lambdaTargetPerMin(targetUtilization=0.8, muPerMin){
  if(muPerMin<=0) return 0;
  return targetUtilization * muPerMin;
}

function optimalTruckPerSlot(avgServiceTimeMin, slotTimeInterval=15, targetUtilization = 0.8){
  const muPerMin = muPerMinFromAvgServiceTime(avgServiceTimeMin);
  if(muPerMin<=0) return 0;
  const lambdaTarget = lambdaTargetPerMin(targetUtilization, muPerMin);
  const slotCapacity = lambdaTarget * slotTimeInterval;
  const capacity = Math.round(slotCapacity);
  // Servis süresi > slot süresi olsa bile minimum 1 truck kabul edilebilir
  return Math.max(1, capacity);
}



module.exports = {
  SLOT_INTERVAL_MIN,
  HISTORY_DAYS,
  ACTIVE_QUEUE_STATES,
  APP_TIME_ZONE,
  parseISO,
  slotKeyFromStart,
  slotIdFromStart,
  minutesBetween,
  muPerMinFromAvgServiceTime,
  mm1Wq,
  lambdaTargetPerMin,
  optimalTruckPerSlot
};
