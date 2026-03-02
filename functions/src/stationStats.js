const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const REGION = "europe-west3";

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.toMillis === "function") return new Date(value.toMillis());
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value.seconds === "number") {
        const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
        return new Date(ms);
    }
    return null;
}

exports.updateStationAverageServiceTime = onDocumentUpdated(
    { document: "QueueEntry/{entryId}", region: REGION },
    async (event) => {
        const change = event?.data;
        const beforeSnap = change?.before;
        const afterSnap = change?.after;
        console.log(beforeSnap.data(), afterSnap.data());
        if (!beforeSnap || !afterSnap) {
            console.warn("stationStats: missing change data", {
                hasData: Boolean(change),
                eventKeys: Object.keys(event || {}),
            });
            return;
        }
        
        const before = beforeSnap.data();
        const after = afterSnap.data();
        if (!before || !after) return;

        console.log("stationStats: trigger", {
            entryId: event?.params?.entryId,
            beforeStatus: before.queueStatus,
            afterStatus: after.queueStatus,
            stationId: after.stationId,
        });

        const becameCompleted = before.queueStatus !== "Completed" && after.queueStatus === "Completed";
        if (!becameCompleted) return;

        const stationId = after.stationId;
        if (!stationId) {
            console.warn("stationStats: missing stationId", { entryId: event?.params?.entryId });
            return;
        }

        const startedRaw = after.startedAt || after.queuedAt;
        const endedRaw = after.completedAt;
        const started = toDate(startedRaw);
        const ended = toDate(endedRaw);
        if (!started || !ended) {
            console.warn("stationStats: missing timestamps", {
                entryId: event?.params?.entryId,
                stationId,
                startedRaw,
                endedRaw,
            });
            return;
        }

        const serviceTimeMin = (ended.getTime() - started.getTime()) / 60000;
        if (!Number.isFinite(serviceTimeMin) || serviceTimeMin <= 0) return;
        const stationEntity = db.collection("Station").doc(stationId);
        try {
            await db.runTransaction(async(t)=>{
                const snapShot = await t.get(stationEntity);
                const snapShotData = snapShot.exists ? snapShot.data() : {};
                const previousTotal = Number(snapShotData.totalServiceTimeMin ?? 0);
                const previousCompletedJobs = Number(snapShotData.completedJobsCount ?? 0);
                const newTotal = previousTotal + serviceTimeMin;
                const newCompletedJobs = previousCompletedJobs + 1;
                const newAverageServicingTime = newTotal / newCompletedJobs;

                t.set(
                    stationEntity,
                    {
                        totalServiceTimeMin: newTotal,
                        completedJobsCount: newCompletedJobs,
                        avgServiceTimeMin: newAverageServicingTime,
                    },
                    {merge: true}
                );
            });
            console.log("stationStats: updated", { stationId, serviceTimeMin });
        } catch (err) {
            console.error("stationStats: update failed", { stationId, error: String(err?.message || err) });
        }
    }
);
