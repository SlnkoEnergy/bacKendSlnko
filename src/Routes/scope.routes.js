const {
  createScope,
  getScopeById,
  getAllScopes,
  updateScope,
  updateScopeStatus,
  deleteScope,
  getScopePdf,
  ensureProjectScope,
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
router.get("/scope-pdf", auth, getScopePdf);
router.put("/ensureProjectScope", ensureProjectScope);

module.exports = router;
