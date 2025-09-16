const router = require("express").Router();
const { createProjectActivity, editProjectActivity, deleteProjectActivity, updateProjectActivityStatus, getProjectActivitybyProjectId } = require("../controllers/projectactivities.controller");
const jwtMW = require("../middlewares/auth");

router.post("/projectactivity", jwtMW.authentication, createProjectActivity);
router.put("/projectactivity/:id", jwtMW.authentication, editProjectActivity);
router.delete("/projectactivity/:id", jwtMW.authentication, deleteProjectActivity);
router.put("/:id/projectactivity/status/:activityId", jwtMW.authentication, updateProjectActivityStatus);
router.get('/projectactivity', jwtMW.authentication, getProjectActivitybyProjectId);

module.exports = router;