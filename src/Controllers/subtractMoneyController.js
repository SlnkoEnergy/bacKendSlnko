const subtractModells= require("../Modells/debitMoneyModells");
const payrequestModells =require("../Modells/payRequestModells");

const subtractmoney = async function (req, res) {
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
      } = req.body;
  
      // Validate if UTR is provided
      if (!utr  || utr === 0 || utr === "0") {
        return res.status(400).json({ msg: "UTR is missing. Please provide a valid UTR." });
      }
  
      // Check if UTR already exists in payrequestModells
      const existingutr = await payrequestModells.findOne({ utr: { $ne: " " || 0  || "0"  } });
  
      
    if(existingutr){
        const subtractMoney = new subtractModells({
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
  
      // Save to the database
      let data=   await subtractMoney.save();
      return res.status(200).json({
        msg: "Debited amount successfully saved",
        data: data,
      });

    }
   
  
     
    } catch (error) {
      console.error("Error:", error.message);
      return res.status(500).json({
        msg: "Failed to save debited amount. Please try again.",
        error: error.message,
      });
    }
  };

//get subtract money
  const getsubtractMoney = async function (req, res) {
    try {
      const data = await subtractModells.find();
      return res.status(200).json({
        msg: "Debited amount fetched successfully",
        data: data,
      });
    } catch (error) {
      console.error("Error:", error.message);
      return res.status(500).json({
        msg: "Failed to fetch debited amount. Please try again.",
        error: error.message,
      });
    }
  }

  //detete debit money
  const deleteDebitMoney = async function (req, res) {
      const { _id } = req.params;
    
      try {
        // Use MongoDB's updateOne with $unset to remove fields
        const updatedDoc = await subtractModells.updateOne(
          { _id: _id },  // Find document by ID
          {
            $unset: {
              'dbt_date': '',
              'pay_mode': '',
              'paid_for': '',
              'amount_paid': '',
              "utr": '',
              "vendor": '',

            }
          }
        );
    
        if (updatedDoc.nModified === 0) {
          return res.status(404).json({ message: 'Document not found or no changes made.' });
        }
    
        return res.status(200).json({ message: 'Debit amount deleted successfully.' });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error' });
      }
   
}
  

  
  

  module.exports = {
  subtractmoney,
  getsubtractMoney,
  deleteDebitMoney
  };
  
  
    
    
