const router = require("express").Router();
const {
  createActivity,
  editActivity,
  deleteActivity,
  namesearchOfActivities,
  updateDependency,
  deleteDependency
} = require("../Controllers/activities.controller");
const auth = require("../middlewares/auth.middleware.js");

router.post("/activity", auth, createActivity);
router.put("/activity/:id", auth, editActivity);
router.delete("/activity/:id", auth, deleteActivity);
router.get("/activities", auth, namesearchOfActivities);
router.put('/:id/updatedependency', auth, updateDependency);
router.delete('/:id/deletedependency/:dependencyId', auth, deleteDependency);

module.exports = router;
