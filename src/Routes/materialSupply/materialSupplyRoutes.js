const router = require("express").Router();
const {
  CreateMaterialSupply,
  getAllMaterial,
  getMaterialSupplyById,
  UpdateMaterialSupply,
  deleteMaterialSupply,
  updateMaterialSupplyStatus,
} = require("../../Controllers/materialSupplyController/materialSupplyController");
const jwtMW = require("../../middlewares/auth");
router.post(
  "/material-supply",
  jwtMW.authentication,
  jwtMW.authorization,
  CreateMaterialSupply
);
router.get(
  "/material-supply",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllMaterial
);
router.get(
  "/material-supply-id/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  getMaterialSupplyById
);

router.put(
  "/material-supply-id/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  UpdateMaterialSupply
);

router.delete(
  "/material-supply-id/:id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteMaterialSupply
);

router.put("/:id/updateMaterialStatus",
  jwtMW.authentication,
  jwtMW.authorization,
  updateMaterialSupplyStatus
);



module.exports = router;
