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
  fetchExcelFromBOQ,
} = require("../controllers/purchaserequest.controller");
const jwtMW = require("../middlewares/auth");
router.post(
  "/purchase-request",
  jwtMW.authentication,
  CreatePurchaseRequest
);
router.get(
  "/purchase-request",
  jwtMW.authentication,
  getAllPurchaseRequest
);
router.get(
  "/purchase-request/:id",
  jwtMW.authentication,
  getPurchaseRequestById
);
router.get(
  "/purchase-request-project_id",
  jwtMW.authentication,
  getAllPurchaseRequestByProjectId
);
router.put(
  "/purchase-request/:id",
  jwtMW.authentication,
  UpdatePurchaseRequest
);
router.delete(
  "/purchase-request/:id",
  jwtMW.authentication,
  deletePurchaseRequest
);
router.get(
  "/:project_id/item/:item_id/pr/:pr_id",
  jwtMW.authentication,
  getPurchaseRequest
);
router.get(
  "/material-scope",
  jwtMW.authentication,
  getMaterialScope
);
router.get('/fetch-boq', jwtMW.authentication, fetchExcelFromBOQ);

module.exports = router;
