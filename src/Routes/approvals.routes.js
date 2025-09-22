const router = require("express").Router();
const { getUniqueApprovalModels, createApproval, updateStatus } = require("../Controllers/approvals.controller");
const jwtMW = require("../middlewares/auth");

router.post('/approval', jwtMW.authentication, createApproval);
router.get('/uniquemodels', jwtMW.authentication, getUniqueApprovalModels);
router.put('/:approvalId/updateStatus', jwtMW.authentication, updateStatus);

module.exports = router;