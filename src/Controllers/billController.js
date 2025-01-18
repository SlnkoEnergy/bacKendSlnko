const addBillModells = require("../Modells/billDetailModells");
const projectModells = require("../Modells/projectModells");
const purchaseOrderModeslls = require("../Modells/purchaseOrderModells");
const moment = require("moment");





//Add-Bill
const addBill = async function (req, res) {
  try {
    const {
      po_number,
      bill_number,
      bill_date,
      bill_value,
      bill_type,
      submitted_by,
      approved_by,
    } = req.body;

    // Step 1: Calculate total billed value for the given PO number
    // const bills = await addBillModells.find({ po_number });
    // const totalBilled = bills.reduce((sum, bill) => sum + bill.bill_value);

    // Step 2: Fetch the purchase order value
    const purchaseOrder = await purchaseOrderModeslls.findOne({ po_number });
    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase Order not found." });
    }

  //  const { po_value, final } = purchaseOrder;

    // Step 3: Check if total billed value exceeds PO value
    // if (po_value < totalBilled + bill_value) {
    //   return res.status(400).json({
    //     message:
    //       "Total billed amount exceeds the PO value. Please review the billing details.",
    //   });
   // }
    const biilnum= await addBillModells.findOne({ bill_number });
    if (biilnum) {
      return res.status(400).send({ message: "Bill Number already used!" });
    }

    // Step 4: Save the new bill
    const newBill = new addBillModells({
      po_number,
      bill_number,
      bill_date: moment(bill_date, "YYYY-MM-DD").toDate(),
      bill_value,
      type: bill_type,
      submitted_by,
      approved_by,
    });

    const savedBill = await newBill.save();

    // Step 5: If "Final" bill, update the purchase order status
    if (bill_type === "Final") {
      await purchaseOrderModeslls.updateOne(
        { po_number },
        { $set: { final: "disabled" } }
      );
    }

    res.status(201).json({
      message: "Bill added successfully!",
      data: savedBill,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "An error occurred while adding the bill.",
      error: error.message,
    });
  }
};







//GET ALL BILL
const getBill = async function (req, res) {
  // const page = parseInt(req.query.page) || 1;
  // const pageSize = 200;
  // const skip = (page - 1) * pageSize;

  let data = await addBillModells.find();
  // .sort({ createdAt: -1 }) // Latest first
  // .skip(skip)
  // .limit(pageSize);;
  res.status(200).json({ msg: "All Bill Detail", data });
};





//update-bill
const updatebill = async function (req, res) {
  try {
    let id = req.params._id;
  let updatedata = req.body;
  let data = await addBillModells.findByIdAndUpdate(id, updatedata, {
    new: true,
  });
  if (!data) {
    res.status(404).json({ msg: "User Not fornd" });
  }
  res.status(200).json({msg:"Bill updated sucessfully", data});
    
  } catch (error) {
    res.status(400).json({
      message: "An error occurred while adding the bill.",
      error: error.message,
    });
   
  }
};

//delete-bill

const deleteBill = async function (req, res) {
  try {
    let id = req.params._id;
    let data = await addBillModells.findByIdAndDelete(id);
    if (!data) {
      res.status(404).json({ msg: "User Not fornd" });
    }
    res.status(200).json({msg:"Bill deleted sucessfully", data});
      
    } catch (error) {
      res.status(400).json({
        message: "An error occurred while adding the bill.",
        error: error.message,
      });
     
    }
}

module.exports = {
  addBill,
  getBill,
  updatebill,
  deleteBill
};
