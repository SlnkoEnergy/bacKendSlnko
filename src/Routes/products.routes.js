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
const auth = require("../middlewares/auth.middleware.js");

router.post("/category", auth, addMaterialCategory);
router.get("/category", auth, namesearchOfMaterialCategories);
router.get("/categories", auth, getAllMaterialCategories);
router.get('/category-id', auth, getMaterialCategoryById);
router.put('/category/:_id', auth, updateMaterialCategory);

router.post("/product", auth, createMaterial);
router.get("/product", auth, getAllMaterials);
router.get("/product/:id", auth, getMaterialById);
router.put("/product/:id", auth, updateMaterial);

module.exports = router;
