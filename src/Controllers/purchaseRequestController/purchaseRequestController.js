const mongoose = require("mongoose");
const PurchaseRequest = require("../../Modells/PurchaseRequest/purchaseRequest");
const PurchaseRequestCounter = require("../../Modells/Globals/purchaseRequestCounter");
const Project = require("../../Modells/projectModells");
const purchaseOrderModells = require("../../Modells/purchaseOrderModells");

const CreatePurchaseRequest = async (req, res) => {
  try {
    const { purchaseRequestData } = req.body;

    if (!purchaseRequestData || !purchaseRequestData.project_id) {
      return res
        .status(400)
        .json({ message: "Project ID & Purchase request data are required" });
    }

    const project = await Project.findById(purchaseRequestData.project_id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const counter = await PurchaseRequestCounter.findOneAndUpdate(
      { project_id: purchaseRequestData.project_id },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const counterString = String(counter.count).padStart(4, "0");
    const projectCode = project.code || project.name || "UNKNOWN";
    const prNumber = `PR/${projectCode}/${counterString}`;

    const submittedStatus = {
      status: "submitted",
      user_id: req.user.userId,
      remarks: "",
    };

    const newPurchaseRequest = new PurchaseRequest({
      ...purchaseRequestData,
      pr_no: prNumber,
      created_by: req.user.userId,
      status_history: [submittedStatus],
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

const getAllPurchaseRequestByProjectId = async (req, res) => {
  try {
    const { project_id } = req.query;

    let requests = await PurchaseRequest.find({ project_id })
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

const getAllPurchaseRequest = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      itemSearch = "",
      poValueSearch = "",
      statusSearch = "",
    } = req.query;
    const skip = (page - 1) * limit;

    const searchRegex = new RegExp(search, "i");
    const itemSearchRegex = new RegExp(itemSearch, "i");
    const poValueSearchNumber = Number(poValueSearch);
    const statusSearchRegex = new RegExp(statusSearch, "i");

    const pipeline = [
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_id",
        },
      },
      { $unwind: { path: "$project_id", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "created_by",
        },
      },
      { $unwind: "$created_by" },
      {
        $unwind: {
          path: "$items",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "materialcategories",
          localField: "items.item_id",
          foreignField: "_id",
          as: "items.item_id",
        },
      },
      {
        $unwind: {
          path: "$items.item_id",
          preserveNullAndEmptyArrays: true,
        },
      },
      // General search on project and PR fields
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { pr_no: searchRegex },
                  { "project_id.code": searchRegex },
                  { "project_id.name": searchRegex },
                ],
              },
            },
          ]
        : []),
      // Item search filter
      ...(itemSearch
        ? [
            {
              $match: {
                "items.item_id.name": itemSearchRegex,
              },
            },
          ]
        : []),
      ...(statusSearch
        ? [
            {
              $match: {
                "current_status.status": statusSearchRegex,
              },
            },
          ]
        : []),
      {
        $group: {
          _id: "$_id",
          pr_no: { $first: "$pr_no" },
          createdAt: { $first: "$createdAt" },
          project_id: { $first: "$project_id" },
          created_by: { $first: "$created_by" },
          items: { $push: "$items" },
          current_status: { $first: "$current_status" },
          status_history: { $first: "$status_history" },
        },
      },

      {
        $project: {
          pr_no: 1,
          current_status: 1,
          status_history: 1,
          createdAt: 1,
          project_id: { _id: 1, name: 1, code: 1 },
          created_by: { _id: 1, name: 1 },
          items: {
            item_id: { _id: 1, name: 1 },
            status_history: 1,
            current_status: 1,
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    ];

    const countPipeline = [...pipeline.slice(0, -3), { $count: "totalCount" }];

    let [requests, countResult] = await Promise.all([
      PurchaseRequest.aggregate(pipeline),
      PurchaseRequest.aggregate(countPipeline),
    ]);

    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    // Enrich with PO Value and count
    requests = await Promise.all(
      requests.map(async (request) => {
        const pos = await purchaseOrderModells.find({ pr_id: request._id });

        const totalPoValueWithGst = pos.reduce((acc, po) => {
          const poValue = Number(po.po_value || 0);
          const gstValue = Number(po.gst || 0);
          return acc + poValue + gstValue;
        }, 0);

        return {
          ...request,
          po_value: totalPoValueWithGst,
          total_po_count: pos.length,
        };
      })
    );

    // Apply PO Value Search
    if (poValueSearch) {
      requests = requests.filter(
        (r) => Number(r.po_value) === poValueSearchNumber
      );
    }

    res.status(200).json({
      totalCount: poValueSearch ? requests.length : totalCount,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      data: requests,
    });
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

const getPurchaseRequest = async (req, res) => {
  try {
    const { project_id, item_id } = req.params;

    if (!project_id) {
      return res.status(400).json({
        message: "Project ID is required",
      });
    }

    // Fetch purchase request with project and item details populated
    const purchaseRequest = await PurchaseRequest.findOne({
      project_id,
      "items.item_id": item_id,
    })
      .populate("project_id", "name code")
      .populate("items.item_id", "name");

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    // Find the particular item
    const particularItem = purchaseRequest.items.find(
      (itm) => String(itm.item_id?._id || itm.item_id) === String(item_id)
    );

    if (!particularItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Find all Purchase Orders where this item_id is present
    const purchaseOrders = await purchaseOrderModells.find({
      item: item_id,
    });

    // Prepare PO details with _id, po_number and total value including GST
    const poDetails = purchaseOrders.map((po) => {
      const poValue = Number(po.po_value || 0);
      const gstValue = Number(po.gst || 0);
      return {
        _id: po._id,
        po_number: po.po_number,
        total_value_with_gst: poValue + gstValue,
      };
    });

    // Calculate overall totals
    const overall = {
      total_po_count: poDetails.length,
      total_value_with_gst: poDetails.reduce(
        (acc, po) => acc + Number(po.total_value_with_gst || 0),
        0
      ),
    };

    // Prepare the full response
    return res.status(200).json({
      purchase_request: {
        _id: purchaseRequest._id,
        pr_no: purchaseRequest.pr_no,
        current_status: purchaseRequest.current_status,
        status_history: purchaseRequest.status_history,
        createdAt: purchaseRequest.createdAt,
        project: {
          _id: purchaseRequest.project_id?._id,
          name: purchaseRequest.project_id?.name,
          code: purchaseRequest.project_id?.code,
        },
        etd: purchaseRequest.etd,
        delivery_date: purchaseRequest.delivery_date,
      },
      item: {
        ...particularItem.toObject(),
        item_id: {
          _id: particularItem.item_id?._id,
          name: particularItem.item_id?.name,
        },
      },
      po_details: poDetails,
      overall,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
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
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!id || !status || !remarks) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const purchaseRequest = await PurchaseRequest.findById(id);
    if (!purchaseRequest) {
      return res
        .status(404)
        .json({ message: "Purchase Request record not found" });
    }

    purchaseRequest.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
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
      return res
        .status(400)
        .json({ message: "Purchase Request ID is required" });
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
  getAllPurchaseRequestByProjectId,
  getPurchaseRequest,
};
