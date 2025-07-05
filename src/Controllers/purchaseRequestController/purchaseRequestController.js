const mongoose = require("mongoose");
const PurchaseRequest = require("../../Modells/PurchaseRequest/purchaseRequest");
const PurchaseRequestCounter = require("../../Modells/Globals/purchaseRequestCounter");
const Project = require("../../Modells/projectModells"); 
const purchaseOrderModells = require("../../Modells/purchaseOrderModells");

const CreatePurchaseRequest = async (req, res) => {
  try {
    const { purchaseRequestData } = req.body;

    if (!purchaseRequestData || !purchaseRequestData.project_id) {
      return res.status(400).json({ message: "Project ID & Purchase request data are required" });
    }

    const project = await Project.findById(purchaseRequestData.project_id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Increment or create counter for this project
    const counter = await PurchaseRequestCounter.findOneAndUpdate(
      { project_id: purchaseRequestData.project_id },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const counterString = String(counter.count).padStart(4, "0");
    const projectCode = project.code || project.name || "UNKNOWN";

    const prNumber = `PR/${projectCode}/${counterString}`;

    const newPurchaseRequest = new PurchaseRequest({
      ...purchaseRequestData,
      pr_no: prNumber,
      created_by: req.user.userId,
    });

    await newPurchaseRequest.save();

    return res.status(201).json({
      message: "Purchase Request Created Successfully",
      data: newPurchaseRequest,
    });
  } catch (error) {
    console.error("Error Creating Purchase Request:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllPurchaseRequest = async (req, res) => {
  try {
    const { project_id } = req.query;

    let requests = project_id
      ? await PurchaseRequest.find({ project_id })
          .populate("created_by", "_id name")
          .populate("project_id", "_id name code")
          .sort({ createdAt: -1 })
      : await PurchaseRequest.find()
          .populate("created_by", "_id name")
          .populate("project_id", "_id name code")
          .sort({ createdAt: -1 });

    const enrichedRequests = await Promise.all(
      requests.map(async (request) => {
        const pos = await purchaseOrderModells.find({ pr_id: request._id });

        const totalPoValueWithGst = pos.reduce((acc, po) => {
          const poValue = Number(po.po_value || 0);
          const gstValue = Number(po.gst || 0);
          return acc + poValue + gstValue;
        }, 0);

        return {
          ...request.toObject(),
          po_value1: totalPoValueWithGst,
          total_po_count: pos.length,
        };
      })
    );

    res.status(200).json(enrichedRequests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch purchase requests" });
  }
};

const getPurchaseRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Purchase Request ID" });
    }

    const purchaseRequest = await PurchaseRequest.findById(id)
      .populate({
        path: "project_id",
        select: "name code",
      })
      .populate({
        path: "items.item_id",
        select: "name",
      });

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    const purchaseOrders = await purchaseOrderModells.find({ pr_id: id });

    let overallTotalPOValue = 0;
    let overallTotalNumberOfPO = 0;

    const itemToPOsMap = {};

    for (const po of purchaseOrders) {
      const itemId = String(po.item);
      const poValue = Number(po.po_value) || 0;
      const gstValue = Number(po.gst) || 0;
      const totalWithGST = poValue + gstValue;

      if (!itemToPOsMap[itemId]) {
        itemToPOsMap[itemId] = {
          po_numbers: [],
          total_po_with_gst: 0,
        };
      }

      itemToPOsMap[itemId].po_numbers.push(po.po_number);
      itemToPOsMap[itemId].total_po_with_gst += totalWithGST;

      overallTotalPOValue += totalWithGST;
      overallTotalNumberOfPO += 1;
    }

    const itemsWithPOData = purchaseRequest.items.map((item) => {
      const itemId = String(item.item_id?._id);
      const poInfo = itemToPOsMap[itemId] || {
        po_numbers: [],
        total_po_with_gst: 0,
      };
      return {
        ...item.toObject(),
        po_numbers: poInfo.po_numbers,
        total_po_value_with_gst: poInfo.total_po_with_gst,
        total_number_of_po: poInfo.po_numbers.length,
      };
    });

    return res.status(200).json({
      message: "Purchase Request retrieved successfully",
      data: {
        ...purchaseRequest.toObject(),
        items: itemsWithPOData,
        overall_total_po_value_with_gst: overallTotalPOValue,
        overall_total_number_of_po: overallTotalNumberOfPO,
      },
    });
  } catch (error) {
    console.error("Error fetching purchase request by ID:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};



const UpdatePurchaseRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { purchaseRequestData } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Purchase Request ID" });
    }

    const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
      id,
      purchaseRequestData,
      { new: true }
    );

    if (!updatedPurchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    return res.status(200).json({
      message: "Purchase Request updated successfully",
      data: updatedPurchaseRequest,
    });
  } catch (error) {
    console.error("Error updating Purchase Request:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updatePurchaseRequestStatus = async (req, res) => {
  try {
    const { id, item_id } = req.params;
    const { status, remarks } = req.body;

    if (!id || !item_id || !status || !remarks) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const purchaseRequest = await PurchaseRequest.findById(id);
    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request record not found" });
    }
    const item = purchaseRequest.items.find(item => item.item_id.toString() === item_id);
    if (!item) {
      return res.status(404).json({ message: "Item not found in Purchase Request" });
    }

    purchaseRequest.item.status_history.push({
      status,
      remarks,
      user_id: req.user.userId
    });


    await purchaseRequest.save();

    res.status(200).json({
      message: "Purchase Request status updated successfully",
      data: purchaseRequest,
    });
  } catch (error) {
    console.error("Error updating Purchase Request status:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};


const deletePurchaseRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Purchase Request ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Purchase Request ID" });
    }

    const purchaseRequest = await PurchaseRequest.findByIdAndDelete(id);

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    return res.status(200).json({
      message: "Purchase Request deleted successfully",
      data: purchaseRequest,
    });
  } catch (error) {
    console.error("Error deleting Purchase Request:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  CreatePurchaseRequest,
  getAllPurchaseRequest,
  getPurchaseRequestById,
  UpdatePurchaseRequest,
  deletePurchaseRequest,
  updatePurchaseRequestStatus,
};
