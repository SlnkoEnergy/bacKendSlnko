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
const jwtMW = require("../middlewares/auth");

router.post("/scope", jwtMW.authentication, createScope);
router.get("/scope", jwtMW.authentication, getScopeById);
router.get("/scopes", jwtMW.authentication, getAllScopes);
router.put("/scope", jwtMW.authentication, updateScope);
router.put(
  "/:project_id/updateStatus",
  jwtMW.authentication,
  updateScopeStatus
);
router.delete("/scope", jwtMW.authentication, deleteScope);
router.get("/scope-pdf", jwtMW.authentication, getScopePdf);
router.put("/ensureProjectScope", ensureProjectScope);

module.exports = router;
