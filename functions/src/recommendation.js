const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const db = admin.firestore();

const REGION = "us-central1";

const {
    SLOT_INTERVAL_MIN,
    HISTORY_DAYS,
    parseISO,
    isValidSlotStart,
    slotKeyFromStart,
    slotIdFromStart,
    muPerMinFromAvgServiceTime,
    mm1Wq,
} = require("./utils");

exports.getStationsMM1ForSlotStart = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { startSlotIso, endSlotIso } = req.body || {};
            if (!startSlotIso) {
                res.status(400).json({ error: "slotStart is required" });
                return;
            }
            const slotStartDate = parseISO(startSlotIso);
            const slotEndDate = parseISO(endSlotIso);

            const slotKey = slotKeyFromStart(slotStartDate);

            const historyStart = admin.firestore.Timestamp.fromMillis(slotStartDate.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

            const stationSnap = await db.collection("Station")
                .where("status", "==", "active").get();

            const stations = await Promise.all(
                stationSnap.docs.map(async (doc) => {
                    const s = doc.data();
                    const stationId = doc.id;

                    const averageServiceTime = Number(s.averageServiceTimeMin ?? 0);
                    const mu = muPerMinFromAvgServiceTime(averageServiceTime);

                    const historyData = await db.collection("QueueEntry")
                        .where("stationId", "==", stationId)
                        .where("createdAt", ">=", historyStart)
                        .count().get();

                    const pastArrivals = historyData.data().count || 0;
                    const lambda = pastArrivals / (HISTORY_DAYS * SLOT_INTERVAL_MIN);
                    const wq = mm1Wq(lambda, mu);
                    const approximatedWaitingTime = wq.stable ? wq.Wq : Infinity;

                    return {
                        stationId,
                        slotStartDate,
                        slotEndDate,
                        lambda,
                        mu,
                        rho: wq.rho,
                        approximatedWaitingTime
                    };
                })
            )
            stations.sort((a, b) => a.approximatedWaitingTime - b.approximatedWaitingTime);
            return res.json({
                slotStartDate,
                slotEndDate,
                stations,
                bestStationId: stations[0]?.stationId ?? null,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);