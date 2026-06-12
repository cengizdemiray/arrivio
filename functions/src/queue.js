const cors = require('cors')({ origin: true });
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const REGION = "europe-west3";

function normStatus(value) {
    return String(value || "").trim();
}

function toMillis(value) {
    if (!value) return null;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    return null;
}

const {
    parseISO,
    slotKeyFromStart,
    slotIdFromStart,
    lambdaTargetPerMin,
    optimalTruckPerSlot,
    muPerMinFromAvgServiceTime
} = require("./utils");

//Entering Queue
exports.enterQueue = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { carrierId, stationId, slotStart, slotEnd } = req.body || {};

            // Gerekli alanlar kontrol ediliyor.
            if (!carrierId || !stationId || !slotStart || !slotEnd) {
                return res.status(400).json({ error: "carrierId, stationId, slotStart, slotEnd are required" });
            }

            // Carrier block kontrolü
            const carrierSnap = await db.collection("Carrier").doc(carrierId).get();
            if (carrierSnap.exists && carrierSnap.data().Status === "Blocked") {
                return res.status(403).json({ error: "Carrier is blocked", code: "CARRIER_BLOCKED" });
            }

            // Frontend'den gelen ISO tarihleri parse ediyoruz.
            const slotStartDate = parseISO(slotStart);
            const slotEndDate = parseISO(slotEnd);

            // Queue / booking hesaplarında kullanılacak slot alanları.
            const slotKey = slotKeyFromStart(slotStartDate); // ör: "10:00"
            const slotId = slotIdFromStart(slotStartDate);   // ör: "2026-02-28_10:00"

            // Ekran görüntündeki gibi slotEnd'i sadece saat:dakika formatında saklıyoruz.
            const slotEndLabel = slotKeyFromStart(slotEndDate);

            // arrivalTime ve queuedAt alanlarını seçilen slota eşit tutuyoruz.
            // Yani server now değil, kullanıcının booking slot zamanı yazılıyor.
            const arrivalTimestamp = Timestamp.fromDate(slotStartDate);
            const queuedTimestamp = Timestamp.fromDate(slotStartDate);

            // Sayaç dokümanları.
            // Bunlar sayesinde id'leri B-1, Q-1 formatında üretiyoruz.
            const bookingCounterRef = db.collection("_counters").doc("booking");
            const queueCounterRef = db.collection("_counters").doc("queueEntry");

            let bookingId;
            let queueEntryId;

            await db.runTransaction(async (tx) => {
                // Sayaçları okuyoruz.
                const bookingCounterSnap = await tx.get(bookingCounterRef);
                const queueCounterSnap = await tx.get(queueCounterRef);

                const currentBookingNo = bookingCounterSnap.exists
                    ? Number(bookingCounterSnap.data().lastNumber ?? 0)
                    : 0;

                const currentQueueNo = queueCounterSnap.exists
                    ? Number(queueCounterSnap.data().lastNumber ?? 0)
                    : 0;

                const nextBookingNo = currentBookingNo + 1;
                const nextQueueNo = currentQueueNo + 1;

                bookingId = `B-${nextBookingNo}`;
                queueEntryId = `Q-${nextQueueNo}`;

                const bookingRef = db.collection("Booking").doc(bookingId);
                const queueEntryRef = db.collection("QueueEntry").doc(queueEntryId);

                // Booking dokümanı oluşturuluyor.
                tx.set(bookingRef, {
                    arrivalTime: arrivalTimestamp,
                    bookingStatus: "Active",
                    carrierId,
                    createdAt: FieldValue.serverTimestamp(),
                    queueStatus: "Queued",
                    queuedAt: queuedTimestamp,
                    slotEnd: slotEndLabel,
                    slotId,
                    slotKey,
                    stationId,
                    queueEntryId,
                });

                // QueueEntry dokümanı oluşturuluyor.
                tx.set(queueEntryRef, {
                    bookingId,
                    carrierId,
                    stationId,
                    slotKey,
                    slotEnd: slotEndLabel,
                    slotStartAt: Timestamp.fromDate(slotStartDate),
                    slotEndAt: Timestamp.fromDate(slotEndDate),
                    queueStatus: "Queued",
                    queuedAt: queuedTimestamp,
                    createdAt: FieldValue.serverTimestamp(),
                });

                // Sayaçları güncelliyoruz.
                tx.set(
                    bookingCounterRef,
                    {
                        lastNumber: nextBookingNo,
                        updatedAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );

                tx.set(
                    queueCounterRef,
                    {
                        lastNumber: nextQueueNo,
                        updatedAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            });

            return res.status(200).json({
                message: "Booking and QueueEntry created",
                bookingId,
                queueEntryId,
            });
        } catch (err) {
            console.error("enterQueue error:", err);

            if (String(err?.message) === "INVALID_DATE") {
                return res.status(400).json({ error: "Invalid slotStart/slotEnd format" });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

exports.startService = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { queueEntryId, operatorId } = req.body || {};
            if (!queueEntryId) {
                return res.status(400).json({ error: "queueEntryId is required" });
            }

            // Operator yetki kontrolü
            if (operatorId) {
                const opSnap = await db.collection("Operator").doc(operatorId).get();
                if (!opSnap.exists) {
                    return res.status(403).json({ error: "Operator not found", code: "OPERATOR_NOT_AUTHORIZED" });
                }
                if (opSnap.data().Status !== "Active") {
                    return res.status(403).json({ error: "Operator is not active", code: "OPERATOR_NOT_ACTIVE" });
                }
            }

            const entryRef = db.collection("QueueEntry").doc(queueEntryId);

            await db.runTransaction(async (tx) => {
                const entrySnap = await tx.get(entryRef);
                if (!entrySnap.exists) throw new Error("ENTRY_NOT_FOUND");

                const entry = entrySnap.data();
                const stationId = entry.stationId;
                if (!stationId) throw new Error("STATION_ID_MISSING");

                // 1) Sadece Queued başlatılabilir
                if (normStatus(entry.queueStatus) !== "Queued") throw new Error("NOT_QUEUED");

                // 2) Aynı station’da InProgress var mı?
                const inProgQ = db
                    .collection("QueueEntry")
                    .where("stationId", "==", stationId)
                    .where("queueStatus", "in", ["InProgress", " InProgress"])
                    .limit(1);

                const inProgSnap = await tx.get(inProgQ);
                if (!inProgSnap.empty) throw new Error("ALREADY_IN_PROGRESS");

                // Prepare related booking (if any) before writes
                const bookingId = entry.bookingId;
                let bookingRef = null;
                if (bookingId) {
                    bookingRef = db.collection("Booking").doc(bookingId);
                    await tx.get(bookingRef);
                }


                tx.update(entryRef, {
                    queueStatus: "InProgress",
                    startedAt: FieldValue.serverTimestamp(),
                    startedBy: operatorId ?? null,
                });

                if (bookingRef) {
                    tx.set(
                        bookingRef,
                        {
                            bookingStatus: "InProgress",
                            queueStatus: "InProgress",
                            startedAt: FieldValue.serverTimestamp(),
                            updatedAt: FieldValue.serverTimestamp(),
                        },
                        { merge: true }
                    );
                }
            });

            return res.status(200).json({ message: "Service started" });
        } catch (err) {
            console.error("startService error:", err);

            const code = String(err?.message || "UNKNOWN");
            const map = {
                ENTRY_NOT_FOUND: [404, "Queue entry not found"],
                STATION_ID_MISSING: [400, "stationId missing on entry"],
                NOT_QUEUED: [409, "Entry is not in Queued status"],
                ALREADY_IN_PROGRESS: [409, "There is already an InProgress entry for this station"],
            };

            if (map[code]) {
                const [status, msg] = map[code];
                return res.status(status).json({ error: msg, code });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

exports.completeService = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { queueEntryId, operatorId } = req.body || {};
            if (!queueEntryId) {
                return res.status(400).json({ error: "queueEntryId is required" });
            }

            // Operator yetki kontrolü
            if (operatorId) {
                const opSnap = await db.collection("Operator").doc(operatorId).get();
                if (!opSnap.exists) {
                    return res.status(403).json({ error: "Operator not found", code: "OPERATOR_NOT_AUTHORIZED" });
                }
                if (opSnap.data().Status !== "Active") {
                    return res.status(403).json({ error: "Operator is not active", code: "OPERATOR_NOT_ACTIVE" });
                }
            }

            const entryRef = db.collection("QueueEntry").doc(queueEntryId);

            await db.runTransaction(async (tx) => {
                const snap = await tx.get(entryRef);
                if (!snap.exists) throw new Error("ENTRY_NOT_FOUND");

                const entry = snap.data();

                // Sadece InProgress tamamlanabilir
                if (normStatus(entry.queueStatus) !== "InProgress") throw new Error("NOT_IN_PROGRESS");

                // startedAt yoksa tamamlamaya izin verme
                if (!entry.startedAt) throw new Error("MISSING_STARTED_AT");


                if (entry.completedAt) throw new Error("ALREADY_COMPLETED");


                const stationId = entry.stationId;
                let stationRef = null;
                let stationData = null;
                if (stationId) {
                    stationRef = db.collection("Station").doc(stationId);
                    const stationSnap = await tx.get(stationRef);
                    stationData = stationSnap.exists ? stationSnap.data() : {};
                }
                const bookingId = entry.bookingId;
                let bookingRef = null;
                if (bookingId) {
                    bookingRef = db.collection("Booking").doc(bookingId);
                    await tx.get(bookingRef);
                }

                const completedAt = Timestamp.now();
                tx.update(entryRef, {
                    queueStatus: "Completed",
                    completedAt,
                    completedBy: operatorId ?? null,
                });

                // Update station stats here to avoid trigger dependency
                if (stationRef && stationData) {
                    const startedMs = toMillis(entry.startedAt || entry.queuedAt);
                    const completedMs = toMillis(completedAt);
                    if (startedMs && completedMs && completedMs > startedMs) {
                        const serviceTimeMin = (completedMs - startedMs) / 60000;
                        const previousTotal = Number(stationData.totalServiceTimeMin ?? 0);
                        const previousCompletedJobs = Number(stationData.completedJobsCount ?? 0);
                        const newTotal = previousTotal + serviceTimeMin;
                        const newCompletedJobs = previousCompletedJobs + 1;
                        const newAverageServicingTime = newTotal / newCompletedJobs;

                        tx.set(
                            stationRef,
                            {
                                totalServiceTimeMin: newTotal,
                                completedJobsCount: newCompletedJobs,
                                avgServiceTimeMin: newAverageServicingTime,
                            },
                            { merge: true }
                        );
                    }
                }

                if (bookingRef) {
                    tx.set(
                        bookingRef,
                        {
                            bookingStatus: "Completed",
                            queueStatus: "Completed",
                            completedAt,
                            updatedAt: FieldValue.serverTimestamp(),
                        },
                        { merge: true }
                    );
                }
            });

            return res.status(200).json({ message: "Service completed" });
        } catch (err) {
            console.error("completeService error:", err);

            const code = String(err?.message || "UNKNOWN");
            const map = {
                ENTRY_NOT_FOUND: [404, "Queue entry not found"],
                NOT_IN_PROGRESS: [409, "Only InProgress entries can be completed"],
                MISSING_STARTED_AT: [409, "Cannot complete: startedAt is missing"],
                ALREADY_COMPLETED: [409, "Entry is already completed"],
            };

            if (map[code]) {
                const [status, msg] = map[code];
                return res.status(status).json({ error: msg, code });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

exports.cancelQueueEntry = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { queueEntryId, operatorId, reason } = req.body || {};
            if (!queueEntryId) {
                return res.status(400).json({ error: "queueEntryId is required" });
            }

            // Operator yetki kontrolü
            if (operatorId) {
                const opSnap = await db.collection("Operator").doc(operatorId).get();
                if (!opSnap.exists) {
                    return res.status(403).json({ error: "Operator not found", code: "OPERATOR_NOT_AUTHORIZED" });
                }
                if (opSnap.data().Status !== "Active") {
                    return res.status(403).json({ error: "Operator is not active", code: "OPERATOR_NOT_ACTIVE" });
                }
            }

            const entryRef = db.collection("QueueEntry").doc(queueEntryId);
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(entryRef);
                if (!snap.exists) throw new Error("ENTRY_NOT_FOUND");
                const entry = snap.data();
                if (normStatus(entry.queueStatus) !== "Queued") throw new Error("ONLY_QUEUED_CAN_BE_CANCELLED");

                tx.update(entryRef, {
                    queueStatus: "Cancelled",
                    cancelledAt: FieldValue.serverTimestamp(),
                    cancelledBy: operatorId ?? null,
                    cancellationReason: reason ?? "NoShow",
                });

                const bookingId = entry.bookingId;
                if (bookingId) {
                    const bookingRef = db.collection("Booking").doc(bookingId);
                    tx.update(
                        bookingRef,
                        {
                            bookingStatus: "Cancelled",
                            queueStatus: "Cancelled",
                            cancelledAt: FieldValue.serverTimestamp(),
                            updatedAt: FieldValue.serverTimestamp(),
                        },
                    );
                }
            });
            return res.status(200).json({ success: true, queueEntryId });
        } catch (err) {
            console.error("cancelQueueEntry error:", err);

            const code = String(err?.message || "UNKNOWN");
            const map = {
                ENTRY_NOT_FOUND: [404, "Queue entry not found"],
                ONLY_QUEUED_CAN_BE_CANCELLED: [409, "Only Queued entries can be cancelled"],
            };
            if (map[code]) {
                const [status, msg] = map[code];
                return res.status(status).json({ error: msg, code });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);
exports.getActiveStations = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      const snap = await db
        .collection("Station")
        .where("status", "==", "active")
        .get();

      const stations = snap.docs.map((d) => {
        const s = d.data() || {};

        const avgServiceTimeMin = Number(s.avgServiceTimeMin ?? 0);
        const completedJobsCount = Number(s.completedJobsCount ?? 0);
        const totalServiceTimeMin = Number(s.totalServiceTimeMin ?? 0);

        const targetUtilization = 0.8;
        const slotTimeInterval = 15;

        const muPerMin = muPerMinFromAvgServiceTime(avgServiceTimeMin);
        const lambdaTarget = lambdaTargetPerMin(muPerMin, targetUtilization);
        const optimalTruck = optimalTruckPerSlot(
          avgServiceTimeMin,
          slotTimeInterval,
          targetUtilization
        );

        let confidence = "Low";
        if (completedJobsCount >= 10) {
          confidence = "High";
        } else if (completedJobsCount >= 3) {
          confidence = "Medium";
        }

        return {
          id: d.id,
          name: s.name || s.stationName || s.Name || s.code || "Station",
          code: s.code || "",
          status: s.status || "active",
          type: s.type || "",
          contactName: s.contactName || "",
          phone: s.phone || "",
          avgServiceTimeMin,
          completedJobsCount,
          totalServiceTimeMin,

          // hesaplanan alanlar
          muPerMin,
          lambdaTargetPerMin: lambdaTarget,
          optimalTruckPerSlot: optimalTruck,
          targetUtilization,
          slotTimeInterval,
          confidence,
        };
      });

      return res.json({ stations });
    } catch (err) {
      console.error("getActiveStations error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);
exports.getStationQueue = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { stationId, limit } = req.body || {};
            if (!stationId) {
                return res.status(400).json({ error: "stationId is required" });
            }

            const LIM = Math.min(Math.max(Number(limit || 50), 1), 200);

            // Sadece aktif queue stateleri
            const snap = await db
                .collection("QueueEntry")
                .where("stationId", "==", stationId)
                .where("queueStatus", "in", ["Queued", " InProgress", "InProgress", " Queued"]) // Cancelled/Completed gelmesin
                .orderBy("queuedAt", "asc")
                .limit(LIM)
                .get();

            const queueRaw = snap.docs.map((d) => {
                const q = d.data() || {};
                return {
                    id: d.id,
                    stationId: q.stationId || stationId,
                    carrierId: q.carrierId || null,
                    slotKey: q.slotKey || null,
                    queueStatus: normStatus(q.queueStatus) || "Queued",
                    queuedAt: toMillis(q.queuedAt),
                    startedAt: toMillis(q.startedAt),
                    completedAt: toMillis(q.completedAt),
                    createdAt: toMillis(q.createdAt),
                    truckPlate: q.truckPlate || q.truck || "",
                    commodity: q.commodity || "",
                };
            });

            // Carrier ad/plaka bilgilerini toplu çek (admin SDK ile, kural sorunu yok)
            const uniqueCarrierIds = [...new Set(queueRaw.map((x) => x.carrierId).filter(Boolean))];
            const carrierDocs = await Promise.all(
                uniqueCarrierIds.map((id) => db.collection("Carrier").doc(id).get())
            );
            const carrierLookup = {};
            carrierDocs.forEach((snap) => {
                if (snap.exists) {
                    const d = snap.data();
                    const firstName = String(d.Name ?? d.name ?? "").trim();
                    const lastName = String(d.Surname ?? d.surname ?? "").trim();
                    const fullName = [firstName, lastName].filter(Boolean).join(" ") || snap.id;
                    carrierLookup[snap.id] = {
                        carrierName: fullName,
                        carrierPlate: String(d.Vehicle_Plate ?? d.plate ?? ""),
                    };
                }
            });

            const queue = queueRaw.map((entry) => ({
                ...entry,
                ...(carrierLookup[entry.carrierId] || {}),
            }));

            const inServiceCount = queue.filter((x) => x.queueStatus === "InProgress").length;

            return res.json({ stationId, queue, inServiceCount });
        } catch (err) {
            console.error("getStationQueue error:", err);

            // Firestore 'in' + orderBy index isteyebilir
            // Index error gelirse console linki verir.
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);
