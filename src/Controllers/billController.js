const addBillModells=require("../Modells/billDetailModells");
const projectModells =require("../Modells/projectModells");
const purchaseOrderModeslls =require("../Modells/purchaseOrderModells");
const moment= require("moment");
const addBill = async function (req, res) {

        try {
          const { po_number, bill_number, bill_date, bill_value, bill_type, submitted_by,approved_by } = req.body;
      
          // Step 1: Calculate total billed value for the given PO number
          const bills = await addBillModells.find({ po_number });
          const totalBilled = bills.reduce((sum, bill) => sum + bill.bill_value, 0);
      
          // Step 2: Fetch the purchase order value
          const purchaseOrder = await purchaseOrderModeslls.findOne({ po_number });
          if (!purchaseOrder) {
            return res.status(404).json({ message: 'Purchase Order not found.' });
          }
      
          const { po_value, final } = purchaseOrder;
      
          // Step 3: Check if total billed value exceeds PO value
          if (po_value < totalBilled + bill_value) {
            return res.status(400).json({
              message: 'Total billed amount exceeds the PO value. Please review the billing details.',
            });
          }
      
          // Step 4: Save the new bill
          const newBill = new addBillModells({
            po_number,
            bill_number,
            bill_date: moment(bill_date, 'YYYY-MM-DD').toDate(),
            bill_value,
            type: bill_type,
            submitted_by,
            approved_by
          });
      
          const savedBill = await newBill.save();
      
          // Step 5: If "Final" bill, update the purchase order status
          if (bill_type === 'Final') {
            await purchaseOrderModeslls.updateOne({ po_number }, { $set: { final: 'disabled' } });
          }
      
          res.status(201).json({
            message: 'Bill added successfully!',
            data: savedBill,
          });
        } catch (error) {
          console.error(error);
          res.status(500).json({
            message: 'An error occurred while adding the bill.',
            error: error.message,
          });
        }
      };
    
    
  
module.exports={
    addBill
}

