const router = require("express").Router();
const {
  CreatePurchaseRequest,
  getPurchaseRequestById,
  UpdatePurchaseRequest,
  deletePurchaseRequest,
  updatePurchaseRequestStatus,
  getAllPurchaseRequest,
  getAllPurchaseRequestByProjectId,
  getPurchaseRequest,
  getMaterialScope,
} = require("../../Controllers/purchaseRequestController/purchaseRequestController");
const jwtMW = require("../../middlewares/auth");
router.post(
  "/purchase-request",
  jwtMW.authentication,
  jwtMW.authorization,
  CreatePurchaseRequest
);
router.get(
  "/purchase-request",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllPurchaseRequest
);
router.get(
  "/purchase-request/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  getPurchaseRequestById
);
router.get(
  "/purchase-request-project_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllPurchaseRequestByProjectId
);
router.put(
  "/purchase-request/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  UpdatePurchaseRequest
);
router.delete(
  "/purchase-request/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  deletePurchaseRequest
);
router.get(
  "/:project_id/item/:item_id/pr/:pr_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getPurchaseRequest
);
router.get(
  "/material-scope",
  jwtMW.authentication,
  jwtMW.authorization,
  getMaterialScope
);

module.exports = router;
