var router = require("express").Router();

const { addMoney, getCreditAmount, getAllBill, allbill, credit_amount } = require("../Controllers/addMoneyController");
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
  forgettpass,
   
   verifyandSendPass,
} = require("../Controllers/userController");


const { addPo, editPO, getPO, getallpo, exportCSV, moverecovery } = require("../Controllers/purchaseOrderController");
const { addVendor, getVendor } = require("../Controllers/addVenderController");
const { additem, getItem }= require("../Controllers/itemController");
const{ payRrequest, holdpay, getPaySummary, hold }=require("../Controllers/payRequestControllers");

const { addBill, getBill }=require("../Controllers/billController");











// Admin router
router.post("/user-registration", userRegister);
router.post("/login", login);
router.get("/get-all-user", getalluser);
router.post("/forget-password-send-otp", forgettpass);
// router.post("/password-receive",verifyOtpAndSendPassword);

router.post("/received-email",verifyandSendPass );





//project router
router.post("/add-new-project", createProject);
router.put("/update-project/:_id", updateProject);
router.get("/get-all-project", getallproject);
router.delete("/delete-by-id/:_id",deleteProjectById);





//addMoney APi
router.post("/Add-Money", addMoney);
router.get("/all-bill",allbill);
router.post("/get-bill",credit_amount)
// router.get("/get-credit-amount",getCreditAmount);

// router.get("/credit",getCreditAmount)
// router.get("/get-all-bill/:id",getAllBill);





//purchase order controller
router.post("/Add-purchase-order", addPo);
router.put("/edit-po/:_id", editPO);
router.get("/get-po/:_id",getPO);
router.get("/get-all-po",getallpo);
router.post("/export-to-csv",exportCSV);
router.delete("/remove-to-recovery/:_id",moverecovery);



//Add vendor
router.post("/Add-vendor", addVendor);
router.get("/get-all-vendor",getVendor);




//item
router.post("/add-item", additem);
router.get("/get-item",getItem);


//pay Request api

router.post("/add-pay-request", payRrequest);
router.post("/hold-payment",holdpay);
router.get("/get-pay-summary",getPaySummary);
router.get("/hold-pay-summary",hold);
router.delete("/remove-payrequest-to-recovery/:_id",moverecovery)


// add-Bill
router.post("/add-bill",addBill);
router.get("/get-all-bill",getBill);

module.exports = router;
