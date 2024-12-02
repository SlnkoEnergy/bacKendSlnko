const payRequestModells = require("../Modells/payRequestModells");
const projectModells =require("../Modells/projectModells")

const  payRrequest = async (req, res) => {
  try {
    const { pay_id, p_id, pay_type, amt_paid, po_value, ...otherData } = req.body;

    // Check if pay_id exists
    const existingPayment = await payRequestModells.findOne({ pay_id });
    if (existingPayment) {
      return res.status(400).json({ msg: 'Payment ID already used!' });
    }


    // Get project details by project ID
    const project = await projectModells.findOne({ p_id });
    if (!project) {
      return res.status(400).json({ msg: 'Project ID is invalid!' });
    }

    // Validation: Amount paid should not exceed PO value
    if (amt_paid > po_value) {
      return res.status(400).json({ msg: 'Requested Amount is greater than PO Value!' });
    }

    // Insert new payment request
    const newPayment = new payRequestModells({
      p_id,
      pay_id,
      pay_type,
      amount_paid: amt_paid,
      ...otherData,
    });
    await newPayment.save();

    return res.status(200).json({ msg: 'Payment requested successfully', newPayment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Failed to request payment. Please try again.', error: error.message });
  }
};


  module.exports={
    payRrequest
  }



    
    
