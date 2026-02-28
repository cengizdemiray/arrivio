const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const REGION = "us-central1";

const {
    parseISO,
    slotKeyFromStart,
} = require("./utils");

//Entering Queue
exports.enterQueue = onRequest(
    { region: REGION, cors: true },
    async (req, res) => {
        try {
            const { carrierId, stationId, slotStart, slotEnd } = req.body;
            // Eksik veri gelirse
            if (!carrierId || !stationId || !slotStart || !slotEnd) {
                return res.status(400).json({ error: "All fields required" });
            }
            const slotStartDate = parseISO(slotStart);
            const slotEndDate = parseIso(slotEnd);
            const slotKey = slotKeyFromStart(slotStartDate);
            await db.collection(QueueEntry).add({
                carrierId,
                stationId,
                slotKey,
                queueStatus: "Queued",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return res.status(200).json({ message: "Entered queue" });
        } catch (err) {
            console.error("enterQueueMM1 error:", err);
            // Invalid date hatasını yakalamak için
            if (String(err?.message) === "INVALID_DATE") {
                return res.status(400).json({ error: "Invalid slotStart/slotEnd format" });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);
