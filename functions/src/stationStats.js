const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const REGION = "us-central1";

exports.updateStationAverageServiceTime = onDocumentUpdated(
    { document: "QueueEntry/{entryId}", region: REGION },
    async (event) => {
        const before = event.data.before.data();
        const after = event.data.after.data();

        const becameCompleted = before.queueStatus !== "Completed" && after.queueStatus === "Completed";
        if (!becameCompleted) return;

        const stationId = after.stationId;
        if (!stationId) return;

        const started = after.startedAt?.toDate?.();
        const ended = after.completedAt?.toDate?.();
        if (!started || !ended) return;

        const serviceTimeMin = (ended.getTime() - started.getTime()) / 60000;
        if (!Number.isFinite(serviceTimeMin) || serviceTimeMin <= 0) return;
        const stationEntity = db.collection("Station").doc(stationId);
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
    }
);