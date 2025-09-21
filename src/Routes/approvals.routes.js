const router = require("express").Router();
const { getUniqueApprovalModels, createApproval } = require("../Controllers/approvals.controller");
const jwtMW = require("../middlewares/auth");

router.post('/approval', jwtMW.authentication, createApproval);
router.get('/uniquemodels', jwtMW.authentication, getUniqueApprovalModels);

module.exports = router;