const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage }).any();  // accepts any file field(s)
module.exports = upload;
