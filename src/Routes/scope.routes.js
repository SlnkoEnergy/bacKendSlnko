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

router.post("/scope", jwtMW.authentication, jwtMW.authorization, createScope);
router.get(
  "/scope",
  jwtMW.authentication,
  jwtMW.authorization,
  getScopeById
);
router.get("/scopes", jwtMW.authentication, jwtMW.authorization, getAllScopes);
router.put("/scope", jwtMW.authentication, jwtMW.authorization, updateScope);
router.put(
  "/:project_id/updateStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateScopeStatus
);
router.delete("/scope", jwtMW.authentication, jwtMW.authorization, deleteScope);
router.get('/scope-pdf', jwtMW.authentication, jwtMW.authorization, getScopePdf);
router.put('/ensureProjectScope', ensureProjectScope)

module.exports = router;
