const adjustmentRequestModells = require("../Modells/adjustmentRequestModells");  


//add adjustment request
const addAdjustmentRequest = async (req, res) => {
try {
    const { p_id, pay_id, pay_type, amount_paid, dbt_date, paid_for, vendor, po_number, po_value, adj_type, adj_amount, remark, adj_date, submitted_by, comment } = req.body;
    const adjustmentRequest = new adjustmentRequestModells({
        p_id,
        pay_id,
        pay_type,
        amount_paid,
        dbt_date,
        paid_for,
        vendor,
        po_number,
        po_value,
        adj_type,
        remark,
        adj_date,
        adj_amount,
        submitted_by,
        comment
    });
    await adjustmentRequest.save();
    res.status(201).json({ message: "Adjustment request added successfully", adjustmentRequest });



    
} catch (error) {
   
    res.status(500).json({ message: "Internal server error" });
  }
    
};

//get all adjustment request

const getAdjustmentRequest = async (req, res) => {
    try {
        const adjustmentRequests = await adjustmentRequestModells.find();
        res.status(200).json(adjustmentRequests);
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    addAdjustmentRequest,
    getAdjustmentRequest
};

