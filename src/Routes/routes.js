var router = require("express").Router();
const jwtMW =require("../middlewares/auth");
const {
  addMoney,
  getCreditAmount,
  getAllBill,
  allbill,
  credit_amount,
  deletecredit,
  deleteCreditAmount,
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
  forgetpassword,
  verifyandResetPassword,
  verifyOtp,
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
  getPOHistoryById,
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
  approve_pending,
  hold_approve_pending,
  updateExceData,
  getExcelDataById,
  getpy,
} = require("../Controllers/payRequestControllers");


const { addAdjustmentRequest, getAdjustmentRequest, deleteAdjustmentRequest } =require("../Controllers/adjustmentRequestController");

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
  recoveryDebit,
  deleteSubtractMoney,
} = require("../Controllers/subtractMoneyController");

const {
  all_project_balance,
  all_project_debit,
  total_po_balance,
  total_billed_value,
  total_project_billValue,
  project_credit_amount,
  project_debit_amount,
} = require("../Controllers/balanceController");

const {
  createOffer,
  getCommOffer,
  editOffer,
  deleteOffer,
} = require("../Controllers/commOfferController");

const {
  addCommRate,
  getCommRate,
  editCommRate,
  deleteCommRate,
} = require("../Controllers/commRateController");

const {
  addCommScmRate,
  editCommScmRate,
  getCommScmRate,
} = require("../Controllers/commScmRateController");
const {
  addCommBDRate,
  editCommBDRate,
  getCommBDRate,
  deleteCommBDRate,
  getCommBdRateHistory,
  getCommBDRateByOfferId,
} = require("../Controllers/coomBDRateController");

// const { createBDlead, getBDlead, editBDlead, deleteBDlead }=require("../Controllers/createBdLeadcontroller");

const {
  createeBDlead,
  getBDleaddata,
  getallinitialbdlead,
  editinitialbdlead,
  getinitalbdleadstreams,
} = require("../Controllers/bdcreateControllers");
const {
  initialtofollowup,
  initaltowarmup,
  initialtodead,
  initialtowon,
  getallwon,
  getallfollowup,
  getalldead,
  followuptoall,
  followuptowarm,
  followuptodead,
  followuptowon,
  warmuptowon,
  warmuptodead,
  deadtoinitial,
  deadtofollowup,
  deadtowarm,
  warmtofollowup,
  iniitalbd,
  updateinitialbd,
  updatefollowup,
  updatewarm,
  getallwarm,
  editfollowup,
  editwarm,
  deletedead,
  allbdlead,
  wontodead,
  deadtowon,
  updatewon,
  updateWonLead,
} = require("../Controllers/initialbdController");


const{ addtask, getaddtask, editComment, gettaskHistory, updatetaskstatus }=require("../Controllers/addtaskbdController");
const { createhandoversheet, gethandoversheetdata, edithandoversheetdata, updateStatusOfHandoversheet, getbdhandoversheetdata, updateStatusHandoversheet, updatehandoverbd, updatestatus, checkid, getbyid, search } =require("../Controllers/handoversheetController");
const { addmoduleMaster, getmoduleMasterdata, editmodulemaster, deletemodulemaster }=require("../Controllers/moduleMasterController");
// const { deleteOne } = require("../Modells/moduleMasterModells");

const{ addinveterMaster, getinveterMasterdata }=require("../Controllers/inveterMasterController");

const { addTransformer, getTransformer }=require("../Controllers/engineeringController/transformerController");

const { addLTPanel, getLTPanel }=require("../Controllers/engineeringController/LTPanelControllers");

const { addHTPanel, getHTPanels } = require("../Controllers/engineeringController/HTPanelController");

const { addaccabel, getACCabels }=require("../Controllers/engineeringController/ACCabelController");

const { add_dc_cabel, get_dc_cabels }=require("../Controllers/engineeringController/DCCabelController");

const { addbos, getbos }=require("../Controllers/engineeringController/BOSController");

const{ addPoolingStation, getAllPoolingStations } = require("../Controllers/engineeringController/PoolingStationController");

const{ addBOM, getBOM } =require("../Controllers/engineeringController/BOMController");
const allowRoles = require("../middlewares/expenseSheetMiddlewares/allowRoles");
const { createExpense, getAllExpense, getExpenseById, deleteExpense, updateExpenseStatusOverall, updateExpenseStatusItems, exportAllExpenseSheetsCSV, exportExpenseSheetsCSVById, updateExpenseSheet, updateDisbursementDate } = require("../Controllers/expenseSheetControllers/expenseSheetController");
// const updateExpenseStatus = require("../middlewares/expenseSheetMiddlewares/updateExpenseStatus");


const { createlead, getbdlead, get_all_lead, get_lead_by_id, all_bd_lead, update_lead, delete_lead, updateLeadStatus,  }= require("../Controllers/bdleadController");
const { create } = require("../Modells/bdleadsModells");


const{ createMaterial, getAllMaterials, deleteMaterial, updateMaterial }=require("../Controllers/engineeringController/materials/materialController.js");

const{ addMaterialCategory, getAllMaterialCategories, deleteMaterialCategory, updateMaterialCategory }=require("../Controllers/engineeringController/materials/materialCategoryController");
const upload = require("../middlewares/multer.js");
const {createModule, getModuleById, getAllModule, updateModule, deleteModule} = require("../Controllers/engineeringController/engineeringModules/moduleTemplateController.js");
const { createModuleCategory, getModuleCategory, getModuleCategoryById, updateModuleCategory, updateModuleCategoryStatus } = require("../Controllers/engineeringController/engineeringModules/moduleCategoryContoller.js");
const { createBoqTemplate, getBoqTemplateById } = require("../Controllers/engineeringController/boq/boqTemplateController.js");


// Admin router
router.post("/user-registratioN-IT",userRegister);
router.post("/logiN-IT", login);
router.get("/get-all-useR-IT",jwtMW.authentication,jwtMW.authorization, getalluser);
router.post("/sendOtp", forgettpass);
router.post("/verifyOtp", verifyOtp);
router.post("/resetPassword", verifyandResetPassword);
router.delete("/delete-useR-IT/:_id",jwtMW.authentication,jwtMW.authorization, deleteUser);
router.get("/get-single-useR-IT/:_id",jwtMW.authentication,jwtMW.authorization, getSingleUser);


//project router
router.post("/add-new-projecT-IT",jwtMW.authentication,jwtMW.authorization, createProject);
router.put("/update-projecT-IT/:_id",jwtMW.authentication,jwtMW.authorization, updateProject);
router.get("/get-all-projecT-IT",jwtMW.authentication,jwtMW.authorization, getallproject);
router.delete("/delete-by-iD-IT/:_id",jwtMW.authentication,jwtMW.authorization, deleteProjectById); //delete project by id
router.get("/get-project-iD-IT/:_id",jwtMW.authentication,jwtMW.authorization, getProjectById); //get project by id

//addMoney APi
router.post("/Add-MoneY-IT",jwtMW.authentication,jwtMW.authorization, addMoney);
router.get("/all-bilL-IT",jwtMW.authentication,jwtMW.authorization, allbill);
router.post("/get-bilL-IT",jwtMW.authentication,jwtMW.authorization, credit_amount);
router.delete("/delete-crdit-amount/:_id",jwtMW.authentication,jwtMW.authorization, deleteCreditAmount);

//purchase order controller
router.post("/Add-purchase-ordeR-IT",jwtMW.authentication,jwtMW.authorization, addPo);
router.put("/edit-pO-IT/:_id",jwtMW.authentication,jwtMW.authorization, editPO);
router.get("/get-pO-IT/:_id",jwtMW.authentication,jwtMW.authorization, getPO);
router.get("/get-all-pO-IT",jwtMW.authentication,jwtMW.authorization, getallpo);
router.post("/export-to-csv",jwtMW.authentication,jwtMW.authorization, exportCSV);
router.put("/remove-to-recovery/:_id",jwtMW.authentication,jwtMW.authorization, moverecovery);
router.get("/get-po-by-p_id/",jwtMW.authentication,jwtMW.authorization, getPOByProjectId);
router.delete("/delete-pO-IT/:_id",jwtMW.authentication,jwtMW.authorization, deletePO);
router.get("/get-po-historY-IT",jwtMW.authentication,jwtMW.authorization, getpohistory);
router.get("/get-po-history-iD/:_id",jwtMW.authentication,jwtMW.authorization, getPOHistoryById);

//Add vendor
router.post("/Add-vendoR-IT",jwtMW.authentication,jwtMW.authorization, addVendor);
router.get("/get-all-vendoR-IT",jwtMW.authentication,jwtMW.authorization, getVendor);
router.put("/update-vendoR-IT/:_id",jwtMW.authentication,jwtMW.authorization, updateVendor); //update vendor
router.delete("/delete-vendoR-IT/:_id",jwtMW.authentication,jwtMW.authorization, deleteVendor); //delete vendor

//item
router.post("/add-iteM-IT",jwtMW.authentication,jwtMW.authorization, additem);
router.get("/get-iteM-IT",jwtMW.authentication,jwtMW.authorization, getItem);

//pay Request api
router.get("/get-pay-sumrY-IT",jwtMW.authentication,jwtMW.authorization, getPay);
router.post("/add-pay-requesT-IT",jwtMW.authentication,jwtMW.authorization, payRrequest);
router.post("/hold-paymenT-IT",jwtMW.authentication,jwtMW.authorization, holdpay);
router.get("/get-pay-summarY-IT",jwtMW.authentication,jwtMW.authorization, getPaySummary);
router.get("/hold-pay-summary-IT",jwtMW.authentication,jwtMW.authorization, hold);
router.put("/acc-matched",jwtMW.authentication,jwtMW.authorization, account_matched);
router.put("/utr-update",jwtMW.authentication,jwtMW.authorization, utrUpdate);
router.put("/account-approve",jwtMW.authentication,jwtMW.authorization, accApproved);
router.put("/approval",jwtMW.authentication,jwtMW.authorization, newAppovAccount);
router.delete("/delete-payrequest/:_id",jwtMW.authentication,jwtMW.authorization, deletePayRequestById);
router.put("/update-pay-request/:_id",jwtMW.authentication,jwtMW.authorization, editPayRequestById); //update pay request
router.get("/get-pay-request-id/:_id",jwtMW.authentication,jwtMW.authorization, getPayRequestById); //get pay request by id
router.get("/get-exceldata",jwtMW.authentication,jwtMW.authorization, excelData);
router.put("/update-excel-data",jwtMW.authentication,jwtMW.authorization, updateExcelData);
router.put("/restorepayrequest/:_id",jwtMW.authentication,jwtMW.authorization, restorepayrequest);
router.post("/approve-data-send-holdpay",jwtMW.authentication,jwtMW.authorization, approve_pending);
router.post("/hold-payto-payrequest",jwtMW.authentication,jwtMW.authorization, hold_approve_pending);
router.put("/update-excel",jwtMW.authentication,jwtMW.authorization, updateExceData);
router.get("/get-single-excel-data/:_id",jwtMW.authentication,jwtMW.authorization, getExcelDataById);
router.get("/get-pay-smry",jwtMW.authentication,jwtMW.authorization, getpy);

//adjustment request
router.post("/add-adjustment-request",jwtMW.authentication,jwtMW.authorization, addAdjustmentRequest);
router.get("/get-adjustment-request",jwtMW.authentication,jwtMW.authorization, getAdjustmentRequest);
router.delete("/delete-adjustment-request/:_id",jwtMW.authentication,jwtMW.authorization, deleteAdjustmentRequest);



// add-Bill
router.post("/add-bilL-IT",jwtMW.authentication,jwtMW.authorization, addBill);
router.get("/get-all-bilL-IT",jwtMW.authentication,jwtMW.authorization, getBill);
router.put("/update-bill/:_id",jwtMW.authentication,jwtMW.authorization, updatebill);
router.delete("/delete-credit-amount/:_id",jwtMW.authentication,jwtMW.authorization, deletecredit);
router.delete("/delete-bill/:_id",jwtMW.authentication,jwtMW.authorization, deleteBill);
router.put("/accepted-by",jwtMW.authentication,jwtMW.authorization, bill_approved);

//subtractmoney-debitmoney
router.post("/debit-moneY-IT",jwtMW.authentication,jwtMW.authorization, subtractmoney);
router.get("/get-subtract-amounT-IT",jwtMW.authentication,jwtMW.authorization, getsubtractMoney);
router.delete("/delete-debit-money/:_id",jwtMW.authentication,jwtMW.authorization, deleteDebitMoney);
router.put("/recovery-debit/:_id",jwtMW.authentication,jwtMW.authorization, recoveryDebit); //to test for rrecovery subtract money
router.delete("/delete-subtract-moneY/:_id",jwtMW.authentication,jwtMW.authorization, deleteSubtractMoney);

//All Balance SUMMARY
router.get("/get-balance-summary",jwtMW.authentication,jwtMW.authorization, all_project_balance);
router.get("/get-debit-balance",jwtMW.authentication,jwtMW.authorization, all_project_debit);
router.get("/get-po-balance",jwtMW.authentication,jwtMW.authorization, total_po_balance);
router.get("/get-total-billed",jwtMW.authentication,jwtMW.authorization, total_billed_value);
router.post("/get-total-credit-single",jwtMW.authentication,jwtMW.authorization, project_credit_amount);
router.post("/get-total-debit-single",jwtMW.authentication,jwtMW.authorization, project_debit_amount);

//commOffer
router.post("/create-offer",jwtMW.authentication,jwtMW.authorization, createOffer);
router.get("/get-comm-offer",jwtMW.authentication,jwtMW.authorization, getCommOffer);
router.put("/edit-offer/:_id",jwtMW.authentication,jwtMW.authorization, editOffer);
router.delete("/delete-offer/:_id",jwtMW.authentication,jwtMW.authorization, deleteOffer);

//commRate
router.post("/create-rate",jwtMW.authentication,jwtMW.authorization, addCommRate);
router.get("/get-comm-rate",jwtMW.authentication,jwtMW.authorization, getCommRate);
router.put("/edit-comm-rate/:_id",jwtMW.authentication,jwtMW.authorization, editCommRate);
router.delete("/delete-comm-rate/:_id",jwtMW.authentication,jwtMW.authorization, deleteCommRate);

//commScmRate
router.post("/create-scm-rate",jwtMW.authentication,jwtMW.authorization, addCommScmRate);
router.put("/edit-scm-rate/:_id",jwtMW.authentication,jwtMW.authorization, editCommScmRate);
router.get("/get-comm-scm-rate",jwtMW.authentication,jwtMW.authorization, getCommScmRate);

//commBDRate
router.post("/create-bd-rate",jwtMW.authentication,jwtMW.authorization, addCommBDRate);
router.put("/edit-bd-rate/:_id",jwtMW.authentication,jwtMW.authorization, editCommBDRate);
router.get("/get-comm-bd-rate",jwtMW.authentication,jwtMW.authorization, getCommBDRate);
router.delete("/delete-comm-bd-rate/:_id",jwtMW.authentication,jwtMW.authorization, deleteCommBDRate);
router.get("/get-bd-rate-history",jwtMW.authentication,jwtMW.authorization, getCommBdRateHistory);
router.get("/get-bd-rate-by-offer_id",jwtMW.authentication,jwtMW.authorization, getCommBDRateByOfferId);

//createBdLead
// router.post("/create-bd-lead", createBDlead);
// router.get("/get-all-bd-lead", getBDlead);
// router.put("/edit-bd-lead/:_id", editBDlead);
// router.delete("/delete-bd-lead/:_id", deleteBDlead);

//createBdLead
router.post("/create-bd-lead",jwtMW.authentication,jwtMW.authorization, createeBDlead);
router.get("/get-all-bd-lead",jwtMW.authentication,jwtMW.authorization, getBDleaddata);
router.put("/edit-initial-bd-lead/:_id",jwtMW.authentication,jwtMW.authorization,editinitialbdlead);
router.get("/get-all-lead",jwtMW.authentication,jwtMW.authorization,allbdlead);
router.get("/get-initial-bd-lead-streams",jwtMW.authentication,jwtMW.authorization,getinitalbdleadstreams);

//initialbd lead
router.post("/initial-to-followup",jwtMW.authentication,jwtMW.authorization, initialtofollowup);
router.post("/inital-to-warmup",jwtMW.authentication,jwtMW.authorization, initaltowarmup);
router.post("/inital-to-dead",jwtMW.authentication,jwtMW.authorization, initialtodead);
router.post("/initial-to-won",jwtMW.authentication,jwtMW.authorization, initialtowon);
router.get("/get-all-won-lead",jwtMW.authentication,jwtMW.authorization, getallwon);
router.get("/get-all-followup-lead",jwtMW.authentication,jwtMW.authorization, getallfollowup);
router.get("/get-all-dead-lead",jwtMW.authentication,jwtMW.authorization, getalldead);
router.get("/get-all-warm",jwtMW.authentication,jwtMW.authorization,getallwarm);

//followup to all
router.post("/followup-to-all",jwtMW.authentication,jwtMW.authorization, followuptoall);
router.post("/followup-to-warm",jwtMW.authentication,jwtMW.authorization, followuptowarm);
router.post("/followup-to-dead",jwtMW.authentication,jwtMW.authorization, followuptodead);
router.post("/follow-up-to-won",jwtMW.authentication,jwtMW.authorization, followuptowon);
router.post("/warmup-to-won",jwtMW.authentication,jwtMW.authorization, warmuptowon);
router.post("/warmup-to-followup",jwtMW.authentication,jwtMW.authorization, warmtofollowup);//warm to followup
router.post("/warmup-to-dead",jwtMW.authentication,jwtMW.authorization, warmuptodead);
router.get("/get-all-inital-bd-lead",jwtMW.authentication,jwtMW.authorization, getallinitialbdlead);

//Dead to all
router.post("/dead-to-initial",jwtMW.authentication,jwtMW.authorization, deadtoinitial);
router.post("/dead-to-followup",jwtMW.authentication,jwtMW.authorization, deadtofollowup);
router.post("/dead-to-warm",jwtMW.authentication,jwtMW.authorization, deadtowarm);
router.delete("/delete-dead-lead/:_id",jwtMW.authentication,jwtMW.authorization,deletedead);

//won to dead
router.post("/won-to-dead",jwtMW.authentication,jwtMW.authorization,wontodead);
// dead to won

router.post("/dead-to-won",jwtMW.authentication,jwtMW.authorization, deadtowon);


//add task
router.post("/add-task",jwtMW.authentication,jwtMW.authorization,addtask);
router.get("/get-all-task",jwtMW.authentication,jwtMW.authorization,getaddtask);
router.put("/edit-comment/:_id",jwtMW.authentication,jwtMW.authorization,editComment);
router.get("/get-task-history",jwtMW.authentication,jwtMW.authorization,gettaskHistory);
router.put("/update-task-status",jwtMW.authentication,jwtMW.authorization,updatetaskstatus);


//post bd lead

router.post("/create-initial-bd-lead",jwtMW.authentication,jwtMW.authorization,iniitalbd);
router.put("/update-inital",jwtMW.authentication,jwtMW.authorization,updateinitialbd);
router.put("/update-followup",jwtMW.authentication,jwtMW.authorization,updatefollowup);
router.put("/update-warm",jwtMW.authentication,jwtMW.authorization,updatewarm);
router.put("/update-won",jwtMW.authentication,jwtMW.authorization,updatewon);

//edit all bd lead
router.put("/edit-followup/:_id",jwtMW.authentication,jwtMW.authorization, editfollowup)
router.put("/edit-warm/:_id",jwtMW.authentication,jwtMW.authorization,editwarm);


//handdoversheet 
router.post("/create-hand-over-sheet", jwtMW.authentication,jwtMW.authorization,createhandoversheet);
router.get("/get-all-handover-sheet",jwtMW.authentication,jwtMW.authorization,gethandoversheetdata);
router.put("/edit-hand-over-sheet/:_id",jwtMW.authentication,jwtMW.authorization,edithandoversheetdata);
router.put("/update-status/:_id",jwtMW.authentication,jwtMW.authorization,updatestatus);
router.post("/check/:_id",jwtMW.authentication,jwtMW.authorization,checkid);
router.get("/get-handoversheet/:_id",jwtMW.authentication,jwtMW.authorization,getbyid);
router.get("/search/:letter",jwtMW.authentication,jwtMW.authorization,search);


//module master
router.post("/add-module-master",jwtMW.authentication,jwtMW.authorization,addmoduleMaster);
router.get("/get-module-master",jwtMW.authentication,jwtMW.authorization,getmoduleMasterdata);
router.put("/edit-module-master/:_id",jwtMW.authentication,jwtMW.authorization,editmodulemaster);
router.delete("/delete-module-master/:_id",jwtMW.authentication,jwtMW.authorization,deletemodulemaster);



//inveter master
router.post("/add-inveter-master",jwtMW.authentication,jwtMW.authorization,addinveterMaster);
router.get("/get-master-inverter",jwtMW.authentication,jwtMW.authorization,getinveterMasterdata);


//transformer master
router.post("/add-transformer-master",jwtMW.authentication,jwtMW.authorization,addTransformer);
router.get("/get-transformer",jwtMW.authentication,jwtMW.authorization,getTransformer);



//LTPanel master
router.post("/add-ltpanel-master",jwtMW.authentication,jwtMW.authorization,addLTPanel);
router.get("/get-ltpanel-master",jwtMW.authentication,jwtMW.authorization,getLTPanel);


//HTPanel master
router.post("/add-htpanel-master",jwtMW.authentication,jwtMW.authorization,addHTPanel);
router.get("/get-htpanel-master",jwtMW.authentication,jwtMW.authorization,getHTPanels);

//ACCabel master
router.post("/add-accabel-master",jwtMW.authentication,jwtMW.authorization,addaccabel);
router.get("/get-accabel-master",jwtMW.authentication,jwtMW.authorization,getACCabels);

//DC_Cabel_master
router.post("/add-dc-cabel-master",jwtMW.authentication,jwtMW.authorization, add_dc_cabel);
router.get("/get-dc-cabel-master",jwtMW.authentication,jwtMW.authorization, get_dc_cabels);

//BOS master
router.post("/add-bos-master",jwtMW.authentication,jwtMW.authorization, addbos );
router.get("/get-bos-master",jwtMW.authentication,jwtMW.authorization, getbos  );


//pooling station master
router.post("/add-pooling-station-master",jwtMW.authentication,jwtMW.authorization, addPoolingStation );
router.get("/get-pooling-station-master",jwtMW.authentication,jwtMW.authorization, getAllPoolingStations  );
 

//BOM master Engineering
router.post("/add-bom-master",jwtMW.authentication,jwtMW.authorization,addBOM );
router.get("/get-bom-master", jwtMW.authentication,jwtMW.authorization,getBOM );

//Expense Sheet
router.get("/get-all-expense", jwtMW.authentication,jwtMW.authorization, getAllExpense)
router.get("/get-expense-by-id/:_id", jwtMW.authentication, jwtMW.authorization, getExpenseById)
router.post("/create-expense", jwtMW.authentication, jwtMW.authorization,upload ,createExpense)
router.put("/update-expense/:_id", jwtMW.authentication, jwtMW.authorization, updateExpenseSheet);
router.put("/update-disbursement-date/:_id", jwtMW.authentication, jwtMW.authorization, updateDisbursementDate); //update disbursement date
router.put("/:_id/status/overall", jwtMW.authentication, jwtMW.authorization,  updateExpenseStatusOverall);
router.put("/:sheetId/item/:itemId/status", jwtMW.authentication, jwtMW.authorization,  updateExpenseStatusItems);
router.delete("/delete-expense/:_id", jwtMW.authentication, jwtMW.authorization, deleteExpense);
//Export to CSV In expense Sheet
router.get("/expense-all-csv", jwtMW.authentication, jwtMW.authorization, exportAllExpenseSheetsCSV);
router.get("/expense-by-id-csv/:_id",jwtMW.authentication, jwtMW.authorization, exportExpenseSheetsCSVById);

//bd lead new
router.post("/create-lead", jwtMW.authentication, jwtMW.authorization, createlead);
router.get("/all-bd-lead", jwtMW.authentication, jwtMW.authorization, all_bd_lead);
router.get("/get-lead-by-id/:_id", jwtMW.authentication, jwtMW.authorization, get_lead_by_id);
router.put("/update-lead/:_id",jwtMW.authentication, jwtMW.authorization, update_lead);
router.delete("/delete-lead/:_id",jwtMW.authentication, jwtMW.authorization, delete_lead);
router.put("/update-lead/:_id/status", jwtMW.authentication, jwtMW.authorization, updateLeadStatus);

//Engineering Modules
router.post("/create-module",jwtMW.authentication, jwtMW.authorization, createModule);
router.get("/get-module-by-id/:_id", jwtMW.authentication, jwtMW.authorization, getModuleById);
router.get('/get-module', jwtMW.authentication, jwtMW.authorization, getAllModule);
router.put('/update-module/:_id', jwtMW.authentication, jwtMW.authorization, updateModule);
router.delete('/delete-module/:_id', jwtMW.authentication, jwtMW.authorization, deleteModule);

// Project Modules
router.post('/create-module-category', jwtMW.authentication, jwtMW.authorization, createModuleCategory);
router.get('/get-module-category', jwtMW.authentication, jwtMW.authorization, getModuleCategory);
router.get('/get-module-category-id/:_id', jwtMW.authentication, jwtMW.authorization, getModuleCategoryById);
router.put('/update-module-category/:_id', jwtMW.authentication, jwtMW.authorization, updateModuleCategory);
router.put('/:moduleId/item/:itemId/statusModule', jwtMW.authentication, jwtMW.authorization, updateModuleCategoryStatus);

// Boq Templates
router.post('/create-boq-template', jwtMW.authentication, jwtMW.authorization, createBoqTemplate);
router.get('/get-boq-template-by-id/:_id', jwtMW.authentication, jwtMW.authorization, getBoqTemplateById); 

module.exports = router;

