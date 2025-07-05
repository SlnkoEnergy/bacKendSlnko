const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const iteamModells = require("../Modells/iteamModells");
const recoveryPurchaseOrder = require("../Modells/recoveryPurchaseOrderModells");
const pohisttoryModells = require("../Modells/pohistoryModells");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");
const { default: axios } = require("axios");
const FormData = require("form-data");
const { default: mongoose } = require("mongoose");
const materialCategoryModells = require("../Modells/EngineeringModells/materials/materialCategoryModells");

//Add-Purchase-Order
const addPo = async (req, res) => {
  try {
    const data =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data;

    const {
      p_id,
      date,
      item,
      other,
      po_number,
      po_value,
      vendor,
      submitted_By,
      po_basic,
      gst,
      offer_Id,
      pr_id
    } = data;

    const resolvedItem = item === "Other" ? other : item;

    // Check if PO Number already exists
    const existingPO = await purchaseOrderModells.findOne({ po_number });
    if (existingPO) {
      return res.status(400).json({ message: "PO Number already used!" });
    }

    // Get partial billing info
    const partialItem = await iteamModells.findOne({ item: resolvedItem });
    const partial_billing = partialItem ? partialItem.partial_billing : "";

    // Upload files (if any)
    const folderPath = `purchase_orders/${po_number}`;
    const attachmentUrls = [];

    for (const file of req.files || []) {
      const form = new FormData();
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;
      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const respData = response.data;
      const url =
        Array.isArray(respData) && respData.length > 0
          ? respData[0]
          : respData.url ||
            respData.fileUrl ||
            (respData.data && respData.data.url) ||
            null;

      if (url) {
        attachmentUrls.push(url);
      }
    }

    // Create new PO
    const newPO = new purchaseOrderModells({
      p_id,
      offer_Id,
      po_number,
      date,
      item,
      other,
      po_value,
      vendor,
      submitted_By,
      partial_billing,
      po_basic,
      gst,
      pr_id,
      etd,
      attachement_url: attachmentUrls,
    });

    await newPO.save();

    return res.status(200).json({
      message: "Purchase Order has been added successfully!",
      data: newPO,
    });
  } catch (error) {
    console.error("Error creating PO:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
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
      updated_on: new Date().toISOString(), 
      submitted_By: update.submitted_By,
    };
    await pohisttoryModells.create(pohistory);

    res.status(200).json({
      msg: "Project updated successfully",
      data: update, 
    });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
  }
};

//Get-Purchase-Order
const getPO = async function (req, res) {
  try {
    const id = req.params._id;
    let data = await purchaseOrderModells.findById(id).lean();
    if (!data) return res.status(404).json({ message: "PO not found" });

    const isObjectId = mongoose.Types.ObjectId.isValid(data.item);

    if (isObjectId) {
      const material = await materialCategoryModells.findById(data.item).select("name");
      data.item = material?.name || null;
    } 
    res.status(200).json({ msg: "PO Detail", data });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving PO", error: error.message });
  }
};


//get PO History
const getpohistory = async function (req, res) {
  try {
    const data = await pohisttoryModells.find().lean(); 

    const updatedData = await Promise.all(
      data.map(async (entry) => {
        const isObjectId = mongoose.Types.ObjectId.isValid(entry.item);
        if (isObjectId) {
          const material = await materialCategoryModells.findById(entry.item).select("name");
          return {
            ...entry,
            item: material?.name || null,
          };
        } else {
          return {
            ...entry,
            item: entry.item,
          };
        }
      })
    );

    res.status(200).json({ msg: "All PO History", data: updatedData });
  } catch (error) {
    res.status(500).json({ message: "Error fetching PO history", error: error.message });
  }
};


// get-purchase-order-by p_id
const getPOByProjectId = async function (req, res) {
  try {
    const { p_id } = req.body;

    const data = await purchaseOrderModells.find({ p_id }).lean();

    const updatedData = await Promise.all(
      data.map(async (po) => {
        const isObjectId = mongoose.Types.ObjectId.isValid(po.item);
        if (isObjectId) {
          const material = await materialCategoryModells.findById(po.item).select("name");
          return {
            ...po,
            item: material?.name || null,
          };
        } else {
          return {
            ...po,
            item: po.item,
          };
        }
      })
    );

    res.status(200).json({ msg: "All Purchase Orders", data: updatedData });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving POs", error: error.message });
  }
};


//get po history by id
const getPOHistoryById = async function (req, res) {
  try {
    let id = req.params._id;
    let data = await pohisttoryModells.findById(id).lean();

    if (!data) return res.status(404).json({ msg: "PO History not found" });

    const isObjectId = mongoose.Types.ObjectId.isValid(data.item);

    if (isObjectId) {
      const material = await materialCategoryModells.findById(data.item).select("name");
      data.item = material?.name || null;
    } else {
      data.item = data.item;
    }

    res.status(200).json({ msg: "PO History Detail", data });
  } catch (error) {
    res.status(500).json({ msg: "Error fetching data", error: error.message });
  }
};



//get ALLPO
const getallpo = async function (req, res) {
  try {
    let data = await purchaseOrderModells.find().lean();

    const updatedData = await Promise.all(
      data.map(async (po) => {
        const isObjectId = mongoose.Types.ObjectId.isValid(po.item);

        if (isObjectId) {
          const material = await materialCategoryModells.findById(po.item).select("name");
          return { ...po, item: material?.name || null };
        } else {
          return { ...po, item: po.item };
        }
      })
    );

    res.status(200).json({ msg: "All PO", data: updatedData });
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

// //gtpo test
// const getAllPoTest = async (req, res) => {
//   try {
//     // Set up the cursor to stream the data from MongoDB
//     const cursor = purchaseOrderModells.find()
//       .lean()  // Lean queries to speed up the process (returns plain JavaScript objects)
//       .cursor();  // MongoDB cursor to stream data

//     res.setHeader('Content-Type', 'application/json');

//     // Initialize a JSON array to send back in chunks (streamed)
//     res.write('{"data":[');  // Start the JSON array

//     let first = true;
//     cursor.on('data', (doc) => {
//       if (!first) {
//         res.write(',');  // Add comma between records
//       }
//       first = false;
//       res.write(JSON.stringify(doc));  // Write each document as a JSON object
//     });

//     cursor.on('end', () => {
//       res.write(']}');  // Close the JSON array
//       res.end();  // End the response stream
//     });

//     cursor.on('error', (err) => {
//       console.error(err);
//       res.status(500).json({ msg: 'Error retrieving data', error: err.message });
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ msg: 'Error retrieving data', error: err.message });
//   }
// };

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