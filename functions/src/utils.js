const SLOT_INTERVAL_MIN = 15;
const HISTORY_DAYS = 7;
const ACTIVE_QUEUE_STATES = ['Queued', 'InProgress'];

// Kullanıcının seçtiği iso formatındaki tarih string'ini Date objesine çevirmek için
function parseISO(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE");
  return d;
}
// Lambda hesaplamak için kullanılıcak slotkey'i oluşturmak için. (12:45)
function slotKeyFromStart(slotStartDate) {
  const hh = String(slotStartDate.getHours()).padStart(2, "0");
  const mm = String(slotStartDate.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`; // ör: "12:45"
}
// Gün ve slotu kullanarak benzersiz bir key oluşturmak için. (2026-01-15_12:45)
function slotIdFromStart(slotStartDate) {
  const y = slotStartDate.getFullYear();
  const m = String(slotStartDate.getMonth() + 1).padStart(2, "0");
  const d = String(slotStartDate.getDate()).padStart(2, "0");
  const hh = String(slotStartDate.getHours()).padStart(2, "0");
  const mm = String(slotStartDate.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}_${hh}:${mm}`; // ör: "2026-01-15_12:45"
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
  if (muPerMin <= 0) return { stable: false, rho: Infinity, Wq: Infinity };
  const rho = lambdaPerMin / muPerMin;
  if (rho >= 1) return { stable: false, rho, Wq: Infinity };
  const Wq = lambdaPerMin / (muPerMin * (muPerMin - lambdaPerMin));
  return { stable: true, rho, Wq };
}

module.exports = {
  SLOT_INTERVAL_MIN,
  HISTORY_DAYS,
  ACTIVE_QUEUE_STATES,
  parseISO,
  slotKeyFromStart,
  slotIdFromStart,
  minutesBetween,
  muPerMinFromAvgServiceTime,
  mm1Wq,
};