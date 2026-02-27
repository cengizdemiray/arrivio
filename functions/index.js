const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");

setGlobalOptions({ maxInstances: 10 });

exports.hello = onRequest((req, res) => {
  res.send("ok");
});