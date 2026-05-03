process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
const admin = require("firebase-admin");
if(!admin.apps.length) {
    admin.initializeApp({ projectId: "arrivio-271aa" });
}

const db = admin.firestore();
const {
    normalizeRequest,
    buildApprovalDocument,
    filterPendingRequests,
    buildBlockPayload,
    buildUnblockPayload,
    normalizeCarrier,
    isBlockExpired,
    isAdminAuthorized,
    buildStationDocument,
    validateStationInput,
    generateStationId,
    buildFacilityUpdate,
} = require("../../admin/src/services/adminServices");

/**
 * Her test sonrası firestore temizlenir
 */
async function clearCollection(collectionName) {
    const snap = await db.collection(collectionName).get();
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
}
/*afterEach(async()=>{
    await clearCollection("operatorRequests");
    await clearCollection("Operator");
    await clearCollection("Carrier");
    await clearCollection("Station");
    await clearCollection("Admin");
});*/

describe("Operator Onaylama/Reddetme Testleri", () => {
    test("Pending Request -> Admin Approve -> Operator Created",async()=>{
        const requestData = {
            name: "Ali",
            surname: "Yılmaz",
            email: "ali@test.com",
            status: "Pending",
            createdAt: new Date().toISOString(),
        };
        const reqRef = await db.collection("operatorRequests").add(requestData);
        const normalized = normalizeRequest(reqRef.id,requestData);
        const approvalDoc = buildApprovalDocument(normalized);
        await db.collection("Operator").doc(reqRef.id).set(approvalDoc);
        await db.collection("operatorRequests").doc(reqRef.id).delete();

        const operatorSnap = await db.collection("Operator").doc(reqRef.id).get();
        expect(operatorSnap.exists).toBe(true);
        expect(operatorSnap.data().Role).toBe("operator");
        expect(operatorSnap.data().Status).toBe("Active");
        expect(operatorSnap.data().Email).toBe("ali@test.com");

        const pendingSnap = await db.collection("operatorRequests").doc(reqRef.id).get();
        expect(pendingSnap.exists).toBe(false);
    });

    test("Pending Request -> Admin Reject -> Operator Not Created",async()=>{
        const requestData = {
            name: "Cengiz",
            surname: "Demiray",
            email: "cengiz@test.com",
            status: "pending",
        };
        const reqRef = await db.collection("operatorRequests").add(requestData);
        await db.collection("operatorRequests").doc(reqRef.id).delete();

        const operatorSnap = await db.collection("Operator").doc(reqRef.id).get();
        expect(operatorSnap.exists).toBe(false);

        const pendingSnap = await db.collection("operatorRequests").doc(reqRef.id).get();
        expect(pendingSnap.exists).toBe(false);
    });

    test("Just status of pending should be reflected",async()=>{
        await db.collection("operatorRequests").add({
            name: "İlkay", surname: "Şimşek", email: "ilkay@test.com", status: "pending",
        })
        await db.collection("operatorRequests").add({
            name: "Buse", surname: "Kalender", email: "buse@test.com", status: "approved",
        });
        const snap = await db.collection("operatorRequests").get();
        const allRequests = snap.docs.map((d) =>
            normalizeRequest(d.id, d.data())
        );
        const pending = filterPendingRequests(allRequests);
        expect(pending.length).toBe(1);
        expect(pending[0].name).toBe("İlkay");
    });
});