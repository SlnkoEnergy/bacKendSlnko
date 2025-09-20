const router = require("express").Router();
const {
  createActivity,
  editActivity,
  deleteActivity,
  namesearchOfActivities,
  updateDependency,
  deleteDependency,
} = require("../controllers/activities.controller");
const jwtMW = require("../middlewares/auth");

router.post("/activity", jwtMW.authentication, createActivity);
router.put("/activity/:id", jwtMW.authentication, editActivity);
router.delete("/activity/:id", jwtMW.authentication, deleteActivity);
router.get("/activities", jwtMW.authentication, namesearchOfActivities);
router.put('/:id/updatedependency', jwtMW.authentication, updateDependency);
router.delete('/:id/deletedependency/:dependencyId', jwtMW.authentication, deleteDependency);

module.exports = router;
