const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage }).any();
module.exports = upload;
