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
  updateDependencyStatus,
  nameSearchActivityByProjectId,
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
  "/:projectId/projectactivity/:activityId/projectstatus",
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
router.put(
  "/:projectId/projectactivity/:activityId/activity/:dependencyId/dependencystatus",
  jwtMW.authentication,
  updateDependencyStatus
);
router.get('namesearchactivitybyprojectid', jwtMW.authentication, nameSearchActivityByProjectId);

module.exports = router;
