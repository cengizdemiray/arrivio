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
    validateStationRemoval,
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

describe("Carrier Block/Unblock Testleri",()=>{
    test("Carrier Block -> Status Blocked",async()=>{
        const carrierData = {
            Name: "Ahmet",
            Surname: "Kaya",
            Vehicle_Plate: "34 ABC 123",
            Carrier_ID: "CR-001",
            Status: "Active",
        };
        const carrierRef = await db.collection("Carrier").add(carrierData);
        const blockPayload = buildBlockPayload(
            "Kural ihlali",       // reason
            "Hız limiti aşıldı",  // message
            "2026-06-01",         // until
            "admin-uid-123"       // adminUid
        );
        await db.collection("Carrier").doc(carrierRef.id).update(blockPayload);

        const snap = await db.collection("Carrier").doc(carrierRef.id).get();
        expect(snap.data().Status).toBe("Blocked");
        expect(snap.data().BlockReason).toBe("Kural ihlali");
        expect(snap.data().BlockMessage).toBe("Hız limiti aşıldı");
        expect(snap.data().BlockUntil).toBe("2026-06-01");
        expect(snap.data().UpdatedByUid).toBe("admin-uid-123");
    });
    test("Carrier Unblock -> Status Active",async()=>{
        const carrierRef = await db.collection("Carrier").add({
            Name: "Mehmet",
            Surname: "Demir",
            Vehicle_Plate: "06 XYZ 789",
            Carrier_ID: "CR-002",
            Status: "Blocked",
            BlockReason: "Kaza",
            BlockMessage: "Araç hasarlı",
            BlockUntil: "2026-07-01",
        });
        const unblockPayload = buildUnblockPayload("admin-uid-123");
        await db.collection("Carrier").doc(carrierRef.id).update(unblockPayload);

        const snap = await db.collection("Carrier").doc(carrierRef.id).get();
        expect(snap.data().Status).toBe("Active");
        expect(snap.data().BlockReason).toBe("");
        expect(snap.data().BlockMessage).toBe("");
        expect(snap.data().BlockUntil).toBe("");
    });
    test("Expired Block -> Automatic unblock",async()=>{
        const carrierRef = await db.collection("Carrier").add({
            Name: "Emre",
            Surname: "Koç",
            Vehicle_Plate: "41 MNO 987",
            Carrier_ID: "CR-006",
            Status: "Blocked",
            BlockMessage:"Haber vermeden gecikme",
            BlockReason: "Gecikme",
            BlockUntil: "2026-05-01",
        });
        const snap = await db.collection("Carrier").doc(carrierRef.id).get();
        const carrier = normalizeCarrier(snap.id,snap.data());
        expect(isBlockExpired(carrier)).toBe(true);
        if(isBlockExpired(carrier)){
            const unblockPayload = buildUnblockPayload("system-auto");
            await db.collection("Carrier").doc(carrierRef.id).update(unblockPayload);
        }
        const updatedSnap = await db.collection("Carrier").doc(carrierRef.id).get();
        expect(updatedSnap.data().Status).toBe("Active");
        expect(updatedSnap.data().BlockReason).toBe("");
        expect(updatedSnap.data().BlockMessage).toBe("");
        expect(updatedSnap.data().BlockUntil).toBe("");
    });
});
describe("Add/Remove Station Tests",()=>{
    test("Adding Station",async()=>{
        const validation = validateStationInput("33.35","35.18","Alpha İstasyon","active");
        expect(validation.valid).toBe(true);
        const stationId = generateStationId(1);
        expect(stationId).toBe("ST-1");

        const stationDoc = buildStationDocument({
            longitude: validation.longitude,
            latitude: validation.latitude,
            status: validation.status,
            stationId: stationId,
            stationName: validation.stationName,
            contactName: "Cengiz Demiray",
            phone: "05052203805",
            createdByUid: "admin-uid-123",
        });
        await db.collection("Station").doc("station-1").set(stationDoc);
        const snap = await db.collection("Station").doc("station-1").get();
        expect(snap.exists).toBe(true);
        expect(snap.data().StationId).toBe("ST-1");
        expect(snap.data().longitude).toBe(33.35);
        expect(snap.data().latitude).toBe(35.18);
        expect(snap.data().Name).toBe("Alpha İstasyon");
        expect(snap.data().status).toBe("active");
    });
    test("Removing Station",async()=>{
        await db.collection("Station").doc("st-a").set({
            stationId: "ST-1", Name: "İstasyon A", status: "active",
        });
        await db.collection("Station").doc("st-b").set({
            stationId: "ST-2", Name: "İstasyon B", status: "active",
        });
        const removal = validateStationRemoval(["st-a"]);
        expect(removal.valid).toBe(true);
        for(const id of removal.ids){
            await db.collection("Station").doc(id).delete();
        }
        const deletedSnap = await db.collection("Station").doc("st-a").get();
        expect(deletedSnap.exists).toBe(false);

        const deletedSnap2 = await db.collection("Station").doc("st-b").get();
        expect(deletedSnap2.exists).toBe(true);
    });
});

describe("Facility Update Tests",()=>{
    test("Valid Facility update",async()=>{
        await db.collection("Facility").doc("fac-1").set({
            Name: "Eski İsim",
            Adress: "Eski Adres",
            Status: "Active",
            contactName: "",
            phone: "",
        });
        const update = buildFacilityUpdate({
            name: "Esenler Lojistik Merkezi",
            address: "Yenimahalle Cad. No: 5 / Esenler, Istanbul",
            status: "Active",
            contactName: "Cengiz Demiray",
            phone: "05052203805",
            weekdayStart: "08:00",
            weekdayEnd: "18:00",
            weekendStart: "09:00",
            weekendEnd: "14:00",
        });
        await db.collection("Facility").doc("fac-1").update(update);
        const snap = await db.collection("Facility").doc("fac-1").get();
        expect(snap.data().Name).toBe("Esenler Lojistik Merkezi");
        expect(snap.data().Adress).toBe("Yenimahalle Cad. No: 5 / Esenler, Istanbul");
        expect(snap.data().contactName).toBe("Cengiz Demiray");
        expect(snap.data().weekdayStart).toBe("08:00");
        expect(snap.data().weekendEnd).toBe("14:00");
    });
});