const router = require("express").Router();
const {
  getUniqueApprovalModels,
  createApproval,
  updateStatus,
  getAllRequests,
  getAllReviews,
  getApprovalFormById,
} = require("../Controllers/approvals.controller");
const auth = require("../middlewares/auth.middleware.js");

router.post("/approval", auth, createApproval);
router.get("/approvals/:id", auth, getApprovalFormById);
router.get("/uniquemodels", auth, getUniqueApprovalModels);
router.put("/:approvalId/updateStatus", auth, updateStatus);
router.get("/requests", auth, getAllRequests);
router.get("/reviews", auth, getAllReviews);

module.exports = router;
