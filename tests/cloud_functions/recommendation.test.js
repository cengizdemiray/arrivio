const { initializeApp } = require("firebase-admin");

const mockGet = jest.fn();
const mockCount = jest.fn(() => ({ get: mockGet }));
const mockWhere = jest.fn(() => ({
    where: mockWhere,
    count: mockCount,
    get: mockGet,
}));
const mockCollection = jest.fn(() => ({
    where: mockWhere,
    get: mockGet,
}));
jest.mock("firebase-admin",()=>{
    const firestore = () => ({
        collection: mockCollection,
    });
    firestore.Timestamp = {
        fromDate: (d) => ({ _date: d, toDate: () => d }),
        fromMillis: (ms) => ({
            _ms: ms,
            toDate: () => new Date(ms),
        }),
        now: () => ({
            toDate: () => new Date(),
        }),
    };
    firestore.FieldValue = {
        serverTimeStamp: () => "SERVER_TIMESTAMP",
    };
    return {
        apps: [{}],
        initializeApp: jest.fn(),
        firestore, 
    };
},{virtual: true});

jest.mock("firebase-functions/v2/https", () => ({
    onRequest: (_opts, handler) => handler,
}), { virtual: true });

jest.mock("cors", () => jest.fn(() => jest.fn()), { virtual: true });

const { getStationsMM1ForSlotStart} = require("../../functions/src/recommendation");
function makeReq(body){ return {body}; }
function makeRes(){
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}
describe("UT-CF-11: getStationsMM1ForSlotStart",()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });
    test("400 - missing startSlotIso", async()=>{
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringContaining("required") })
        );
    });
    test("500 - invalid date format", async () => {
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({
            startSlotIso: "invalid",
            endSlotIso: "2026-04-26T10:15:00Z",
        }), res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
    test("200 - one station, stable queue", async()=>{
        mockGet.mockResolvedValueOnce({
            docs: [{
                id: "ST-1",
                data: () => ({
                    status: "active",
                    avgServiceTimeMin: 10,
                }),
            }],
        });
        mockGet.mockResolvedValueOnce({
            data: () => ({ count: 5 }),
        });
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({
            startSlotIso: "2026-04-26T10:00:00Z",
            endSlotIso: "2026-04-26T10:15:00Z",
        }), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                bestStationId: "ST-1",
                stations: expect.arrayContaining([
                    expect.objectContaining({
                        stationId: "ST-1",
                        mu: expect.any(Number),
                        lambda: expect.any(Number),
                    }),
                ]),
            })
        );
    });
    test("200 - best station selection",async()=>{
        mockGet.mockResolvedValueOnce({
            docs: [
                {
                    id: "ST-1",
                    data: () => ({
                        status: "active",
                        avgServiceTimeMin: 10, // yavaş
                    }),
                },
                {
                    id: "ST-2",
                    data: () => ({
                        status: "active",
                        avgServiceTimeMin: 5, // hızlı
                    }),
                },
            ],
        });
        // ST-1 = 5 arrival
        mockGet.mockResolvedValueOnce({
            data: () => ({ count: 5 }),
        });
        // ST-2 = 5 arrival
        mockGet.mockResolvedValueOnce({
            data: () => ({ count: 5 }),
        });
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({
            startSlotIso: "2026-04-26T10:00:00Z",
            endSlotIso: "2026-04-26T10:15:00Z",
        }), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                bestStationId: "ST-2", // hızlı olan önce
            })
        );
    });
    test("200 - no past data, lambda = 0", async () => {
        mockGet.mockResolvedValueOnce({
            docs: [{
                id: "ST-1",
                data: () => ({
                    status: "active",
                    avgServiceTimeMin: 10,
                }),
            }],
        });
        mockGet.mockResolvedValueOnce({
            data: () => ({ count: 0 }),
        });
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({
            startSlotIso: "2026-04-26T10:00:00Z",
            endSlotIso: "2026-04-26T10:15:00Z",
        }), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stations: expect.arrayContaining([
                    expect.objectContaining({
                        lambda: 0,
                        approximatedWaitingTime: 0,
                    }),
                ]),
            })
        );
    });
    test("200 - unstable queue",async()=>{
        mockGet.mockResolvedValueOnce({
            docs: [{
                id: "ST-1",
                data: () => ({
                    status: "active",
                    avgServiceTimeMin: 10, // μ = 0.1/dk
                }),
            }],
        });
        mockGet.mockResolvedValueOnce({
            data: () => ({ count: 500 }),
        });
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({
            startSlotIso: "2026-04-26T10:00:00Z",
            endSlotIso: "2026-04-26T10:15:00Z",
        }), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stations: expect.arrayContaining([
                    expect.objectContaining({
                        approximatedWaitingTime: Infinity,
                    }),
                ]),
            })
        );
    });
    test("200 - no active stations",async()=>{
        mockGet.mockResolvedValueOnce({ docs: [] });
        const res = makeRes();
        await getStationsMM1ForSlotStart(makeReq({
            startSlotIso: "2026-04-26T10:00:00Z",
            endSlotIso: "2026-04-26T10:15:00Z",
        }), res);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stations: [],
                bestStationId: null,
            })
        );
    });
})
