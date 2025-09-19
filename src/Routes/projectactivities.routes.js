const router = require("express").Router();
const {
  createProjectActivity,
  editProjectActivity,
  deleteProjectActivity,
  updateProjectActivityStatus,
  getProjectActivitybyProjectId,
  pushActivityToProject,
  updateActivityInProject,
  getActivityInProject,
  getAllTemplateNameSearch,
  getAllProjectActivities,
  updateProjectActivityFromTemplate,
} = require("../controllers/projectactivities.controller");
const jwtMW = require("../middlewares/auth");

router.post("/projectactivity", jwtMW.authentication, createProjectActivity);
router.put("/projectactivity/:id", jwtMW.authentication, editProjectActivity);
router.delete(
  "/projectactivity/:id",
  jwtMW.authentication,
  deleteProjectActivity
);
router.put(
  "/:id/projectactivity/status/:activityId",
  jwtMW.authentication,
  updateProjectActivityStatus
);
router.get(
  "/projectactivity",
  jwtMW.authentication,
  getProjectActivitybyProjectId
);
router.put(
  "/pushactivity/:projectId",
  jwtMW.authentication,
  pushActivityToProject
);
router.put(
  "/:projectId/activity/:activityId",
  jwtMW.authentication,
  updateActivityInProject
);
router.get(
  "/:projectId/activity/:activityId",
  jwtMW.authentication,
  getActivityInProject
);
router.get(
  "/namesearchtemplate",
  jwtMW.authentication,
  getAllTemplateNameSearch
);
router.get(
  "/allprojectactivity",
  jwtMW.authentication,
  getAllProjectActivities
);
router.put(
  "/:projectId/projectactivity/:templateId/fromtemplate",
  jwtMW.authentication,
  updateProjectActivityFromTemplate
);

module.exports = router;
