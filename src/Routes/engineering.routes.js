const router = require("express").Router();
const {
  updateBoqCategory,
  getBoqCategory,
  getBoqCategoryById,
  createBoqCategory,
  getBoqCategoryByIdAndKey,
} = require("../Controllers/boqcategory.controllers");
const {
  deleteBoqProject,
  updateBoqProject,
  getBoqProjectById,
  getAllBoqProject,
  createBoqProject,
  getBoqProjectByProject,
} = require("../Controllers/boqproject.controllers");
const {
  updateBoqTemplate,
  getBoqTemplate,
  createBoqTemplate,
  getBoqTemplateByTemplateId,
} = require("../Controllers/boqtemplate.controllers");
const {
  updateAttachmentUrl,
  updateModuleCategoryStatus,
  updateModuleCategory,
  getModuleCategoryById,
  getModuleCategory,
  createModuleCategory,
  addRemarkToModuleCategory,
  updateModuleCategoryDB,
  getStatusHistoryForModuleCategory,
} = require("../Controllers/modulecategory.contoller");
const {
  updateModuleTemplateCategoryId,
  deleteModule,
  updateModule,
  getAllModule,
  getModuleById,
  createModule,
  getAllowedModule,
  getAllModulePaginated,
} = require("../Controllers/moduletemplate.controller");
const {
  addMaterialCategory,
  getAllMaterialCategories,
  updateMaterialCategory,
  deleteMaterialCategory,
  getMaterialCategoryById,
  getAllMaterialCategoriesDropdown,
  searchNameAllCategory,
  searchNameAllProduct,
} = require("../Controllers/materialcategory.controller");
const {
  createMaterial,
  getAllMaterials,
  updateMaterial,
  deleteMaterial,
} = require("../Controllers/material.controller");
const auth = require("../middlewares/auth.middleware.js");
const upload = require("../middlewares/multer.middleware.js");

//Engineering Modules Templates
router.post("/create-module", auth, createModule);
router.get("/get-module-by-id/:_id", auth, getModuleById);
router.get("/get-module", auth, getAllModule);
router.get("/get-module-paginated", auth, getAllModulePaginated);

router.put("/update-module/:_id", auth, updateModule);
router.delete("/delete-module/:_id", auth, deleteModule);
router.put(
  "/update-template-category/:_id",
  auth,
  updateModuleTemplateCategoryId
);

// Engineering Modules Categories
router.post("/create-module-category", auth, upload, createModuleCategory);
router.get("/get-module-category", auth, getModuleCategory);
router.get("/get-module-category-id", auth, getModuleCategoryById);
router.put("/update-module-category", auth, upload, updateModuleCategory);
router.put(
  "/:projectId/moduletemplate/:module_template/statusModule",
  auth,
  updateModuleCategoryStatus
);
router.put(
  "/:categoryId/item/:itemId/statusAttachment",
  auth,
  updateAttachmentUrl
);
router.put(
  "/:projectId/moduletemplate/:module_template/remarkStatus",
  auth,
  addRemarkToModuleCategory
);
router.put("/moduleCatgoryDB", auth, updateModuleCategoryDB);
router.get(
  "/:projectId/moduletemplate/:module_template/statusHistory",
  auth,
  getStatusHistoryForModuleCategory
);
router.get("/:projectId/allowedtemplates", auth, getAllowedModule);

// Boq Categories
router.post("/create-boq-category", auth, createBoqCategory);
router.get("/get-boq-category-by-id/:_id", auth, getBoqCategoryById);
router.get("/get-boq-category", auth, getBoqCategory);
router.put("/update-boq-category/:_id", auth, updateBoqCategory);

// Boq Templates
router.post("/create-boq-template", auth, createBoqTemplate);
router.get("/get-boq-template-by-id", auth, getBoqTemplateByTemplateId);
router.get("/get-boq-template", auth, getBoqTemplate);
router.put("/update-boq-template/:_id", auth, updateBoqTemplate);

// Boq Projects
router.post("/create-boq-project", auth, createBoqProject);
router.get("/get-all-boq-projects", auth, getAllBoqProject);
router.get("/get-boq-project-by-id", auth, getBoqProjectById);
router.get("/get-boq-project-by-project", auth, getBoqProjectByProject);
router.put(
  "/:projectId/moduletemplate/:moduleTemplateId/updateBoqProject",
  auth,
  updateBoqProject
);
router.delete("/:boqId/item/:itemId/deleteBoq", auth, deleteBoqProject);

// material category
router.post("/create-material-category", auth, addMaterialCategory);
router.get("/all-material-category", auth, getAllMaterialCategories);
router.get("/material-category-drop", auth, getAllMaterialCategoriesDropdown);
router.get("/material-category-id", auth, getMaterialCategoryById);
router.put("/material-category/:_id", auth, updateMaterialCategory);
router.delete("/delete-material-category/:_id", auth, deleteMaterialCategory);

// Materials
router.post("/create-material", auth, createMaterial);
router.get("/all-materials", auth, getAllMaterials);
router.put("/update-material/:_id", auth, updateMaterial);
router.delete("/delete-material/:_id", auth, deleteMaterial);
router.get("/get-boq-catergories", auth, getBoqCategoryByIdAndKey);
router.get("/all-materials-po", auth, searchNameAllCategory);
router.get("/all-product-po", auth, searchNameAllProduct);
module.exports = router;
