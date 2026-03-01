const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");

setGlobalOptions({ maxInstances: 10 });

module.exports = {
    ...require("./src/queue"),
    ...require("./src/recommendation"),
    ...require("./src/stationStats"),
};