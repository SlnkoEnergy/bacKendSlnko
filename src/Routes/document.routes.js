const router = require("express").Router();
const {
  createDocument,
  getDocumentById,
  getAllDocuments,
  updateDocument,
  deleteDocument,
  getDocumentByName,
} = require("../Controllers/document.controller");
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/multer.middleware");

router.post("/", auth, upload, createDocument);
router.get("/", auth, getDocumentById);
router.get("/documents", auth, getAllDocuments);
router.put("/:id", auth, updateDocument);
router.delete("/:id", auth, deleteDocument);
router.get("/document-by-name", auth, getDocumentByName);

module.exports = router;
