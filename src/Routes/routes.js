var router = require("express").Router();

const {
  addMoney,
  getCreditAmount,
  getAllBill,
  allbill,
  credit_amount,
  deletecredit,
} = require("../Controllers/addMoneyController");
const {
  createProject,
  updateProject,
  getallproject,
  deleteProjectById,
  getProjectById,
} = require("../Controllers/ProjectController");
const {
  userRegister,
  login,
  getalluser,
  forgettpass,

  verifyandSendPass,
  deleteUser,
  getSingleUser,
} = require("../Controllers/userController");

const {
  addPo,
  editPO,
  getPO,
  getallpo,
  exportCSV,
  moverecovery,
  getPOByProjectId,
  deletePO,
  getpohistory,
 
} = require("../Controllers/purchaseOrderController");
const {
  addVendor,
  getVendor,
  updateVendor,
  deleteVendor,
} = require("../Controllers/addVenderController");
const { additem, getItem } = require("../Controllers/itemController");
const {
  payRrequest,
  holdpay,
  getPaySummary,
  hold,
  account_matched,
  utrUpdate,
  accApproved,
  newAppovAccount,
  deletePayRequestById,
  editPayRequestById,
  getPayRequestById,
  excelData,
  updateExcelData,
  recoverypayrequest,
  restorepayrequest,
  getPay,
  
} = require("../Controllers/payRequestControllers");

const {
  addBill,
  getBill,
  updatebill,
  deleteBill,
  bill_approved,
} = require("../Controllers/billController");
const {
  subtractmoney,
  getsubtractMoney,
  deleteDebitMoney,
} = require("../Controllers/subtractMoneyController");



const { all_project_balance, all_project_debit, total_po_balance, total_billed_value, total_project_billValue } = require("../Controllers/balanceController");

// Admin router
router.post("/user-registration", userRegister);
router.post("/login", login);
router.get("/get-all-user", getalluser);
router.post("/forget-password-send-otp", forgettpass);
router.post("/received-email", verifyandSendPass);
router.delete("/delete-user/:_id", deleteUser);
router.get("/get-single-user/:_id", getSingleUser);

//project router
router.post("/add-new-project", createProject);
router.put("/update-project/:_id", updateProject);
router.get("/get-all-project", getallproject);
router.delete("/delete-by-id/:_id", deleteProjectById); //delete project by id
router.get("/get-project-id/:_id", getProjectById); //get project by id

//addMoney APi
router.post("/Add-Money", addMoney);
router.get("/all-bill", allbill);
router.post("/get-bill", credit_amount);


//purchase order controller
router.post("/Add-purchase-order", addPo);
router.put("/edit-po/:_id", editPO);
router.get("/get-po/:_id", getPO);
router.get("/get-all-po", getallpo);
router.post("/export-to-csv", exportCSV);
router.put("/remove-to-recovery/:_id", moverecovery);
router.get("/get-po-by-p_id/", getPOByProjectId);
router.delete("/delete-po/:_id",deletePO);
router.get ("/get-po-history",getpohistory);

//Add vendor
router.post("/Add-vendor", addVendor);
router.get("/get-all-vendor", getVendor);
router.put("/update-vendor/:_id", updateVendor); //update vendor
router.delete("/delete-vendor/:_id", deleteVendor); //delete vendor

//item
router.post("/add-item", additem);
router.get("/get-item", getItem);

//pay Request api
router.get("/get-pay-sumry",getPay);
router.post("/add-pay-request", payRrequest);
router.post("/hold-payment", holdpay);
router.get("/get-pay-summary", getPaySummary);
router.get("/hold-pay-summary", hold);
router.put("/acc-matched", account_matched);
router.put("/utr-update", utrUpdate);
router.put("/account-approve", accApproved);
router.put("/approval", newAppovAccount);
router.delete("/delete-payrequest/:_id", deletePayRequestById);
// router.get("/get-vendor-single/:_id",getVendorById);
//router.delete("/remove-payrequest-to-recovery/:_id",moverecovery)
router.put("/update-pay-request/:_id", editPayRequestById); //update pay request
router.get("/get-pay-request-id/:_id", getPayRequestById); //get pay request by id
router.get("/get-exceldata",excelData);
router.put("/update-excel-data",updateExcelData);
router.put("/restorepayrequest/:_id",restorepayrequest); 


// add-Bill
router.post("/add-bill", addBill);
router.get("/get-all-bill", getBill);
router.put("/update-bill/:_id", updatebill);
router.delete("/delete-credit-amount/:_id", deletecredit);
router.delete("/delete-bill/:_id", deleteBill);
router.put("/accepted-by",bill_approved);

//subtractmoney-debitmoney
router.post("/debit-money", subtractmoney);
router.get("/get-subtract-amount", getsubtractMoney);
router.delete("/delete-debit-money/:_id", deleteDebitMoney);




//All Balance SUMMARY
router.get("/get-balance-summary", all_project_balance);
router.get("/get-debit-balance",all_project_debit);
router.get("/get-po-balance", total_po_balance); 
router.get("/get-total-billed", total_billed_value);
//router.post("/total-project-bill", total_project_billValue);





module.exports = router;
