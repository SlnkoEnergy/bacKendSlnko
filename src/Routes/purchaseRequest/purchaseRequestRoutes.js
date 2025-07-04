const router = require("express").Router();
const {
  CreatePurchaseRequest,
  getPurchaseRequestById,
  UpdatePurchaseRequest,
  deletePurchaseRequest,
  updatePurchaseRequestStatus,
} = require("../../Controllers/purchaseRequestController/purchaseRequestController");
const jwtMW = require("../../middlewares/auth");
router.post(
  "/purchase-request",
  jwtMW.authentication,
  jwtMW.authorization,
  CreatePurchaseRequest
);

router.get(
  "/purchase-request/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  getPurchaseRequestById
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

router.put("/:id/item/item_id/updatePurchaseRequestStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updatePurchaseRequestStatus
);



module.exports = router;
