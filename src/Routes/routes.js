var router = require("express").Router();

const { addMoney } = require("../Controllers/addMoneyController");
const {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
} = require("../Controllers/ProjectController");
const {
  userRegister,
  login,
  getalluser,
} = require("../Controllers/userController");
const { addPo, editPO, getPO, getallpo } = require("../Controllers/purchaseOrderController");
const { addVendor, getVendor } = require("../Controllers/addVenderController");
const { additem, getItem }= require("../Controllers/itemController");
const{ payRrequest, holdpay }=require("../Controllers/payRequestControllers");

const { addBill, getBill }=require("../Controllers/billController");











// Admin router
router.post("/user-registration", userRegister);
router.post("/login", login);
router.get("/get-all-user", getalluser);





//project router
router.post("/add-new-project", createProject);
router.put("/update-project/:_id", updateProject);
router.get("/get-all-project", getallproject);
router.delete("/delete-by-id/:_id",deleteProjectById);





//addMoney APi
router.post("/Add-Money", addMoney);






//purchase order controller
router.post("/Add-purchase-order", addPo);
router.put("/edit-po/:_id", editPO);
router.get("/get-po/:_id",getPO);
router.get("/get-all-po",getallpo);




//Add vendor
router.post("/Add-vendor", addVendor);
router.get("/get-all-vendor",getVendor);




//item
router.post("/add-item", additem);
router.get("/get-item",getItem);


//pay Request api

router.post("/add-pay-request", payRrequest);
router.post("/hold-payment",holdpay);


// add-Bill
router.post("/add-bill",addBill);
router.get("/get-all-bill",getBill);

module.exports = router;
