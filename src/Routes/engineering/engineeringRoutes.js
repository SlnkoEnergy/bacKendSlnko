var router = require('express').Router();
const { updateBoqCategory, getBoqCategory, getBoqCategoryById, createBoqCategory } = require('../../Controllers/engineeringController/boq/boqCategoryControllers');
const { deleteBoqProject, updateBoqProject, getBoqProjectById, getAllBoqProject, createBoqProject } = require('../../Controllers/engineeringController/boq/boqProjectControllers');
const { updateBoqTemplate, getBoqTemplate, createBoqTemplate, getBoqTemplateByTemplateId } = require('../../Controllers/engineeringController/boq/boqTemplateControllers');
const { updateAttachmentUrl, updateModuleCategoryStatus, updateModuleCategory, getModuleCategoryById, getModuleCategory, createModuleCategory } = require('../../Controllers/engineeringController/engineeringModules/moduleCategoryContoller');
const { updateModuleTemplateCategoryId, deleteModule, updateModule, getAllModule, getModuleById, createModule } = require('../../Controllers/engineeringController/engineeringModules/moduleTemplateController');
const { addMaterialCategory, getAllMaterialCategories, updateMaterialCategory, deleteMaterialCategory } = require('../../Controllers/engineeringController/materials/materialCategoryController');
const { createMaterial, getAllMaterials, updateMaterial, deleteMaterial } = require('../../Controllers/engineeringController/materials/materialController');
const jwtMW = require("../../middlewares/auth");
const upload = require('../../middlewares/multer');

//Engineering Modules Templates
router.post(
  "/create-module",
  jwtMW.authentication,
  jwtMW.authorization,
  createModule
);
router.get(
  "/get-module-by-id/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getModuleById
);
router.get(
  "/get-module",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllModule
);
router.put(
  "/update-module/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateModule
);
router.delete(
  "/delete-module/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteModule
);
router.put(
  "/update-template-category/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateModuleTemplateCategoryId
);

// Engineering Modules Categories
router.post(
  "/create-module-category",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  createModuleCategory
);
router.get(
  "/get-module-category",
  jwtMW.authentication,
  jwtMW.authorization,
  getModuleCategory
);
router.get(
  "/get-module-category-id",
  jwtMW.authentication,
  jwtMW.authorization,
  getModuleCategoryById
);
router.put(
  "/update-module-category",
  jwtMW.authentication,
  jwtMW.authorization,
  upload,
  updateModuleCategory
);
router.put(
  "/:moduleId/item/:itemId/statusModule",
  jwtMW.authentication,
  jwtMW.authorization,
  updateModuleCategoryStatus
);
router.put(
  "/:categoryId/item/:itemId/statusAttachment",
  jwtMW.authentication,
  jwtMW.authorization,
  updateAttachmentUrl
);

// Boq Categories
router.post(
  "/create-boq-category",
  jwtMW.authentication,
  jwtMW.authorization,
  createBoqCategory
);
router.get(
  "/get-boq-category-by-id/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  getBoqCategoryById
);
router.get(
  "/get-boq-category",
  jwtMW.authentication,
  jwtMW.authorization,
  getBoqCategory
);
router.put(
  "/update-boq-category/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateBoqCategory
);

// Boq Templates
router.post(
  "/create-boq-template",
  jwtMW.authentication,
  jwtMW.authorization,
  createBoqTemplate
);
router.get(
  "/get-boq-template-by-id",
  jwtMW.authentication,
  jwtMW.authorization,
  getBoqTemplateByTemplateId
);
router.get(
  "/get-boq-template",
  jwtMW.authentication,
  jwtMW.authorization,
  getBoqTemplate
);
router.put(
  "/update-boq-template/:_id",
  jwtMW.authentication,
  jwtMW.authorization,
  updateBoqTemplate
);

// Boq Projects
router.post(
  "/create-boq-project",
  jwtMW.authentication,
  jwtMW.authorization,
  createBoqProject
);

router.get(
  "/get-all-boq-projects",
  jwtMW.authentication,
  jwtMW.authorization,
  getAllBoqProject
);

router.get(
  "/get-boq-project-by-id",
  jwtMW.authentication,
  jwtMW.authorization,
  getBoqProjectById
);
router.put(
  "/:projectId/moduletemplate/:moduleTemplateId/updateBoqProject",
  jwtMW.authentication,
  jwtMW.authorization,
  updateBoqProject
);
router.delete(
  "/:boqId/item/:itemId/deleteBoq",
  jwtMW.authentication,
  jwtMW.authorization,
  deleteBoqProject
);

// material category
router.post(
  '/create-material-category',
  jwtMW.authentication,
  jwtMW.authorization,
  addMaterialCategory
)
router.get(
  '/all-material-category',
  jwtMW.authentication,
  jwtMW.authorization,
  getAllMaterialCategories
)
router.put(
  '/material-category/:_id',
  jwtMW.authentication,
  jwtMW.authorization,
  updateMaterialCategory
)
router.delete(
  '/delete-material-category/:_id',
  jwtMW.authentication,
  jwtMW.authorization,
  deleteMaterialCategory
)

// Materials
router.post(
  '/create-material',
  jwtMW.authentication,
  jwtMW.authorization,
  createMaterial
)
router.get(
  '/all-materials',
  jwtMW.authentication,
  jwtMW.authorization,
  getAllMaterials
)
router.put(
  '/update-material/:_id',
  jwtMW.authentication,
  jwtMW.authorization,
  updateMaterial
)
router.delete(
  '/delete-material/:_id',
  jwtMW.authentication,
  jwtMW.authorization,
  deleteMaterial
)


module.exports = router;
