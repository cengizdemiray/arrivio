const mockTxGet = jest.fn();
const mockTxSet = jest.fn();
const mockTxUpdate = jest.fn();
const mockRunTransaction = jest.fn((cb) =>
  cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate })
);
const mockDoc = jest.fn((id) => ({ _id: id }));
const mockLimit = jest.fn(() => ({ _type: "query" }));
const mockWhere = jest.fn(() => ({ where: mockWhere, limit: mockLimit }));
const mockCollection = jest.fn(() => ({ doc: mockDoc, where: mockWhere }));

jest.mock("firebase-admin",()=>{
    const firestore=()=>({
        collection: mockCollection,
        runTransaction: mockRunTransaction,
    })
    firestore.Timestamp = {
        fromDate: (d)=>({
            _date:d,
            toDate: () => d
        }),
        now: ()=>({
            _date: new Date(),
            toDate: ()=> new Date()
        })
    }
    firestore.FieldValue = {
        serverTimestamp: ()=>"SERVER_TIMESTAMP"
    };
    return{
        apps: [{}],
        initializeApp: jest.fn(),
        firestore,
    };
}, { virtual: true });

jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (_opts, handler) => handler,
}), { virtual: true });

jest.mock("cors", () => jest.fn(() => jest.fn()), { virtual: true });
const { enterQueue, startService } = require("../../functions/src/queue");
function makeReq(body){
    return {body};
}

function makeRes(){
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}
/** Testler */
describe("enterQueue",()=>{
    beforeEach(() => {
        jest.clearAllMocks();
        mockTxGet.mockResolvedValue({
        exists: true,
        data: () => ({ lastNumber: 0 }),
        });
    });
    test("400 - body tamamen boş",async()=>{
        const res = makeRes();
        await enterQueue(makeReq({}),res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("required")})
        );
    });
    test("400 - carrierId eksik",async()=>{
        const res = makeRes();
        await enterQueue(makeReq({
            stationId: "ST-1",
            slotStart: "2026-04-26T10:00:00Z",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("required")})
        );
    });
    test("400 - stationId eksik", async()=>{
        const res = makeRes();
        await enterQueue(makeReq({
            carrierId: "C-1",
            slotStart: "2026-04-26T10:00:00Z",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("required")})
        );
    });
    test("400 - geçersiz tarih formatı",async()=>{
        const res = makeRes();
        await enterQueue(makeReq({
            carrierId: "C-1",
            stationId: "ST-1",
            slotStart: "invalid-date",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("Invalid")})
        );
    });
    test("200 - başarılı booking + queueEntry oluşturma",async()=>{
        const res = makeRes();
        await enterQueue(makeReq({
            carrierId: "C-1",
            stationId: "ST-1",
            slotStart: "2026-04-26T10:00:00Z",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                bookingId: "B-1",
                queueEntryId: "Q-1",
            })
        );
    });
    test("200 - counter mevcut değerden artıyor",async()=>{
        mockTxGet.mockResolvedValue({
            exists: true,
            data: () => ({ lastNumber: 5 }),
        });
        const res = makeRes();
        await enterQueue(makeReq({
            carrierId: "C-1",
            stationId: "ST-1",
            slotStart: "2026-04-26T10:00:00Z",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                bookingId: "B-6",
                queueEntryId: "Q-6",
            })
        );
    });
    test("200 - Transaction içinde 4 set çağrısı yapıldı",async()=>{
        const res = makeRes();
        await enterQueue(makeReq({
            carrierId: "C-1",
            stationId: "ST-1",
            slotStart: "2026-04-26T10:00:00Z",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(mockRunTransaction).toHaveBeenCalledTimes(1);
        expect(mockTxSet).toHaveBeenCalledTimes(4);
    });
    test("200 - counter dökümanı yoksa 0'dan başla",async()=>{
        mockTxGet.mockResolvedValue({
            exists: false,
            data: () => null,
        });
        const res = makeRes();
        await enterQueue(makeReq({
            carrierId: "C-1",
            stationId: "ST-1",
            slotStart: "2026-04-26T10:00:00Z",
            slotEnd:   "2026-04-26T10:15:00Z",
        }), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                bookingId: "B-1",
                queueEntryId: "Q-1",
            })
        );
    });
});

describe("startService",()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });
    test("400 - queueEntryId eksik", async()=>{
        const res = makeRes();
        await startService(makeReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("required")})
        );
    });
    test("404 - entry bulunamadı",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: false,
        });
        const res = makeRes();
        await startService(makeReq({queueEntryId: "Q-1000"}),res);
        expect(res.status).toHaveBeenCalledWith(404);
    });
    test("409 - entry status Queued olmalı",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                stationId: "ST-1",
                queueStatus: "InProgress",
            }),
        });
        const res = makeRes();
        await startService(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "NOT_QUEUED" })
        );
    });
    test("409 - station şuan servis veriyor",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                stationId: "ST-1",
                queueStatus: "Queued",
            }),
        });
        mockTxGet.mockResolvedValueOnce({
            empty: false,
        });
        const res = makeRes();
        await startService(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "ALREADY_IN_PROGRESS" })
        );
    });
    test("400 - stationId bulunamadı",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "Queued",
                // stationId yok
            }),
        });
        const res = makeRes();
        await startService(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "STATION_ID_MISSING" })
        );
    });
    test("200 - başarılı servis başlatma",async()=>{
        // 1. tx.get(entryRef) = Queued entry
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                stationId: "ST-1",
                queueStatus: "Queued",
                bookingId: "B-1",
            }),
        });
        // 2. tx.get(inProgressQuery) = boş
        mockTxGet.mockResolvedValueOnce({
            empty: true,
        });
        // 3. tx.get(bookingRef) = mevcut
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({}),
        });
        const res = makeRes();
        await startService(makeReq({
            queueEntryId: "Q-1",
            operatorId: "OP-1",
        }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Service started" })
        );
        expect(mockTxUpdate).toHaveBeenCalledTimes(1);
        expect(mockTxSet).toHaveBeenCalledTimes(1);
    });
});

