var router = require("express").Router();

const { addMoney } = require("../Controllers/addMoneyController");
const {
  createProject,
  updateProject,
  getallproject,
} = require("../Controllers/ProjectController");
const {
  userRegister,
  login,
  getalluser,
} = require("../Controllers/userController");
const { addPo, editPO } = require("../Controllers/purchaseOrderController");
const { addVendor } = require("../Controllers/addVenderController");

// Admin router
router.post("/user-registration", userRegister);
router.post("/login", login);
router.get("/get-all-user", getalluser);

//project router
router.post("/add-new-project", createProject);
router.put("/update-project/:_id", updateProject);
router.get("/get-all-project", getallproject);

//addMoney APi
router.post("/Add-Money", addMoney);

//purchase order controller
router.post("/Add-purchase-order", addPo);
router.put("/edit-po/:_id", editPO);

//Add vendor
router.post("/Add-vendor", addVendor);

module.exports = router;
