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
  getAllMaterialCategories,
  getMaterialCategoryById,
  updateMaterialCategory
} = require("../Controllers/materialcategory.controller");
const jwtMW = require("../middlewares/auth");

router.post("/category", jwtMW.authentication, addMaterialCategory);
router.get("/category", jwtMW.authentication, namesearchOfMaterialCategories);
router.get("/categories", jwtMW.authentication, getAllMaterialCategories);
router.get('/category-id', jwtMW.authentication, getMaterialCategoryById);
router.put('/category/:_id', jwtMW.authentication, updateMaterialCategory);

router.post("/product", jwtMW.authentication, createMaterial);
router.get("/product", jwtMW.authentication, getAllMaterials);
router.get("/product/:id", jwtMW.authentication, getMaterialById);
router.put("/product/:id", jwtMW.authentication, updateMaterial);

module.exports = router;
