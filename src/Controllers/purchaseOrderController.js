const projectModells = require("../Modells/projectModells");
const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const iteamModells = require("../Modells/iteamModells");
const recoveryPurchaseOrder = require("../Modells/recoveryPurchaseOrderModells");
const pohisttoryModells = require("../Modells/pohistoryModells");



//Add-Purchase-Order
const addPo = async function (req, res) {
  try {
    const {
      p_id,
      date,
      item,
      other,
      po_number,
      po_value,
      vendor,
      partial_billing,
      submitted_By,
      po_basic,
      gst,
    } = req.body;

   let resolvedItem = item === "Other" ? other : item;
    

    // Check partial billing
    const partialItem = await iteamModells.findOne({ item: resolvedItem });
    const partal_billing = partialItem ? partialItem.partial_billing : "";

  
    const existingPO = await purchaseOrderModells.findOne({ po_number });
    if (existingPO) {
      return res.status(400).send({ message: "PO Number already used!" });
    }

    // Add new Purchase Order
    const newPO = new purchaseOrderModells({
      p_id,
      po_number,
      date,
      item: resolvedItem,
      po_value,
      vendor,
      other,
      submitted_By,
      partial_billing,
      po_basic,
      gst,
    });

    await newPO.save();

    res.status(200).send({
      message: "Purchase Order has been added successfully!",

      newPO,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "An error occurred while processing your request." });
  }
};

//Edit-Purchase-Order
const editPO = async function (req, res) {
  let id = req.params._id;
  let updateData = req.body;
  try {
    let update = await purchaseOrderModells.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    const pohistory = {
      po_number: update.po_number,
      offer_Id: update.offer_Id,
      // po_number: updatedPO.po_number,
      date: update.date,
      item: update.item,
      other: update.other,
      po_value: update.po_value,
      total_advance_paid: update.total_advance_paid,
      po_balance: update.po_balance,
      vendor: update.vendor,
      partial_billing: update.partial_billing,
      amount_paid: update.amount_paid,
      comment: update.comment,
      po_basic: update.po_basic,
      gst: update.gst,
      updated_on: new Date().toISOString(), // Use current time for updated_on field
      submitted_By: update.submitted_By,
    };
    await pohisttoryModells.create(pohistory);

    res.status(200).json({
      msg: "Project updated successfully",
      data: update, // Send back the updated project data
    });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
  }
};

//Get-Purchase-Order
const getPO = async function (req, res) {
  let id = req.params._id;
  let data = await purchaseOrderModells.findById(id);
  res.status(200).json({ msg: "PO Detail", data: data });
};

//get PO History
const getpohistory = async function (req, res) {
 const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const limit = 10; 
    const skip = (page - 1) * pageSize;
  let data = await pohisttoryModells
      .find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
  res.status(200).json({ msg: "All PO History", data: data });
};

// get-purchase-order-by p_id
const getPOByProjectId = async function (req, res) {
  let { p_id } = req.body;
  let data = await purchaseOrderModells.find({ p_id: p_id });
  res.status(200).json({ msg: "All Purchase Orders", data: data });
};



//get po history by id
const getPOHistoryById = async function (req, res) {
  try {
    let id = req.params._id;
    let data = await pohisttoryModells.findById(id);
    res.status(200).json({ msg: "PO History Detail", data: data });
  } catch (error) {
    res.status(500).json({ msg: "Error fetching data", error: error.message });
  }
};

//get ALLPO
const getallpo = async function (req, res) {
  try {
   const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const limit = 10; 
    const skip = (page - 1) * pageSize;
    let data = await purchaseOrderModells.find()
     .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json({ msg: "All PO", data: data });
  } catch (error) {
    res.status(500).json({ msg: "Error fetching data", error: error.message });
  }
};

//Move-Recovery
const moverecovery = async function (req, res) {
  const { _id } = req.params._id;

  try {
    // Find and delete the item from the main collection
    const deletedItem = await purchaseOrderModells.findOneAndReplace(_id);

    if (!deletedItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Add the deleted item to the recovery collection
    const recoveryItem = new recoveryPurchaseOrder({
      po_number: deletedItem.po_number,
      p_id: deletedItem.p_id,
      date: deletedItem.date,
      item: deletedItem.item,
      other: deletedItem.other,
      po_value: deletedItem.po_value,
      final: deletedItem.final,
      po_balance: deletedItem.po_balance,
      vendor: deletedItem.vendor,
      partial_billing: deletedItem.partial_billing,
      amount_paid: deletedItem.amount_paid,
      comment: deletedItem.comment,
      updated_on: deletedItem.updated_on,
      submitted_By: deletedItem.submitted_By,
    });

    await recoveryItem.save();
    await purchaseOrderModells.deleteOne(_id);

    res.json({
      message: "Item moved to recovery collection successfully",
      item: recoveryItem,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting item" + error });
  }
};
//Export-CSV
const exportCSV = async function (req, res) {
  try {
    // Fetch data from MongoDB
    const users = await purchaseOrderModells.find().lean(); // Use `.lean()` to get plain JS objects
    // console.log(users);

    if (users.length === 0) {
      return res.status(404).send("No data found to export.");
    }

    // Specify fields for CSV
    const fields = ["p_id", "date", "item", "other", "po_number", " po_value"];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(users);

    // Save CSV to a file
    const filePath = path.join(__dirname, "exports", "users.csv");
    fs.mkdirSync(path.dirname(filePath), { recursive: true }); // Ensure the directory exists
    fs.writeFileSync(filePath, csv);

    // Send CSV file to client
    res.download(filePath, "users.csv", (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error while downloading the file.");
      } else {
        console.log("File sent successfully.");
      }
    });
  } catch (error) {
    console.error("Error exporting to CSV:", error);
    res.status(500).send("An error occurred while exporting the data.");
  }
};

// Delete po
const deletePO = async function (req, res) {
  let _id = req.params._id;
  try {
    let data = await purchaseOrderModells.findByIdAndDelete(_id);
    res.status(200).json({ msg: "PO deleted successfully", data });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
  }
};



module.exports = {
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
  
};
