const router = require("express").Router();
const { createProjectActivity, editProjectActivity, deleteProjectActivity, updateProjectActivityStatus, getProjectActivitybyProjectId, pushActivityToProject, updateActivityInProject } = require("../controllers/projectactivities.controller");
const jwtMW = require("../middlewares/auth");

router.post("/projectactivity", jwtMW.authentication, createProjectActivity);
router.put("/projectactivity/:id", jwtMW.authentication, editProjectActivity);
router.delete("/projectactivity/:id", jwtMW.authentication, deleteProjectActivity);
router.put("/:id/projectactivity/status/:activityId", jwtMW.authentication, updateProjectActivityStatus);
router.get('/projectactivity', jwtMW.authentication, getProjectActivitybyProjectId);
router.put('/pushactivity/:projectId', jwtMW.authentication, pushActivityToProject);
router.put('/:projectId/updateActivity/:activityId', jwtMW.authentication, updateActivityInProject);

module.exports = router;