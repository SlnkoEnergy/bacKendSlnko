const payRequestModells = require("../Modells/payRequestModells");
const projectModells =require("../Modells/projectModells");
const holdPayment = require("../Modells/holdPaymentModells");
const holdPaymentModells = require("../Modells/holdPaymentModells");
const recoverPay= require("../Modells/reoveryPayRequestModells");

const  payRrequest = async (req, res) => {
  try {
    const {  id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment, } = req.body;

    // Check if pay_id exists
    const existingPayment = await payRequestModells.findOne({ pay_id:pay_id });
    if (existingPayment) {
      return res.status(400).json({ msg: 'Payment ID already used!' });
    }


    // Get project details by project ID
    const project = await projectModells.find({ p_id:p_id });
    if (!project) {
      return res.status(400).json({ msg: 'Project ID is invalid!' });
    }

    // Validation: Amount paid should not exceed PO value
    if (amount_paid > po_value) {
      return res.status(400).json({ msg: 'Requested Amount is greater than PO Value!' });
    }

    // Insert new payment request
    const newPayment = new payRequestModells({ 
      id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment,
      
      
      
    });
    await newPayment.save();

    return res.status(200).json({ msg: 'Payment requested successfully', newPayment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Failed to request payment. Please try again.', error: error.message });
  }
};






const recoverypay= async function (req,res) {
 const _id = req.query._id; 
try {
    const deletedItem = await payRequestModells.findOneAndReplace(_id);

    if (!deletedItem) {
      return res.status(404).json({ message: "Item not found" });
    }

   
    const recoveryItemData =new recoverPay({
      id: deletedItem.id,
      p_id: deletedItem.p_id,
      pay_id: deletedItem.pay_id,
      pay_type: deletedItem.pay_type,
      amount_paid: deletedItem.amount_paid,
      amt_for_customer: deletedItem.amt_for_customer,
      dbt_date: deletedItem.dbt_date,
      paid_for: deletedItem.paid_for,
      vendor: deletedItem.vendor,
      po_number: deletedItem.po_number,
      po_value: deletedItem.po_value,
      po_balance: deletedItem.po_balance,
      pay_mode: deletedItem.pay_mode,
      paid_to: deletedItem.paid_to,
      ifsc: deletedItem.ifsc,
      benificiary: deletedItem.benificiary,
      acc_number: deletedItem.acc_number,
      branch: deletedItem.branch,
      created_on: deletedItem.created_on,
      submitted_by: deletedItem.submitted_by,
      approved: deletedItem.approved,
      disable: deletedItem.disable,
      acc_match: deletedItem.acc_match,
      utr: deletedItem.utr,
      total_advance_paid: deletedItem.total_advance_paid,
      other: deletedItem.other,
  });

  await recoveryItemData.save();

   
    res.json({
      message: "Item moved to recovery collection successfully",
      item: recoveryItemData,
    });
  } catch (error) {
    res.status(500).json({ message: "Error processing recovery: " + error });
  }

  
  
};




const holdpay = async function(req,res) {

  try{
  const{
    id,
    p_id,
    pay_id,
    pay_type,
    amount_paid,
    amt_for_customer,
    dbt_date,
    paid_for,
    vendor,
    po_number,
    po_value,
    po_balance,
    pay_mode,
    paid_to,
    ifsc,
    benificiary,
    acc_number,
    branch,
    created_on,
    submitted_by,
    approved,
    disable,
    acc_match,
    utr,
    total_advance_paid,
    other,
    comment,

  }=req.body;

  const existingPayment = await payRequestModells.findOne({ pay_id:pay_id });
    if (existingPayment) {
      return res.status(400).json({ msg: 'Payment ID already used!' });
    }


    // Get project details by project ID
    const project = await projectModells.find({ p_id:p_id });
    if (!project) {
      return res.status(400).json({ msg: 'Project ID is invalid!' });
    }

    // Validation: Amount paid should not exceed PO value
    if (amount_paid > po_value) {
      return res.status(400).json({ msg: 'Requested Amount is greater than PO Value!' });
    }

    const holdPayment = new holdPaymentModells({ 
      id,
      p_id,
      pay_id,
      pay_type,
      amount_paid,
      amt_for_customer,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      po_balance,
      pay_mode,
      paid_to,
      ifsc,
      benificiary,
      acc_number,
      branch,
      created_on,
      submitted_by,
      approved,
      disable,
      acc_match,
      utr,
      total_advance_paid,
      other,
      comment,
      
      
      
    });
    await holdPayment.save();

    return res.status(200).json({ msg: 'Hold Payment requested successfully', holdPayment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Failed to request hold payment. Please try again.', error: error.message });
  }

};
const getPaySummary =async (req,res) => {
  let data = await payRequestModells.find();
  res.status(200).json(data)
  
};


const hold = async function(req,res) {
  let data = await holdPaymentModells.find();
  res.status(200).json({msg:"Hold Payment Status",data})
  
};





  





  module.exports={
    payRrequest,holdpay,
    getPaySummary,
    hold,
    recoverypay
  }



    
    
