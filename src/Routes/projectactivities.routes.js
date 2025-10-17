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
  getProjectSchedulePdf,
} = require("../Controllers/projectactivities.controller");
const auth = require("../middlewares/auth.middleware.js");

router.post("/projectactivity", auth, createProjectActivity);
router.put("/projectactivity/:id", auth, editProjectActivity);
router.delete(
  "/projectactivity/:id",
  auth,
  deleteProjectActivity
);
router.put(
  "/:projectId/projectactivity/:activityId/projectstatus",
  auth,
  updateProjectActivityStatus
);

router.get(
  "/projectactivity",
  auth,
  getProjectActivitybyProjectId
);
router.put(
  "/pushactivity/:projectId",
  auth,
  pushActivityToProject
);
router.put(
  "/:projectId/activity/:activityId",
  auth,
  updateActivityInProject
);
router.get(
  "/:projectId/activity/:activityId",
  auth,
  getActivityInProject
);
router.get(
  "/namesearchtemplate",
  auth,
  getAllTemplateNameSearch
);
router.get(
  "/allprojectactivity",
  auth,
  getAllProjectActivities
);
router.put(
  "/:projectId/projectactivity/:templateId/fromtemplate",
  auth,
  updateProjectActivityFromTemplate
);
router.put(
  "/:projectId/projectactivity/:activityId/activity/:dependencyId/dependencystatus",
  auth,
  updateDependencyStatus
);
router.get(
  "/namesearchactivitybyprojectid",
  auth,
  nameSearchActivityByProjectId
);
router.get(
  "/:projectId/dependencies/:activityId",
  auth,
  getRejectedOrNotAllowedDependencies
);
router.patch(
  "/reorder/:projectId",
  auth,
  reorderProjectActivities
);
router.get(
  "/allprojectactivityforview",
  auth,
  getAllProjectActivityForView
);

router.get("/resources", auth, getResources);
router.put(
  "/:projectId/updateStatusOfPlan",
  auth,
  updateStatusOfPlan
);
router.put(
  "/updateprojectactivityforallprojects",
  auth,
  updateProjectActivityForAllProjects
);
router.put('/syncactivity', auth, syncActivitiesFromProjectActivity);
router.get('/get-project-csv', auth, getProjectGanttChartCsv);
router.get('/get-project-pdf', auth, getProjectSchedulePdf);
router.put(
  "/reorderfromactivity/:projectId",
  auth,
  updateReorderfromActivity
);

module.exports = router;
