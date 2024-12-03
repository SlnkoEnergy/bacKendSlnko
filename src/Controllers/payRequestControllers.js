const payRequestModells = require("../Modells/payRequestModells");
const projectModells =require("../Modells/projectModells");
const holdPayment = require("../Modells/holdPaymentModells");
const holdPaymentModells = require("../Modells/holdPaymentModells");


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

  const existingPayment = await payRequestModells.find({ pay_id:pay_id });
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




  





  module.exports={
    payRrequest,holdpay
  }



    
    
