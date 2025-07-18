const mongoose = require("mongoose");
const PurchaseRequest = require("../../Modells/PurchaseRequest/purchaseRequest");
const PurchaseRequestCounter = require("../../Modells/Globals/purchaseRequestCounter");
const Project = require("../../Modells/projectModells");
const purchaseOrderModells = require("../../Modells/purchaseOrderModells");
const purchaseRequest = require("../../Modells/PurchaseRequest/purchaseRequest");
const materialCategoryModells = require("../../Modells/EngineeringModells/materials/materialCategoryModells");

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
    res
      .status(500)
      .json({
        error: "Failed to fetch purchase requests",
        error: error.message,
      });
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
      createdFrom = "",
      createdTo = "",
      etdFrom = "",
      etdTo = "",
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
          as: "item_data",
        },
      },
      {
        $unwind: {
          path: "$item_data",
          preserveNullAndEmptyArrays: true,
        },
      },
      
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
     
      ...(itemSearch
        ? [
            {
              $match: {
                "item_data.name": itemSearchRegex,
              },
            },
          ]
        : []),
      ...(statusSearch
        ? [
            {
              $match: {
                "items.status": statusSearchRegex,
              },
            },
          ]
        : []),
      ...(createdFrom && createdTo
        ? [
            {
              $match: {
                createdAt: {
                  $gte: new Date(createdFrom),
                  $lte: new Date(createdTo),
                },
              },
            },
          ]
        : []),
      {
        $project: {
          _id: 1,
          pr_no: 1,
          createdAt: 1,
          project_id: { _id: 1, name: 1, code: 1 },
          created_by: { _id: 1, name: 1 },
          item: {
            _id: "$items._id",
            status: "$items.status",
            other_item_name: "$items.other_item_name",
            amount: "$items.amount",
            item_id: {
              _id: "$item_data._id",
              name: "$item_data.name",
            },
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

    let totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    // Attach PO details for each request
    requests = await Promise.all(
      requests.map(async (request) => {
        const pos = await purchaseOrderModells.find({ pr_id: request._id });

        const prItemIdStr = request.item?.item_id?._id?.toString?.();
        const prItemName = request.item?.item_id?.name;

        const filteredPOs = pos.filter((po) => {
          const poItemStr = po?.item?.toString?.();
          return poItemStr === prItemIdStr || po.item === prItemName;
        });

        const poDetails = filteredPOs.map((po) => ({
          po_number: po.po_number,
          po_value: Number(po.po_value || 0),
          etd: po.etd ? new Date(po.etd) : null,
        }));

        const totalPoValueWithGst = poDetails.reduce(
          (acc, po) => acc + po.po_value,
          0
        );

        return {
          ...request,
          po_value: totalPoValueWithGst,
          po_numbers: poDetails.map((p) => p.po_number),
          po_details: poDetails,
        };
      })
    );

    // Filter by PO value
    if (poValueSearch) {
      requests = requests.filter(
        (r) => Number(r.po_value) === poValueSearchNumber
      );
    }

    // Filter by ETD date range
    if (etdFrom && etdTo) {
      const etdStart = new Date(etdFrom);
      const etdEnd = new Date(etdTo);
      requests = requests.filter((r) =>
        r.po_details.some((po) => {
          if (!po.etd) return false;
          const etdDate = new Date(po.etd);
          return etdDate >= etdStart && etdDate <= etdEnd;
        })
      );
    }

    // Update total count if filtered
    if (poValueSearch || (etdFrom && etdTo)) {
      totalCount = requests.length;
    }

    res.status(200).json({
      totalCount,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      data: requests,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
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
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getPurchaseRequest = async (req, res) => {
  try {
    const { project_id, item_id, pr_id } = req.params;

    if (!project_id || !pr_id) {
      return res.status(400).json({
        message: "Project ID and Purchase Request ID are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(pr_id)) {
      return res.status(400).json({
        message: "Invalid Purchase Request ID",
      });
    }

    let purchaseRequest = await PurchaseRequest.findOne({
      _id: pr_id,
      project_id,
      $or: [{ "items.item_id": item_id }, { "items.item_name": item_id }],
    })
      .populate("project_id", "name code")
      .populate("items.item_id", "name");

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    const particularItem = purchaseRequest.items.find((itm) => {
      const matchById = String(itm.item_id?._id) === String(item_id);
      const matchByName =
        String(itm.item_id?.name || "").toLowerCase() ===
        String(item_id).toLowerCase();
      return matchById || matchByName;
    });

    if (!particularItem) {
      return res
        .status(404)
        .json({ message: "Item not found in Purchase Request" });
    }

    const itemIdString = String(
      particularItem.item_id?._id || particularItem.item_id
    );
    const itemName = particularItem.item_id?.name;

    const poQuery = {
      p_id: purchaseRequest.project_id?.code,
      $or: [{ item: itemIdString }, ...(itemName ? [{ item: itemName }] : [])],
      pr_id: pr_id,
    };

    const purchaseOrders = await purchaseOrderModells.find(poQuery);

    const poDetails = purchaseOrders.map((po) => ({
      _id: po._id,
      po_number: po.po_number,
      total_value_with_gst: Number(po.po_value || 0),
    }));

    const overall = {
      total_po_count: poDetails.length,
      total_value_with_gst: poDetails.reduce(
        (acc, po) => acc + Number(po.total_value_with_gst || 0),
        0
      ),
    };

    return res.status(200).json({
      purchase_request: {
        _id: purchaseRequest._id,
        pr_no: purchaseRequest.pr_no,
        createdAt: purchaseRequest.createdAt,
        project: {
          _id: purchaseRequest.project_id?._id,
          name: purchaseRequest.project_id?.name,
          code: purchaseRequest.project_id?.code,
        },
      },
      item: {
        ...particularItem.toObject(),
        item_id: {
          _id: particularItem.item_id?._id,
          name: particularItem.item_id?.name,
        },
        current_status: particularItem?.current_status,
        status_history: particularItem?.status_history,
        etd: particularItem?.etd,
        delivery_date: particularItem?.delivery_date,
        dispatch_date: particularItem?.dispatch_date,
      },
      po_details: poDetails,
      overall,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
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
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
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
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getMaterialScope = async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(404).json({
        message: "Project Id Not Found",
      });
    }

    // 1. Find PR items for this project
    const prItems = await PurchaseRequest.aggregate([
      {
        $match: {
          project_id: new mongoose.Types.ObjectId(project_id),
        },
      },
      {
        $unwind: "$items",
      },
      {
        $lookup: {
          from: "materialcategories",
          localField: "items.item_id",
          foreignField: "_id",
          as: "material_info",
        },
      },
      {
        $unwind: {
          path: "$material_info",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          pr_id: "$_id",
          pr_no: 1,
          item_id: "$items.item_id",
          scope: "$items.scope",
          status: "$items.status",
          material_name: "$material_info.name",
          material_description: "$material_info.description",
        },
      },
    ]);

    const usedItemIds = prItems
      .filter((item) => item.item_id)
      .map((item) => item.item_id.toString());

    const unusedMaterials = await materialCategoryModells
      .find({
        _id: { $nin: usedItemIds },
      })
      .lean();

    const unusedFormatted = unusedMaterials.map((mat) => ({
      pr_id: "N/A",
      pr_no: "N/A",
      item_id: mat._id,
      scope: "client",
      status: "N/A",
      material_name: mat.name,
      material_description: mat.description,
    }));

    // 3. Combine and send
    const combined = [...prItems, ...unusedFormatted];

    return res.status(200).json({
      message: "Material Scope Fetched Successfully",
      data: combined,
    });
  } catch (error) {
    console.error("Error fetching material scope:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  CreatePurchaseRequest,
  getAllPurchaseRequest,
  getPurchaseRequestById,
  UpdatePurchaseRequest,
  deletePurchaseRequest,
  getAllPurchaseRequestByProjectId,
  getPurchaseRequest,
  getMaterialScope,
};
