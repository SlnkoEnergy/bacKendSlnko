const router = require("express").Router();
const {
  CreatePurchaseRequest,
  getPurchaseRequestById,
  UpdatePurchaseRequest,
  deletePurchaseRequest,
  getAllPurchaseRequest,
  getAllPurchaseRequestByProjectId,
  getPurchaseRequest,
  getMaterialScope,
  fetchExcelFromBOQ,
} = require("../Controllers/purchaserequest.controller");
const auth = require("../middlewares/auth.middleware.js");
router.post(
  "/purchase-request",
  auth,
  CreatePurchaseRequest
);
router.get(
  "/purchase-request",
  auth,
  getAllPurchaseRequest
);
router.get(
  "/purchase-request/:id",
  auth,
  getPurchaseRequestById
);
router.get(
  "/purchase-request-project_id",
  auth,
  getAllPurchaseRequestByProjectId
);
router.put(
  "/purchase-request/:id",
  auth,
  UpdatePurchaseRequest
);
router.delete(
  "/purchase-request/:id",
  auth,
  deletePurchaseRequest
);
router.get(
  "/:project_id/item/:item_id/pr/:pr_id",
  auth,
  getPurchaseRequest
);
router.get(
  "/material-scope",
  auth,
  getMaterialScope
);
router.get('/fetch-boq', auth, fetchExcelFromBOQ);

module.exports = router;
