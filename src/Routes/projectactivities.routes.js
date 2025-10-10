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
  getRejectedOrNotAllowedDependencies,
  reorderProjectActivities,
  getAllProjectActivityForView,
  getResources,
  updateStatusOfPlan,
  updateProjectActivityForAllProjects,
  syncActivitiesFromProjectActivity,
  getProjectGanttChartCsv,
  updateReorderfromActivity,
} = require("../Controllers/projectactivities.controller");
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
router.get(
  "/namesearchactivitybyprojectid",
  jwtMW.authentication,
  nameSearchActivityByProjectId
);
router.get(
  "/:projectId/dependencies/:activityId",
  jwtMW.authentication,
  getRejectedOrNotAllowedDependencies
);
router.patch(
  "/reorder/:projectId",
  jwtMW.authentication,
  reorderProjectActivities
);
router.get(
  "/allprojectactivityforview",
  jwtMW.authentication,
  getAllProjectActivityForView
);

router.get("/resources", jwtMW.authentication, getResources);
router.put(
  "/:projectId/updateStatusOfPlan",
  jwtMW.authentication,
  updateStatusOfPlan
);
router.put(
  "/updateprojectactivityforallprojects",
  jwtMW.authentication,
  updateProjectActivityForAllProjects
);
router.put('/syncactivity', jwtMW.authentication, syncActivitiesFromProjectActivity);
router.get('/get-project-csv', jwtMW.authentication, getProjectGanttChartCsv);
router.put(
  "/reorderfromactivity/:projectId",
  jwtMW.authentication,
  updateReorderfromActivity
);

module.exports = router;
