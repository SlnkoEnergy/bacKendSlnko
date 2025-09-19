const mongoose = require("mongoose");
const PurchaseRequest = require("../models/purchaserequest.model");
const PurchaseRequestCounter = require("../models/purchaserequestcounter.model");
const Project = require("../models/project.model");
const purchaseOrderModells = require("../models/purchaseorder.model");
const materialCategoryModells = require("../models/materialcategory.model");
const modulecategory = require("../models/modulecategory.model");
const scopeModel = require("../models/scope.model");
const axios = require("axios");
const XLSX = require("xlsx");
const userModells = require("../models/user.model");
const { getnovuNotification } = require("../utils/nouvnotification.utils");

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

    const itemIds = purchaseRequestData.items.map((item) => item.item_id);

    await scopeModel.updateOne(
      { project_id: purchaseRequestData.project_id },
      { $set: { "items.$[elem].pr_status": true } },
      { arrayFilters: [{ "elem.item_id": { $in: itemIds } }] }
    );

    // Notification to SCM  on  Purchase Request Create

    const sendBy_id = req.user.userId;
    const sendBy_Name = await userModells.findById(sendBy_id);

    try {
      const workflow = 'purchase-order';
      let senders = [];



      senders = await userModells.find({
        $or: [
          {
            department: "Projects",
            role: "visitor"
          },

          { department: "SCM" }
        ]

      }).select('_id').lean().then(users => users.map(u => u._id));

      const data = {
        Module: project.name,
        sendBy_Name: sendBy_Name.name,
        message: `A Purchase Order has been created for Project ID ${project.name}. Kindly review the details and proceed with the necessary actions.`,
        link: `/add_po?mode=edit&_id`
      }

      setImmediate(() => {
        getnovuNotification(workflow, senders, data).catch(err =>
          console.error("Notification error:", err)
        );
      });

    } catch (error) {
      console.log(error);
    }
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
    res.status(500).json({
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
      open_pr = false,
    } = req.query;

    const useOpenPR = open_pr === "true" || open_pr === true;
    const numericLimit = Number(limit) || 10;
    const numericPage = Number(page) || 1;
    const skip = (numericPage - 1) * numericLimit;

    const searchRegex = search ? new RegExp(search, "i") : null;
    const itemSearchRegex = itemSearch ? new RegExp(itemSearch, "i") : null;
    const statusSearchRegex = statusSearch ? new RegExp(statusSearch, "i") : null;
    const poValueSearchNumber = poValueSearch !== "" ? Number(poValueSearch) : null;

    // Resolve the backing collection name from the Mongoose model if available
    let PO_COLLECTION = "purchaseorders";
    try {
      if (mongoose.modelNames().includes("PurchaseOrder")) {
        PO_COLLECTION = mongoose.model("PurchaseOrder").collection.name || "purchaseorders";
      }
    } catch {
      // fallback to default
    }

    // Normalize created date range
    const createdFromDate = createdFrom ? new Date(createdFrom) : null;
    const createdToDate = createdTo ? new Date(createdTo) : null;
    if (createdToDate) createdToDate.setHours(23, 59, 59, 999);

    // ---------- Base: join project, user, item/category; apply simple filters ----------
    const baseStages = [
      // Project
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project_id",
        },
      },
      { $unwind: { path: "$project_id", preserveNullAndEmptyArrays: true } },

      // Created by user
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "created_by",
        },
      },
      { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },

      // Items & item category
      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "materialcategories",
          localField: "items.item_id",
          foreignField: "_id",
          as: "item_data",
        },
      },
      { $unwind: { path: "$item_data", preserveNullAndEmptyArrays: true } },

      // Text filters
      ...(searchRegex
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

      ...(itemSearchRegex ? [{ $match: { "item_data.name": itemSearchRegex } }] : []),

      ...(statusSearchRegex ? [{ $match: { "items.status": statusSearchRegex } }] : []),

      ...(createdFromDate && createdToDate
        ? [
          {
            $match: {
              createdAt: {
                $gte: createdFromDate,
                $lte: createdToDate,
              },
            },
          },
        ]
        : []),

      // Shape back to one doc per PR (fix projections to use field paths, not literals)
      {
        $project: {
          _id: 1,
          pr_no: 1,
          createdAt: 1,
          project_id: {
            _id: "$project_id._id",
            name: "$project_id.name",
            code: "$project_id.code",
          },
          created_by: {
            _id: "$created_by._id",
            name: "$created_by.name",
          },
          item: {
            _id: "$items._id",
            status: "$items.status",
            // Your schema does not have other_item_name or amount on items; remove to avoid null noise
            // other_item_name: "$items.other_item_name",
            // amount: "$items.amount",
            item_id: { _id: "$item_data._id", name: "$item_data.name" },
            product_data: "$items.product_name",
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          pr_no: { $first: "$pr_no" },
          createdAt: { $first: "$createdAt" },
          project_id: { $first: "$project_id" },
          created_by: { $first: "$created_by" },
          items: { $push: "$item" },
        },
      },
      {
        $project: {
          pr_no: 1,
          createdAt: 1,
          project_id: 1,
          created_by: 1,
          items: {
            $filter: {
              input: "$items",
              as: "it",
              cond: {
                $and: [{ $ne: ["$$it", null] }, { $ne: ["$$it._id", null] }],
              },
            },
          },
        },
      },

      // ---------- Lookup POs for each PR and compute fields in-pipeline ----------
      {
        $lookup: {
          from: PO_COLLECTION,
          let: { prId: "$_id" },
          pipeline: [
            // IMPORTANT: your schema stores PR ref as pr.pr_id
            { $match: { $expr: { $eq: ["$pr.pr_id", "$$prId"] } } },
            {
              $project: {
                po_number: 1,
                // If some legacy rows store strings, coerce safely
                po_value: {
                  $let: {
                    vars: { v: { $ifNull: ["$po_value", 0] } },
                    in: {
                      $cond: [
                        { $eq: [{ $type: "$$v" }, "string"] },
                        {
                          $convert: {
                            input: {
                              $replaceAll: { input: "$$v", find: ",", replacement: "" },
                            },
                            to: "double",
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        "$$v",
                      ],
                    },
                  },
                },
                etd: 1,
              },
            },
          ],
          as: "pos",
        },
      },

      // Aggregate PO fields
      {
        $addFields: {
          validPos: {
            $filter: {
              input: "$pos",
              as: "p",
              cond: {
                $and: [
                  { $ne: ["$$p.po_number", null] },
                  { $ne: ["$$p.po_number", ""] },
                ],
              },
            },
          },
          po_numbers: { $map: { input: "$pos", as: "p", in: "$$p.po_number" } },
          po_details: {
            $map: {
              input: "$pos",
              as: "p",
              in: {
                po_number: "$$p.po_number",
                po_value: "$$p.po_value",
                etd: "$$p.etd",
              },
            },
          },
          po_value: {
            $sum: {
              $map: {
                input: "$pos",
                as: "p",
                in: "$$p.po_value",
              },
            },
          },
        },
      },

      // ---------- Open PR filter (before pagination) ----------
      ...(useOpenPR ? [{ $match: { $expr: { $eq: [{ $size: "$validPos" }, 0] } } }] : []),

      // ---------- PO-value filter (before pagination) ----------
      ...(poValueSearchNumber !== null ? [{ $match: { po_value: poValueSearchNumber } }] : []),

      // ---------- ETD range filter (any PO with etd in range) ----------
      ...(etdFrom && etdTo
        ? [
          {
            $match: {
              $expr: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$pos",
                        as: "p",
                        cond: {
                          $and: [
                            { $ne: ["$$p.etd", null] },
                            { $gte: ["$$p.etd", new Date(etdFrom)] },
                            { $lte: ["$$p.etd", new Date(etdTo)] },
                          ],
                        },
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
        ]
        : []),

      { $sort: { createdAt: -1 } },
    ];

    // Count pipeline = same filters, but end with $count
    const countPipeline = [...baseStages, { $count: "totalCount" }];

    // Paged pipeline = same filters, then skip/limit
    const pagePipeline = [...baseStages, { $skip: skip }, { $limit: numericLimit }];

    const [pagedRows, countRows] = await Promise.all([
      PurchaseRequest.aggregate(pagePipeline),
      PurchaseRequest.aggregate(countPipeline),
    ]);

    const totalCount = countRows?.[0]?.totalCount || 0;

    return res.status(200).json({
      totalCount,
      currentPage: numericPage,
      totalPages: Math.ceil(totalCount / numericLimit) || 1,
      data: pagedRows,
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
        select: "name code site_address p_id",
      })
      .populate({
        path: "created_by",
        select: "_id name",
      })
      .populate({
        path: "items.item_id",
        select: "name",
      });

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    const purchaseOrders = await purchaseOrderModells.find({ "pr.pr_id": id });

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

    const purchaseRequest = await PurchaseRequest.findById(id);

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase Request not found" });
    }

    const itemIds = (purchaseRequest.items || []).map((item) => item.item_id);

    if (itemIds.length > 0) {
      await scopeModel.updateOne(
        { project_id: purchaseRequest.project_id },
        { $set: { "items.$[elem].pr_status": false } },
        { arrayFilters: [{ "elem.item_id": { $in: itemIds } }] }
      );
    }

    await PurchaseRequest.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Purchase Request deleted successfully",
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

async function fetchExcelFromBOQ(req, res) {
  try {
    const {
      project_id,
      template_name,
      category,
      category_column,
      sheet,
      category_mode,
      category_logic,
    } = req.query;

    if (!project_id || !mongoose.isValidObjectId(project_id)) {
      return res.status(400).json({ message: "Valid project_id is required" });
    }

    // ---- helpers -----------------------------------------------------------
    const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

    const splitList = (val) =>
      Array.isArray(val)
        ? val
        : typeof val === "string"
          ? val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
          : [];

    // tokenize a cell by common separators: "/", ",", "&" (with spaces)
    const tokenizeCell = (cell) =>
      String(cell)
        .split(/\s*[\/|,]\s*|\s+&\s+/)
        .map(norm)
        .filter(Boolean);

    // case-insensitive column accessor: "Category" === "category"
    const getCell = (row, key) => {
      if (row == null) return "";
      if (key in row) return row[key];
      const want = norm(key);
      const foundKey = Object.keys(row).find((k) => norm(k) === want);
      return foundKey ? row[foundKey] : "";
    };

    // ---- category synonyms -------------------------------------------------
    // Canonical → aliases (all compared in normalized form)
    const EXPAND = {
      rms: ["rms", "wms"],
      "lt panel": ["acdb"],
      "ht panel": ["vcb"],
      "earthing & la": ["earthing", "la"],
      "meter box": ["ldb"],
      "class c": ["bos"],
      gss: ["pss end", "bay end ext.", "bay end ext"],
      "i&c": ["i&c", "cleaning", "civil"],
    };

    // alias → canonical (normalized)
    const REVERSE_EXPAND = (() => {
      const m = {};
      for (const [canon, alts] of Object.entries(EXPAND)) {
        const c = norm(canon);
        m[c] = canon; // identity
        (alts || []).forEach((a) => {
          m[norm(a)] = canon;
        });
      }
      return m;
    })();

    const CANON_DISPLAY = {
      "class c": "Class C",
      "lt panel": "LT Panel",
      "ht panel": "HT Panel",
      "earthing & la": "Earthing & LA",
      "meter box": "Meter Box",
      gss: "GSS",
      "i&c": "I&C",
      rms: "RMS",
    };

    const buildGroups = (inputs) =>
      inputs.map((c) => {
        const key = norm(c);
        const alts = EXPAND[key];
        return (alts ? alts : [key]).map(norm);
      });

    const doc = await modulecategory
      .findOne({ project_id })
      .populate({ path: "items.template_id", select: "name boq" })
      .lean();

    if (!doc) {
      return res
        .status(404)
        .json({ message: "moduleCategory not found for given project_id" });
    }

    const items = Array.isArray(doc.items) ? doc.items : [];
    if (!items.length) {
      return res
        .status(404)
        .json({ message: "No items available for this project" });
    }

    let boqItem = items.find((it) => {
      const tname = it?.template_id?.name;
      const n = norm(tname);
      return n.includes("boq") || n.includes("excel");
    });

    if (!boqItem) {
      return res.status(404).json({
        message:
          "Could not find a BOQ Excel item (no template name containing 'boq'/'excel').",
      });
    }

    const currentList = Array.isArray(boqItem.current_attachment)
      ? boqItem.current_attachment
      : [];
    const fileUrl = currentList.filter(Boolean).at(-1);

    if (!fileUrl) {
      return res.status(404).json({
        message: "No current_attachment URL found for the matched BOQ item.",
        hint: "Ensure current_attachment is an array of file URLs and at least one exists.",
      });
    }

    const excelResp = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const wb = XLSX.read(excelResp.data, { type: "buffer" });
    if (!wb.SheetNames.length) {
      return res.status(400).json({ message: "Workbook has no sheets." });
    }
    let targetSheetName;
    if (sheet !== undefined) {
      const asNum = Number(sheet);
      if (!Number.isNaN(asNum)) {
        if (asNum < 0 || asNum >= wb.SheetNames.length) {
          return res.status(400).json({
            message: `Sheet index ${asNum} out of range.`,
            available_sheets: wb.SheetNames,
          });
        }
        targetSheetName = wb.SheetNames[asNum];
      } else {
        if (!wb.SheetNames.includes(sheet)) {
          return res.status(400).json({
            message: `Sheet "${sheet}" not found.`,
            available_sheets: wb.SheetNames,
          });
        }
        targetSheetName = sheet;
      }
    } else {
      targetSheetName = wb.SheetNames[0];
    }

    const ws = wb.Sheets[targetSheetName];
    if (!ws) {
      return res.status(404).json({ message: "Target worksheet not found." });
    }

    const allRows = XLSX.utils.sheet_to_json(ws, {
      defval: "",
      raw: true,
      range: 2,
    });

    const col = category_column || "Category";
    const selectedInputs = splitList(category);
    const groups = buildGroups(selectedInputs);

    const matchMode = (category_mode || "exact").toLowerCase();
    const logic = (category_logic || "or").toLowerCase();

    let rows = allRows;
    if (groups.length > 0) {
      rows = allRows.filter((r) => {
        const cellRaw = getCell(r, col) ?? "";

        if (matchMode === "contains") {
          const cellNorm = norm(String(cellRaw));
          const groupOk = groups.map((alts) =>
            alts.some((a) => cellNorm.includes(a))
          );
          return logic === "and"
            ? groupOk.every(Boolean)
            : groupOk.some(Boolean);
        }
        const tokens = tokenizeCell(cellRaw);
        const groupOk = groups.map((alts) =>
          alts.some((a) => tokens.includes(a))
        );
        return logic === "and" ? groupOk.every(Boolean) : groupOk.some(Boolean);
      });
    }

    rows = rows.map((r) => {
      const raw = getCell(r, col) ?? "";
      const tokens = tokenizeCell(raw);
      let canon = null;
      for (const t of tokens) {
        const c = REVERSE_EXPAND[norm(t)];
        if (c) {
          canon = c;
          break;
        }
      }
      if (!canon && matchMode === "contains") {
        const cellNorm = norm(String(raw));
        for (const [aliasNorm, canonical] of Object.entries(REVERSE_EXPAND)) {
          if (cellNorm.includes(aliasNorm)) {
            canon = canonical;
            break;
          }
        }
      }
      const display = canon ? CANON_DISPLAY[norm(canon)] || canon : raw;

      return {
        ...r,
        Category: display,
      };
    });

    return res.status(200).json({
      message: "BOQ Excel parsed successfully",
      meta: {
        project_id,
        template_id: boqItem?.template_id?._id || null,
        template_name: boqItem?.template_id?.name || null,
        boq_enabled: !!boqItem?.template_id?.boq?.enabled,
        sheet: targetSheetName,
        header_from_row: "A3",
        total_rows: allRows.length,
        filtered_rows: rows.length,
        available_sheets: wb.SheetNames,
        filter: {
          column: col,
          user_selected: selectedInputs,
          expanded_groups: groups,
          mode: matchMode,
          logic,
        },
        source_url_host: (() => {
          try {
            return new URL(fileUrl).host;
          } catch {
            return null;
          }
        })(),
      },
      data: rows,
    });
  } catch (error) {
    console.error(
      "fetchExcelFromBOQ error:",
      error?.response?.data || error?.message || error
    );
    return res.status(500).json({
      message: "Failed to fetch/parse BOQ Excel",
      error: error?.message || "Unknown error",
    });
  }
}

module.exports = {
  CreatePurchaseRequest,
  getAllPurchaseRequest,
  getPurchaseRequestById,
  UpdatePurchaseRequest,
  deletePurchaseRequest,
  getAllPurchaseRequestByProjectId,
  getPurchaseRequest,
  getMaterialScope,
  fetchExcelFromBOQ,
};