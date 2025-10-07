const router = require("express").Router();
const {
  getUniqueApprovalModels,
  createApproval,
  updateStatus,
  getAllRequests,
  getAllReviews,
  getApprovalFormById,
} = require("../Controllers/approvals.controller");
const jwtMW = require("../middlewares/auth");

router.post("/approval", jwtMW.authentication, createApproval);
router.get("/approvals/:id", jwtMW.authentication, getApprovalFormById);
router.get("/uniquemodels", jwtMW.authentication, getUniqueApprovalModels);
router.put("/:approvalId/updateStatus", jwtMW.authentication, updateStatus);
router.get("/requests", jwtMW.authentication, getAllRequests);
router.get("/reviews", jwtMW.authentication, getAllReviews);

module.exports = router;
