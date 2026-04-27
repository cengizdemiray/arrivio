const mockTxGet = jest.fn();
const mockTxSet = jest.fn();
const mockTxUpdate = jest.fn();
const mockRunTransaction = jest.fn((cb) =>
  cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate })
);
const mockDoc = jest.fn((id) => ({ _id: id }));
const mockGet = jest.fn();
const mockOrderBy = jest.fn(() => ({ limit: mockLimit, get: mockGet }));
const mockLimit = jest.fn(() => ({ get: mockGet, _type: "query" }));
const mockWhere = jest.fn(() => ({
    where: mockWhere,
    limit: mockLimit,
    orderBy: mockOrderBy,
    get: mockGet,
}));
const mockCollection = jest.fn(() => ({
    doc: mockDoc,
    where: mockWhere,
    get: mockGet,
}));

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
const e = require("cors");
const { enterQueue, startService, completeService, cancelQueueEntry,getActiveStations,getStationQueue} = require("../../functions/src/queue");
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

describe("completeService",()=>{
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test("400 queueEntryId eksik",async()=>{
        const res = makeRes();
        await completeService(makeReq({}),res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("required")})
        );
    });
    test("404 - entry bulunamadı",async()=>{
        mockTxGet.mockResolvedValueOnce({ exists: false });
        const res = makeRes();
        await completeService(makeReq({ queueEntryId: "Q-1000" }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "ENTRY_NOT_FOUND" })
        );
    });
    test("409 - sadece Inprogress olan entry tamamlanabilir",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "Queued",
                stationId: "ST-1",
            }),
        });
        const res = makeRes();
        await completeService(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "NOT_IN_PROGRESS" })
        );
    });
    test("409 - startedAt null olamaz",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "InProgress",
                stationId: "ST-1",
                startedAt: null,  // eksik
            }),
        });
        const res = makeRes();
        await completeService(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "MISSING_STARTED_AT" })
        );
    });
    test("409 - zaten completed",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "InProgress",
                stationId: "ST-1",
                startedAt: 1000000,
                completedAt: 2000000,  // zaten var
            }),
        });
        const res = makeRes();
        await completeService(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "ALREADY_COMPLETED" })
        );
    });
    test("200 - başarılı servis tamamlama",async()=>{
        // 1. tx.get(entryRef) = InProgress entry
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "InProgress",
                stationId: "ST-1",
                bookingId: "B-1",
                startedAt: Date.now() - 600000, // 10 dk önce
                completedAt: null,
            }),
        });
        // 2. tx.get(stationRef) = station mevcut
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                totalServiceTimeMin: 30,
                completedJobsCount: 3,
                avgServiceTimeMin: 10,
            }),
        });
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({}),
        });
        const res = makeRes();
        await completeService(makeReq({
            queueEntryId: "Q-1",
            operatorId: "OP-1",
        }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Service completed" })
        );
        expect(mockTxUpdate).toHaveBeenCalledTimes(1);
        expect(mockTxSet).toHaveBeenCalledTimes(2);
    });
});

describe("cancelQueueEntry",()=>{
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test("400 - queueEntryId eksik",async()=>{
        const res = makeRes();
        await cancelQueueEntry(makeReq({}),res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({error: expect.stringContaining("required")})
        );
    });
    test("404 - entry bulunamadı",async()=>{
        mockTxGet.mockResolvedValueOnce({ exists: false });
        const res = makeRes();
        await cancelQueueEntry(makeReq({ queueEntryId: "Q-1000" }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "ENTRY_NOT_FOUND" })
        );
    });
    test("409 - sadece Queued entry iptal edilebilir",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "InProgress",
            }),
        });
        const res = makeRes();
        await cancelQueueEntry(makeReq({ queueEntryId: "Q-1" }), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "ONLY_QUEUED_CAN_BE_CANCELLED" })
        );
    });
    test("200 - başarılı iptal",async()=>{
        mockTxGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({
                queueStatus: "Queued",
                bookingId: "B-1",
            }),
        });
        const res = makeRes();
        await cancelQueueEntry(makeReq({
            queueEntryId: "Q-1",
            operatorId: "OP-1",
        }), res);
        expect(mockTxUpdate).toHaveBeenCalledTimes(2);
        expect(mockTxUpdate).toHaveBeenNthCalledWith(1,
            expect.anything(),
            expect.objectContaining({
                queueStatus: "Cancelled",
                cancelledBy: "OP-1",
            })
        );
        expect(mockTxUpdate).toHaveBeenNthCalledWith(2,
            expect.anything(),
            expect.objectContaining({
                bookingStatus: "Cancelled",
                queueStatus: "Cancelled",
            })
        );
    });
});
describe("getActiveStations",()=>{
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test("200 - aktif istasyonları döner",async()=>{
        mockGet.mockResolvedValueOnce({
            docs: [
                {
                    id: "ST-1",
                    data: () => ({
                        name: "Port A",
                        status: "active",
                        avgServiceTimeMin: 10,
                        completedJobsCount: 5,
                        totalServiceTimeMin: 50,
                    }),
                },
            ],
        });
        const res = makeRes();
        await getActiveStations(makeReq({}), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stations: expect.arrayContaining([
                    expect.objectContaining({
                        id: "ST-1",
                        name: "Port A",
                        confidence: "Medium", // 5 iş: 3-9 arası = Medium
                    }),
                ]),
            })
        );
    });
    test("200 - confidence Low (completedJobs < 3)", async () => {
        mockGet.mockResolvedValueOnce({
            docs: [
                {
                    id: "ST-2",
                    data: () => ({
                        name: "Port B",
                        status: "active",
                        avgServiceTimeMin: 10,
                        completedJobsCount: 1,
                        totalServiceTimeMin: 10,
                    }),
                },
            ],
        });

        const res = makeRes();
        await getActiveStations(makeReq({}), res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stations: expect.arrayContaining([
                    expect.objectContaining({ confidence: "Low" }),
                ]),
            })
        );
    });
    test("200 - confidence High (completedJobs >= 10)", async () => {
        mockGet.mockResolvedValueOnce({
            docs: [
                {
                    id: "ST-3",
                    data: () => ({
                        name: "Port C",
                        status: "active",
                        avgServiceTimeMin: 8,
                        completedJobsCount: 15,
                        totalServiceTimeMin: 120,
                    }),
                },
            ],
        });

        const res = makeRes();
        await getActiveStations(makeReq({}), res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stations: expect.arrayContaining([
                    expect.objectContaining({ confidence: "High" }),
                ]),
            })
        );
    });
    test("200 - boş liste (aktif istasyon yok)", async () => {
        mockGet.mockResolvedValueOnce({ docs: [] });

        const res = makeRes();
        await getActiveStations(makeReq({}), res);

        expect(res.json).toHaveBeenCalledWith({ stations: [] });
    });
})