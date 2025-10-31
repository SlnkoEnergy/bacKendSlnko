const {
  createScope,
  getScopeById,
  getAllScopes,
  updateScope,
  updateScopeStatus,
  deleteScope,
  getScopePdf,
  ensureProjectScope,
  updateCommitmentDate,
  exportScopes,
} = require("../Controllers/scope.controller");
const router = require("express").Router();
const auth = require("../middlewares/auth.middleware.js");

router.post("/scope", auth, createScope);
router.get("/scope", auth, getScopeById);
router.get("/scopes", auth, getAllScopes);
router.put("/scope", auth, updateScope);
router.put(
  "/:project_id/updateStatus",
  auth,
  updateScopeStatus
);
router.delete("/scope", auth, deleteScope);
router.post("/scope-pdf", auth, getScopePdf);
router.put("/ensureProjectScope", ensureProjectScope);
router.put(
  "/:id/scope/:item_id/commitment",
  auth,
  updateCommitmentDate
);
router.post('/export-scopes', auth, exportScopes);

module.exports = router;
