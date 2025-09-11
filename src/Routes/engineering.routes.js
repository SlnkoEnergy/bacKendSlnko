const router = require("express").Router();
const {
  updateBoqCategory,
  getBoqCategory,
  getBoqCategoryById,
  createBoqCategory,
  getBoqCategoryByIdAndKey,
} = require("../controllers/boqcategory.controllers");
const {
  deleteBoqProject,
  updateBoqProject,
  getBoqProjectById,
  getAllBoqProject,
  createBoqProject,
  getBoqProjectByProject,
} = require("../controllers/boqproject.controllers");
const {
  updateBoqTemplate,
  getBoqTemplate,
  createBoqTemplate,
  getBoqTemplateByTemplateId,
} = require("../controllers/boqtemplate.controllers");
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
} = require("../controllers/modulecategory.contoller");
const {
  updateModuleTemplateCategoryId,
  deleteModule,
  updateModule,
  getAllModule,
  getModuleById,
  createModule,
} = require("../controllers/moduletemplate.controller");
const {
  addMaterialCategory,
  getAllMaterialCategories,
  updateMaterialCategory,
  deleteMaterialCategory,
  getMaterialCategoryById,
  getAllMaterialCategoriesDropdown,
} = require("../controllers/materialcategory.controller");
const {
  createMaterial,
  getAllMaterials,
  updateMaterial,
  deleteMaterial,
} = require("../controllers/material.controller");
const jwtMW = require("../middlewares/auth");
const upload = require("../middlewares/multer");

//Engineering Modules Templates
router.post("/create-module", jwtMW.authentication, createModule);
router.get("/get-module-by-id/:_id", jwtMW.authentication, getModuleById);
router.get("/get-module", jwtMW.authentication, getAllModule);
router.put("/update-module/:_id", jwtMW.authentication, updateModule);
router.delete("/delete-module/:_id", jwtMW.authentication, deleteModule);
router.put(
  "/update-template-category/:_id",
  jwtMW.authentication,
  updateModuleTemplateCategoryId
);

// Engineering Modules Categories
router.post(
  "/create-module-category",
  jwtMW.authentication,
  upload,
  createModuleCategory
);
router.get("/get-module-category", jwtMW.authentication, getModuleCategory);
router.get(
  "/get-module-category-id",
  jwtMW.authentication,
  getModuleCategoryById
);
router.put(
  "/update-module-category",
  jwtMW.authentication,
  upload,
  updateModuleCategory
);
router.put(
  "/:projectId/moduletemplate/:module_template/statusModule",
  jwtMW.authentication,
  updateModuleCategoryStatus
);
router.put(
  "/:categoryId/item/:itemId/statusAttachment",
  jwtMW.authentication,
  updateAttachmentUrl
);
router.put(
  "/:projectId/moduletemplate/:module_template/remarkStatus",
  jwtMW.authentication,
  addRemarkToModuleCategory
);
router.put("/moduleCatgoryDB", jwtMW.authentication, updateModuleCategoryDB);
router.get(
  "/:projectId/moduletemplate/:module_template/statusHistory",
  jwtMW.authentication,
  getStatusHistoryForModuleCategory
);

// Boq Categories
router.post("/create-boq-category", jwtMW.authentication, createBoqCategory);
router.get(
  "/get-boq-category-by-id/:_id",
  jwtMW.authentication,
  getBoqCategoryById
);
router.get("/get-boq-category", jwtMW.authentication, getBoqCategory);
router.put(
  "/update-boq-category/:_id",
  jwtMW.authentication,
  updateBoqCategory
);

// Boq Templates
router.post("/create-boq-template", jwtMW.authentication, createBoqTemplate);
router.get(
  "/get-boq-template-by-id",
  jwtMW.authentication,
  getBoqTemplateByTemplateId
);
router.get("/get-boq-template", jwtMW.authentication, getBoqTemplate);
router.put(
  "/update-boq-template/:_id",
  jwtMW.authentication,
  updateBoqTemplate
);

// Boq Projects
router.post("/create-boq-project", jwtMW.authentication, createBoqProject);
router.get("/get-all-boq-projects", jwtMW.authentication, getAllBoqProject);
router.get("/get-boq-project-by-id", jwtMW.authentication, getBoqProjectById);
router.get(
  "/get-boq-project-by-project",
  jwtMW.authentication,
  getBoqProjectByProject
);
router.put(
  "/:projectId/moduletemplate/:moduleTemplateId/updateBoqProject",
  jwtMW.authentication,
  updateBoqProject
);
router.delete(
  "/:boqId/item/:itemId/deleteBoq",
  jwtMW.authentication,
  deleteBoqProject
);

// material category
router.post(
  "/create-material-category",
  jwtMW.authentication,
  addMaterialCategory
);
router.get(
  "/all-material-category",
  jwtMW.authentication,
  getAllMaterialCategories
);
router.get(
  "/material-category-drop",
  jwtMW.authentication,
  getAllMaterialCategoriesDropdown
);
router.get(
  "/material-category-id",
  jwtMW.authentication,
  getMaterialCategoryById
);
router.put(
  "/material-category/:_id",
  jwtMW.authentication,
  updateMaterialCategory
);
router.delete(
  "/delete-material-category/:_id",
  jwtMW.authentication,
  deleteMaterialCategory
);

// Materials
router.post("/create-material", jwtMW.authentication, createMaterial);
router.get("/all-materials", jwtMW.authentication, getAllMaterials);
router.put("/update-material/:_id", jwtMW.authentication, updateMaterial);
router.delete("/delete-material/:_id", jwtMW.authentication, deleteMaterial);
router.get(
  "/get-boq-catergories",
  jwtMW.authentication,
  getBoqCategoryByIdAndKey
);

module.exports = router;
