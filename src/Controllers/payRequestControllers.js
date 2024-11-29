const payRequestModells = require("../Modells/payRequestModells");

const payRrequest = async (req, res) => {
    try {
      const {
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
        pay_mode,
        benificiary,
        acc_number,
        branch,
        submitted_by,
        approved,
        disable,
        acc_match,
        utr,
        total_balance,
      } = req.body;
  
      
    //   if (!id || !pay_id || !amount_paid || !pay_type) {
    //     return res.status(400).json({ message: "Required fields are missing!" });
    //   }
  
      // Create a new Payment record
      const payment = new payRequestModells({
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
        pay_mode,
        benificiary,
        acc_number,
        branch,
        created_on: new Date(),
        submitted_by,
        approved,
        disable,
        acc_match,
        utr,
        total_balance,
      });
  
      // Save to the database
      await payment.save();
  
      res.status(201).json({ message: "Payment registered successfully", payment });
    } catch (err) {
      res.status(500).json({ message: "Error registering payment", error: err.message });
    }
  };
  

  module.exports={
    payRrequest
  }



    
    
