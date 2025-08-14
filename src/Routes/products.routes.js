const router = require("express").Router();
const {
  createMaterial,
  getAllMaterials,
  getMaterialById,
  updateMaterial,
} = require("../Controllers/material.controller");
const {
  addMaterialCategory,
  namesearchOfMaterialCategories,
} = require("../Controllers/materialcategory.controller");
const jwtMW = require("../middlewares/auth");

router.post("/category", jwtMW.authentication, addMaterialCategory);
router.get("/category", jwtMW.authentication, namesearchOfMaterialCategories);

router.post("/product", jwtMW.authentication, createMaterial);
router.get("/product", jwtMW.authentication, getAllMaterials);
router.get("/product/:id", jwtMW.authentication, getMaterialById);
router.put("/product/:id", jwtMW.authentication, updateMaterial);

module.exports = router;
