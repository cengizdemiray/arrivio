process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({ projectId: "arrivio-271aa" });
}
const db = admin.firestore();

const BASE_URL = "http://127.0.0.1:5001/arrivio-271aa/europe-west3";

async function clearCollection(name) {
    const snap = await db.collection(name).get();
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
}

/*afterEach(async () => {
    await clearCollection("Booking");
    await clearCollection("QueueEntry");
    await clearCollection("Station");
    await clearCollection("_counters");
});*/

afterAll(async () => {
    await admin.app().delete();
});

describe("Enter queue",()=>{
    test("Successfull enterQueue",async()=>{
        const res = await fetch(`${BASE_URL}/enterQueue`,{
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "carrier-1",
                stationId: "ST-1",
                slotStart: "2026-05-05T10:00:00Z",
                slotEnd: "2026-05-05T10:15:00Z"
            }),
        });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.bookingId).toBe("B-1");
        expect(data.queueEntryId).toBe("Q-1");

        const bookingSnap = await db.collection("Booking").doc("B-1").get();
        expect(bookingSnap.exists).toBe(true);
        expect(bookingSnap.data().carrierId).toBe("carrier-1");
        expect(bookingSnap.data().stationId).toBe("ST-1");
        expect(bookingSnap.data().bookingStatus).toBe("Active");
        
        const queueSnap = await db.collection("QueueEntry").doc("Q-1").get();
        expect(queueSnap.exists).toBe(true);
        expect(queueSnap.data().bookingId).toBe("B-1");
        expect(queueSnap.data().carrierId).toBe("carrier-1");
        expect(queueSnap.data().queueStatus).toBe("Queued");
    });
    test("Counter should be updated properly",async()=>{
        await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                slotStart: "2026-05-05T10:00:00Z", slotEnd: "2026-05-05T10:15:00Z",
            }),    
        });
        const res = await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-2", stationId: "ST-1",
                slotStart: "2026-05-04T10:15:00Z", slotEnd: "2026-05-04T10:30:00Z",
            }),
        });
        const data = await res.json();
        expect(data.bookingId).toBe("B-2");
        expect(data.queueEntryId).toBe("Q-2");
    });
    test("stationId is compulsory for entering queue",async()=>{
        const res = await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ carrierId: "C-1" }), // stationId yok
        });
        expect(res.status).toBe(400);
        const bookingSnap = await db.collection("Booking").get();
        expect(bookingSnap.empty).toBe(true);
        const queueSnap = await db.collection("QueueEntry").get();
        expect(queueSnap.empty).toBe(true);
    });
});

describe("Start Service",()=>{
    test("Queued entry -> Inprogress",async()=>{
        const enterRes = await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                slotStart: "2026-05-05T10:00:00Z", slotEnd: "2026-05-05T10:15:00Z",
            }),
        });
        const enterData = await enterRes.json();
        await new Promise((r) => setTimeout(r, 30000));
        const res = await fetch(`${BASE_URL}/startService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                queueEntryId: enterData.queueEntryId,
                operatorId: "OP-1",
            }),
        });
        expect(res.status).toBe(200);

        const queueSnap = await db.collection("QueueEntry").doc(enterData.queueEntryId).get();
        expect(qSnap.data().queueStatus).toBe("InProgress");
        expect(qSnap.data().startedBy).toBe("OP-1");
        expect(qSnap.data().startedAt).toBeTruthy();

        const bSnap = await db.collection("Booking").doc(enterData.bookingId).get();
        expect(bSnap.data().bookingStatus).toBe("InProgress");

    },90000);
    test("Only one Inprogress entry should be allowed per station",async()=>{
        const enter1 = await (await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                slotStart: "2026-05-04T10:00:00Z", slotEnd: "2026-05-04T10:15:00Z",
            }),
        })).json();
        const enter2 = await (await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-2", stationId: "ST-1",
                slotStart: "2026-05-04T10:15:00Z", slotEnd: "2026-05-04T10:30:00Z",
            }),
        })).json();
        await fetch(`${BASE_URL}/startService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enter1.queueEntryId }),
        });
        await new Promise((r) => setTimeout(r, 30000));
        const res = await fetch(`${BASE_URL}/startService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enter2.queueEntryId }),
        });
        expect(res.status).toBe(409);
        const qSnap = await db.collection("QueueEntry").doc(enter2.queueEntryId).get();
        expect(qSnap.data().queueStatus).toBe("Queued");
    },120000);
});
describe("Complete Service",()=>{
    test("InProgress entry -> Completed",async()=>{
        await db.collection("Station").doc("ST-1").set({
            status: "active", avgServiceTimeMin: 0,
            totalServiceTimeMin: 0, completedJobsCount: 0,
        });
        const enterData = await (await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                slotStart: "2026-05-04T10:00:00Z", slotEnd: "2026-05-04T10:15:00Z",
            }),
        })).json();
        console.log("Queued oluştu, SS al!");
        await new Promise((r) => setTimeout(r, 30000));

        await fetch(`${BASE_URL}/startService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enterData.queueEntryId }),
        });
        console.log("InProgress oldu, SS al!");
        await new Promise((r) => setTimeout(r, 60000));
        const res = await fetch(`${BASE_URL}/completeService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                queueEntryId: enterData.queueEntryId,
                operatorId: "OP-1",
            }),
        });
        expect(res.status).toBe(200);
        const qSnap = await db.collection("QueueEntry").doc(enterData.queueEntryId).get();
        expect(qSnap.data().queueStatus).toBe("Completed");
        expect(qSnap.data().completedAt).toBeTruthy();
        expect(qSnap.data().completedBy).toBe("OP-1");

        const bSnap = await db.collection("Booking").doc(enterData.bookingId).get();
        expect(bSnap.data().bookingStatus).toBe("Completed");

        const sSnap = await db.collection("Station").doc("ST-1").get();
        expect(sSnap.data().completedJobsCount).toBe(1);
        expect(sSnap.data().totalServiceTimeMin).toBeGreaterThan(0);
        expect(sSnap.data().avgServiceTimeMin).toBeGreaterThan(0);
    },150000);
});
describe("Cancel Queue Entry",()=>{
    test("Queued entry -> Cancelled",async()=>{
        const enterData = await (await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                lotStart: "2026-05-04T10:00:00Z", slotEnd: "2026-05-04T10:15:00Z",
            }),
        })).json();
        console.log("Queued oluştu, SS al!");
        await new Promise((r) => setTimeout(r, 30000));
        const res = await fetch(`${BASE_URL}/cancelQueueEntry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                queueEntryId: enterData.queueEntryId,
            }),
        });
        expect(res.status).toBe(200);
        const qSnap = await db.collection("QueueEntry").doc(enterData.queueEntryId).get();
        expect(qSnap.data().queueStatus).toBe("Cancelled");

        const bSnap = await db.collection("Booking").doc(enterData.bookingId).get();
        expect(bSnap.data().bookingStatus).toBe("Cancelled");
    },120000);
    test("Inprogress entry cannot be cancelled",async()=>{
        const enterData = await (await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                slotStart: "2026-05-04T10:00:00Z", slotEnd: "2026-05-04T10:15:00Z",
            }),
        })).json();
        await fetch(`${BASE_URL}/startService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enterData.queueEntryId }),
        });
        console.log("InProgress oldu, SS al!");
        await new Promise((r) => setTimeout(r, 30000));
        const res = await fetch(`${BASE_URL}/cancelQueueEntry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enterData.queueEntryId }),
        });
        expect(res.status).toBe(409);
        const qSnap = await db.collection("QueueEntry").doc(enterData.queueEntryId).get();
        expect(qSnap.data().queueStatus).toBe("InProgress");
    },120000);
});
describe("Full Lifecycle Test",()=>{
    test("enterQueue -> startService -> completeService",async()=>{
        await db.collection("Station").doc("ST-1").set({
            status: "active", avgServiceTimeMin: 0,
            totalServiceTimeMin: 0, completedJobsCount: 0,
        });
        const enterData = await (await fetch(`${BASE_URL}/enterQueue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                carrierId: "C-1", stationId: "ST-1",
                slotStart: "2026-05-04T10:00:00Z", slotEnd: "2026-05-04T10:15:00Z",
            }),
        })).json();
        console.log("1) Queued oluştu, SS al!");
        await new Promise((r) => setTimeout(r, 30000));

        await fetch(`${BASE_URL}/startService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enterData.queueEntryId, operatorId: "OP-1" }),
        });

        console.log("2) InProgress oldu, SS al!");
        await new Promise((r) => setTimeout(r, 90000));

        await fetch(`${BASE_URL}/completeService`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queueEntryId: enterData.queueEntryId, operatorId: "OP-1" }),
        });
        const qSnap = await db.collection("QueueEntry").doc(enterData.queueEntryId).get();
        expect(qSnap.data().queueStatus).toBe("Completed");

        const bSnap = await db.collection("Booking").doc(enterData.bookingId).get();
        expect(bSnap.data().bookingStatus).toBe("Completed");

        const allEntries = await db.collection("QueueEntry").get();
        expect(allEntries.size).toBe(1);

        const allBookings = await db.collection("Booking").get();
        expect(allBookings.size).toBe(1);
        const sSnap = await db.collection("Station").doc("ST-1").get();
        expect(sSnap.data().completedJobsCount).toBe(1);
    },180000);
});
