const scopeModel = require("../models/scope.model");
const MaterialCategory = require("../models/materialcategory.model");
const projectModells = require("../models/project.model");
const { default: axios } = require("axios");
const { default: mongoose } = require("mongoose");
const materialcategoryModel = require("../models/materialcategory.model");
const purchaseorderModel = require("../models/purchaseorder.model");
const handoverModel = require("../models/handoversheet.model");
const { Parser } = require("json2csv");

const createScope = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ message: "Data is required" });
    }
    const scope = new scopeModel({
      ...data,
      createdBy: req.user.userId,
    });
    await scope.save();
    return res
      .status(201)
      .json({ message: "Scope created successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getScopeById = async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id || !mongoose.isValidObjectId(project_id)) {
      return res.status(400).json({ message: "Valid project_id is required" });
    }

    // 1) Project code
    const project = await projectModells
      .findById(project_id)
      .select("_id code");
    if (!project) return res.status(404).json({ message: "Project not found" });

    const projectCode = String(project.code || "").trim();
    if (!projectCode) {
      return res
        .status(400)
        .json({ message: "Project code is missing on this project" });
    }

    // 2) Scope (as-is)
    const scope = await scopeModel
      .findOne({ project_id })
      .populate("current_status.user_id", "_id name")
      .populate("status_history.user_id", "_id name")
      .populate("createdBy", "_id name")
      .populate(
        "items.commitment_date_history.user_id",
        "_id name attachment_url"
      )
      .populate(
        "items.current_commitment_date.user_id",
        "_id name attachment_url"
      );

    if (!scope) return res.status(404).json({ message: "Scope not found" });

    // 3) All POs for this project (by project code in p_id)
    const pos = await purchaseorderModel
      .find({ p_id: projectCode })
      .select(
        "_id po_number date etd delivery_date current_status item createdAt"
      )
      .lean();

    // Helpers
    const getPoCreatedAt = (po) => {
      // Prefer createdAt; fallback to ObjectId time
      if (po?.createdAt) return new Date(po.createdAt).getTime();
      try {
        return new mongoose.Types.ObjectId(po._id).getTimestamp().getTime();
      } catch {
        return 0;
      }
    };

    // 4) Build: categoryId -> [po, po, ...]
    const categoryToPoList = new Map();

    for (const po of pos) {
      const items = Array.isArray(po.item) ? po.item : [];
      for (const poIt of items) {
        const catId = poIt?.category ? String(poIt.category) : null;
        if (!catId) continue;

        if (!categoryToPoList.has(catId)) categoryToPoList.set(catId, []);
        categoryToPoList.get(catId).push(po);
      }
    }

    // Sort each list by newest first
    for (const [catId, list] of categoryToPoList.entries()) {
      list.sort((a, b) => getPoCreatedAt(b) - getPoCreatedAt(a));
      categoryToPoList.set(catId, list);
    }

    // 5) Enrich items with multiple POs
    const safeItems = (scope.items || []).map((raw) =>
      typeof raw?.toObject === "function" ? raw.toObject() : raw
    );

    const enrichedItems = safeItems.map((it) => {
      const itemIdStr = it?.item_id ? String(it.item_id) : null;

      if (!itemIdStr) {
        return {
          ...it,
          po_exists: false,
          has_po_created: false,
          pos: [], // no POs
        };
      }

      const list = categoryToPoList.get(itemIdStr) || [];

      // Simplify POs for payload
      const simplified = list.map((p) => ({
        po_number: p?.po_number ?? null,
        status: p?.current_status?.status ?? null,
        po_date: p?.date ?? null,
        etd: p?.etd ?? null,
        delivered_date: p?.delivery_date ?? null,
      }));

      const has_po_created = list.some(
        (p) => p?.current_status?.status === "po_created"
      );

      return {
        ...it,
        po_exists: simplified.length > 0,
        has_po_created,
        pos: simplified,
      };
    });

    return res.status(200).json({
      message: "Scope and material details retrieved successfully",
      data: {
        ...scope.toObject(),
        items: enrichedItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllScopes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      project_id,
      state,
      cam_person,
      po_status,
      etd_from,
      etd_to,
      delivered_from,
      delivered_to,
      item_name,
      scope,
      po_date_from,
      po_date_to,
      project_status,
      current_commitment_date_from,
      current_commitment_date_to,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const matchStage = {};

    if (search && String(search).trim()) {
      const regex = new RegExp(String(search).trim(), "i");
      matchStage.$or = [
        { "project.name": regex },
        { "project.code": regex },
        { "items.name": regex },
      ];
    }

    // Project filter
    if (project_id && mongoose.isValidObjectId(project_id)) {
      matchStage["project._id"] = new mongoose.Types.ObjectId(project_id);
    }

    // State filter
    if (state) {
      matchStage["project.state"] = new RegExp(`^${state}$`, "i");
    }

    // Project status filter (NEW)
    if (project_status) {
      matchStage["project.current_status.status"] = new RegExp(
        `^${project_status}$`,
        "i"
      );
    }

    // CAM person filter
    if (cam_person && mongoose.isValidObjectId(cam_person)) {
      matchStage["hs.submitted_by"] = new mongoose.Types.ObjectId(cam_person);
    }

    // PO Status filter
    if (po_status) {
      if (po_status.toLowerCase() === "pending") {
        matchStage["matchedPOs.po_number"] = { $exists: false };
      } else {
        matchStage["matchedPOs.current_status.status"] = new RegExp(
          `^${po_status}$`,
          "i"
        );
      }
    }

    // Item filter (you said item_name is actually item_id)
    if (item_name && mongoose.isValidObjectId(String(item_name).trim())) {
      matchStage["items.item_id"] = new mongoose.Types.ObjectId(
        String(item_name).trim()
      );
    }

    // Scope filter
    if (scope && String(scope).trim()) {
      matchStage["items.scope"] = new RegExp(String(scope).trim(), "i");
    }

    if (current_commitment_date_from || current_commitment_date_to) {
      const range = {};
      if (current_commitment_date_from) {
        range.$gte = new Date(current_commitment_date_from);
      }
      if (current_commitment_date_to) {
        const end = new Date(current_commitment_date_to);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }

      matchStage["items.current_commitment_date.date"] = range;
    }

    // ETD date range
    if (etd_from || etd_to) {
      matchStage["matchedPOs.etd"] = {};
      if (etd_from) matchStage["matchedPOs.etd"].$gte = new Date(etd_from);
      if (etd_to) {
        const end = new Date(etd_to);
        end.setHours(23, 59, 59, 999);
        matchStage["matchedPOs.etd"].$lte = end;
      }
    }

    // Delivered date range
    if (delivered_from || delivered_to) {
      matchStage["matchedPOs.delivery_date"] = {};
      if (delivered_from)
        matchStage["matchedPOs.delivery_date"].$gte = new Date(delivered_from);
      if (delivered_to) {
        const end = new Date(delivered_to);
        end.setHours(23, 59, 59, 999);
        matchStage["matchedPOs.delivery_date"].$lte = end;
      }
    }

    // PO Date range
    if (po_date_from || po_date_to) {
      matchStage["matchedPOs.date"] = {};
      if (po_date_from)
        matchStage["matchedPOs.date"].$gte = new Date(po_date_from);
      if (po_date_to) {
        const end = new Date(po_date_to);
        end.setHours(23, 59, 59, 999);
        matchStage["matchedPOs.date"].$lte = end;
      }
    }

    const pipelineBase = [
      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "handoversheets",
          let: { pid: "$project.p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pid"] } } },
            {
              $project: {
                _id: 1,
                project_kwp: "$project_detail.project_kwp",
                dc_capacity: "$project_detail.proposed_dc_capacity",
                cam_member_name: "$other_details.cam_member_name",
                submitted_by: 1,
              },
            },
          ],
          as: "hs",
        },
      },
      { $addFields: { hs: { $arrayElemAt: ["$hs", 0] } } },

      {
        $lookup: {
          from: "users",
          localField: "hs.submitted_by",
          foreignField: "_id",
          as: "hs_submitted_by_user",
        },
      },
      {
        $addFields: {
          hs_submitted_by_user: { $arrayElemAt: ["$hs_submitted_by_user", 0] },
        },
      },

      {
        $lookup: {
          from: "purchaseorders",
          let: { pcode: "$project.code" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pcode"] } } },
            {
              $project: {
                _id: 1,
                po_number: 1,
                date: 1,
                etd: 1,
                delivery_date: 1,
                "current_status.status": 1,
                item: 1,
              },
            },
          ],
          as: "posForProject",
        },
      },

      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },

      {
        $addFields: {
          matchedPOs: {
            $filter: {
              input: "$posForProject",
              as: "po",
              cond: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ["$$po.item", []] },
                        as: "poi",
                        cond: { $eq: ["$$poi.category", "$items.item_id"] },
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
      { $unwind: { path: "$matchedPOs", preserveNullAndEmptyArrays: true } },

      // Apply dynamic filters
      { $match: matchStage },

      {
        $project: {
          _id: 1,
          project_id: "$project.code",
          project_name: "$project.name",
          project_group: "$project.p_group",
          state: "$project.state",
          project_status: "$project.current_status.status",
          project_id_full: "$project._id",
          kwp: { $ifNull: ["$hs.project_kwp", "$project.project_kwp"] },
          dc: { $ifNull: ["$hs.dc_capacity", "$project.dc_capacity"] },
          cam_person: {
            $ifNull: ["$hs.cam_member_name", "$hs_submitted_by_user.name"],
          },
          item_name: "$items.name",
          item_id: "$items.item_id",
          scope: "$items.scope",
          commitment_date: "$items.current_commitment_date.date",
          po_number: { $ifNull: ["$matchedPOs.po_number", "Pending"] },
          po_status: { $ifNull: ["$matchedPOs.current_status.status", ""] },
          po_date: { $ifNull: ["$matchedPOs.date", null] },
          etd: { $ifNull: ["$matchedPOs.etd", null] },
          delivered_date: { $ifNull: ["$matchedPOs.delivery_date", null] },
        },
      },
    ];

    const pipeline = [
      ...pipelineBase,
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const data = await scopeModel.aggregate(pipeline);

    // Count total without pagination
    const totalDocs = await scopeModel.aggregate([
      ...pipelineBase,
      { $count: "count" },
    ]);
    const total = totalDocs[0]?.count || 0;

    res.status(200).json({
      message: "Detailed scope & PO mapping retrieved successfully",
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("getAllScopes error:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const exportScopes = async (req, res) => {
  try {
    // 1) Mode selection
    const mode = (req.query.type || "selected").toLowerCase();

    // 2) Build the initial $match for "selected" mode
    let initialMatch = {};
    if (mode === "selected") {
      const { selected = [] } = req.body || {};
      const uniqueSelected = [...new Set(selected)].filter(Boolean);

      if (!uniqueSelected.length) {
        return res.status(400).json({ message: "No selected scopes provided" });
      }

      initialMatch = {
        _id: {
          $in: uniqueSelected.map((id) => new mongoose.Types.ObjectId(id)),
        },
      };
    }

    // 3) Common pipeline (your original, with minor tweaks)
    const pipeline = [
      { $match: initialMatch },

      {
        $lookup: {
          from: "projectdetails",
          localField: "project_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "handoversheets",
          let: { pid: "$project.p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pid"] } } },
            {
              $project: {
                _id: 1,
                project_kwp: "$project_detail.project_kwp",
                dc_capacity: "$project_detail.proposed_dc_capacity",
                cam_member_name: "$other_details.cam_member_name",
                submitted_by: 1,
              },
            },
          ],
          as: "hs",
        },
      },
      { $addFields: { hs: { $arrayElemAt: ["$hs", 0] } } },

      {
        $lookup: {
          from: "users",
          localField: "hs.submitted_by",
          foreignField: "_id",
          as: "hs_submitted_by_user",
        },
      },
      {
        $addFields: {
          hs_submitted_by_user: {
            $arrayElemAt: ["$hs_submitted_by_user", 0],
          },
        },
      },

      {
        $lookup: {
          from: "purchaseorders",
          let: { pcode: "$project.code" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$pcode"] } } },
            {
              $project: {
                _id: 1,
                po_number: 1,
                date: 1,
                etd: 1,
                delivery_date: 1,
                "current_status.status": 1,
                item: 1,
              },
            },
          ],
          as: "posForProject",
        },
      },

      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },

      // Match scopes’ items to POs that contain that item category
      {
        $addFields: {
          matchedPOs: {
            $filter: {
              input: "$posForProject",
              as: "po",
              cond: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ["$$po.item", []] },
                        as: "poi",
                        cond: { $eq: ["$$poi.category", "$items.item_id"] },
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
      {
        $unwind: {
          path: "$matchedPOs",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // 4) Build filter matchStage for "all" mode using req.query
    if (mode === "all") {
      const {
        project_id,
        state,
        cam_person,
        po_status,
        item_name,
        scope,
        etd_from,
        etd_to,
        delivered_from,
        delivered_to,
        po_date_from,
        po_date_to,
        project_status,
        current_commitment_date_from,
        current_commitment_date_to,
      } = req.query || {};

      const matchStage = {};

      // Project filter (expects project _id)
      if (project_id && mongoose.isValidObjectId(project_id)) {
        matchStage["project._id"] = new mongoose.Types.ObjectId(project_id);
      }

      if (project_status && String(project_status).trim()) {
        matchStage["project.current_status.status"] = new RegExp(
          `^${String(project_status).trim()}$`,
          "i"
        );
      }

      // State filter (exact, case-insensitive)
      if (state && String(state).trim()) {
        matchStage["project.state"] = new RegExp(
          `^${String(state).trim()}$`,
          "i"
        );
      }

      // CAM Person filter (hs.submitted_by equals user _id)
      if (cam_person && mongoose.isValidObjectId(cam_person)) {
        matchStage["hs.submitted_by"] = new mongoose.Types.ObjectId(cam_person);
      }

      // PO Status filter:
      if (po_status && String(po_status).trim()) {
        if (String(po_status).toLowerCase().trim() === "pending") {
          matchStage.$or = [
            { matchedPOs: null },
            { "matchedPOs.po_number": { $exists: false } },
          ];
        } else {
          matchStage["matchedPOs.current_status.status"] = new RegExp(
            `^${String(po_status).trim()}$`,
            "i"
          );
        }
      }

      // Item filter: item_name is actually the item_id (ObjectId)
      if (item_name && mongoose.isValidObjectId(item_name)) {
        matchStage["items.item_id"] = new mongoose.Types.ObjectId(item_name);
      }

      // Scope filter (text contains)
      if (scope && String(scope).trim()) {
        matchStage["items.scope"] = new RegExp(String(scope).trim(), "i");
      }

      // ETD date range
      if (etd_from || etd_to) {
        matchStage["matchedPOs.etd"] = {};
        if (etd_from) matchStage["matchedPOs.etd"].$gte = new Date(etd_from);
        if (etd_to) {
          const end = new Date(etd_to);
          end.setHours(23, 59, 59, 999);
          matchStage["matchedPOs.etd"].$lte = end;
        }
      }

      if (current_commitment_date_from || current_commitment_date_to) {
        const range = {};
        if (current_commitment_date_from) {
          range.$gte = new Date(current_commitment_date_from);
        }
        if (current_commitment_date_to) {
          const end = new Date(current_commitment_date_to);
          end.setHours(23, 59, 59, 999);
          range.$lte = end;
        }

        matchStage["items.current_commitment_date.date"] = range;
      }

      // Delivered date range
      if (delivered_from || delivered_to) {
        matchStage["matchedPOs.delivery_date"] = {};
        if (delivered_from)
          matchStage["matchedPOs.delivery_date"].$gte = new Date(
            delivered_from
          );
        if (delivered_to) {
          const end = new Date(delivered_to);
          end.setHours(23, 59, 59, 999);
          matchStage["matchedPOs.delivery_date"].$lte = end;
        }
      }

      // PO date range
      if (po_date_from || po_date_to) {
        matchStage["matchedPOs.date"] = {};
        if (po_date_from)
          matchStage["matchedPOs.date"].$gte = new Date(po_date_from);
        if (po_date_to) {
          const end = new Date(po_date_to);
          end.setHours(23, 59, 59, 999);
          matchStage["matchedPOs.date"].$lte = end;
        }
      }

      if (Object.keys(matchStage).length) {
        pipeline.push({ $match: matchStage });
      }
    }

    // 5) Final projection (common)
    pipeline.push({
      $project: {
        _id: 0,
        project_id: "$project.code",
        project_name: "$project.name",
        project_group: "$project.p_group",
        state: "$project.state",
        ac_capacity: { $ifNull: ["$hs.project_kwp", "$project.project_kwp"] },
        dc_capacity: { $ifNull: ["$hs.dc_capacity", "$project.dc_capacity"] },
        cam_person: {
          $ifNull: ["$hs.cam_member_name", "$hs_submitted_by_user.name"],
        },
        category_name: "$items.name",
        scope: "$items.scope",
        commitment_date: {
          $ifNull: ["$items.current_commitment_date.date", null],
        },
        po_number: { $ifNull: ["$matchedPOs.po_number", "Pending"] },
        po_status: { $ifNull: ["$matchedPOs.current_status.status", ""] },
        po_date: { $ifNull: ["$matchedPOs.date", null] },
        etd: { $ifNull: ["$matchedPOs.etd", null] },
        delivered_date: { $ifNull: ["$matchedPOs.delivery_date", null] },
      },
    });

    // 6) Run aggregation + CSV export
    const rows = await scopeModel.aggregate(pipeline);

    const csvParser = new Parser({
      fields: [
        "project_id",
        "project_name",
        "project_group",
        "state",
        "ac_capacity",
        "dc_capacity",
        "cam_person",
        "category_name",
        "scope",
        "commitment_date",
        "po_number",
        "po_status",
        "po_date",
        "etd",
        "delivered_date",
      ],
    });

    const csvData = csvParser.parse(rows);
    res.header("Content-Type", "text/csv");
    res.attachment("selected_scopes_export.csv");
    res.send(csvData);
  } catch (error) {
    console.error("ExportScopes error:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateScope = async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "No update data provided" });
    }

    const scope = await scopeModel.findOne({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }

    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      const byId = new Map(
        scope.items
          .filter((it) => it?.item_id)
          .map((it) => [String(it.item_id), it])
      );
      const byName = new Map(
        scope.items
          .filter((it) => typeof it?.name === "string" && it.name.length > 0)
          .map((it) => [it.name, it])
      );

      for (const updatedItem of req.body.items) {
        let target = null;
        if (updatedItem?.item_id && byId.has(String(updatedItem.item_id))) {
          target = byId.get(String(updatedItem.item_id));
        } else if (updatedItem?.name && byName.has(updatedItem.name)) {
          target = byName.get(updatedItem.name);
        }

        if (!target) {
          continue;
        }

        if (typeof updatedItem.scope === "string") {
          target.scope = updatedItem.scope;
        }
        if (updatedItem.quantity !== undefined) {
          target.quantity = updatedItem.quantity;
        }
        if (updatedItem.uom !== undefined) {
          target.uom = updatedItem.uom;
        }
        if (typeof updatedItem.pr_status === "boolean") {
          target.pr_status = updatedItem.pr_status;
        }
        if (typeof updatedItem.order === "number") {
          target.order = updatedItem.order;
        }
      }
    }

    scope.status_history.push({
      status: "closed",
      remarks: " ",
      user_id: req.user.userId,
    });

    await scope.save();

    return res.status(200).json({
      message: "Scope updated successfully",
      data: scope,
    });
  } catch (error) {
    console.error("Error updating scope:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const deleteScope = async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOneAndDelete({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    return res.status(200).json({ message: "Scope deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const updateScopeStatus = async (req, res) => {
  try {
    const { project_id } = req.params;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }
    const scope = await scopeModel.findOne({ project_id });
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }
    const { status, remarks } = req.body;
    if (!status || !remarks) {
      return res
        .status(400)
        .json({ message: "Status and remarks are required" });
    }
    await scope.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await scope.save();
    return res
      .status(200)
      .json({ message: "Scope status updated successfully", data: scope });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// --- helpers (keep local so this stays self-contained) ---
const statusWeight = { po_created: 0, approval_done: 1, approval_pending: 2 };
const fmt = (v) => (v == null ? null : v);
const sortAndDedupePos = (arr = []) => {
  const key = (p) =>
    `${p.po_number ?? "null"}|${p.status ?? ""}|${p.po_date ?? ""}|${p.etd ?? ""}|${p.delivered_date ?? ""}`;
  const map = new Map();
  for (const p of arr) map.set(key(p), p);
  const unique = Array.from(map.values());
  return unique
    .map((p) => ({
      p,
      w: statusWeight[p?.status] ?? 99,
      ts: p?.po_date ? new Date(p.po_date).getTime() : -Infinity,
    }))
    .sort((a, b) => a.w - b.w || b.ts - a.ts)
    .map((x) => x.p);
};

const getScopePdf = async (req, res) => {
  try {
    const { project_id, view, format } = req.query;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }

    const project = await projectModells.findById(project_id).lean();
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const projectPid = project?.p_id || project?.pid || null;
    const handover = projectPid
      ? await handoverModel
          .findOne({ p_id: projectPid })
          .populate("submitted_by", "_id name")
          .lean()
      : null;

    const camMemberName = handover?.submitted_by?.name || null;
    const projectStatus =
      project?.current_status?.status || project?.status || null;

    const scopeData = await scopeModel
      .find({ project_id })
      .populate("current_status.user_id", "_id name")
      .populate("status_history.user_id", "_id name")
      .populate("createdBy", "_id name")
      .lean();

    if (!scopeData?.length) {
      return res
        .status(404)
        .json({ message: "No scope data found for this project" });
    }

    const allItemIdSet = new Set();
    for (const s of scopeData) {
      for (const it of Array.isArray(s.items) ? s.items : []) {
        if (it?.item_id && mongoose.isValidObjectId(it.item_id)) {
          allItemIdSet.add(String(it.item_id));
        }
      }
    }
    const allItemIds = Array.from(allItemIdSet);

    const categories = allItemIds.length
      ? await MaterialCategory.find({ _id: { $in: allItemIds } })
          .select("_id status")
          .lean()
      : [];
    const activeCategoryIdSet = new Set(
      categories
        .filter((c) => String(c.status).toLowerCase() === "active")
        .map((c) => String(c._id))
    );

    const projectCode = String(project?.code || "").trim();
    const pos = projectCode
      ? await purchaseorderModel
          .find({ p_id: projectCode })
          .select(
            "_id po_number date etd delivery_date current_status item createdAt"
          )
          .lean()
      : [];
    const catToPOs = new Map();
    for (const po of pos) {
      for (const poIt of Array.isArray(po.item) ? po.item : []) {
        const catId = poIt?.category ? String(poIt.category) : null;
        if (!catId) continue;
        if (!catToPOs.has(catId)) catToPOs.set(catId, []);
        catToPOs.get(catId).push(po);
      }
    }

    const processed = scopeData.map((scope) => {
      const plainItems = Array.isArray(scope.items) ? scope.items : [];

      const activeItems = plainItems.filter((it) => {
        const id = it?.item_id ? String(it.item_id) : null;
        return id && activeCategoryIdSet.has(id);
      });

      let sr = 0;
      const items = activeItems.map((it) => {
        sr += 1;
        const itemId = it?.item_id ? String(it.item_id) : null;
        const commitmentDate = it?.current_commitment_date?.date || null;

        const poList = (catToPOs.get(itemId) || []).map((p) => ({
          po_number: fmt(p?.po_number),
          status: fmt(p?.current_status?.status),
          po_date: fmt(p?.date),
          etd: fmt(p?.etd),
          delivered_date: fmt(p?.delivery_date),
        }));

        const sorted = sortAndDedupePos(poList);
        const effective =
          sorted.length > 0
            ? sorted
            : [
                {
                  po_number: "Pending",
                  status: "",
                  po_date: null,
                  etd: null,
                  delivered_date: null,
                },
              ];

        const first_po = effective[0];
        const other_pos = effective.slice(1);

        return {
          sr_no: sr,
          item_id: it.item_id,
          name: it.name,
          type: it.type,
          scope: it.scope,
          quantity: it.quantity,
          uom: it.uom,
          commitment_date: commitmentDate,
          first_po,
          other_pos,
        };
      });

      const rows = [];
      for (const it of items) {
        rows.push({
          sr_no: it.sr_no,
          name: it.name,
          type: it.type,
          scope: it.scope,
          commitment_date: fmt(it.commitment_date),
          po_number: it.first_po?.po_number || "Pending",
          po_status: it.first_po?.status || "",
          po_date: it.first_po?.po_date || null,
          etd: it.first_po?.etd || null,
          delivered_date: it.first_po?.delivered_date || null,
          _isChild: false,
        });
        for (const p of it.other_pos) {
          rows.push({
            sr_no: "",
            name: "",
            type: "",
            scope: "",
            commitment_date: "",
            po_number: p?.po_number || "Pending",
            po_status: p?.status || "",
            po_date: p?.po_date || null,
            etd: p?.etd || null,
            delivered_date: p?.delivered_date || null,
            _isChild: true,
          });
        }
      }

      return {
        ...scope,
        project,
        totalItems: activeItems.length,
        items,
        rows,
        handover: {
          cam_member_name: camMemberName,
          p_id: handover?.p_id || null,
          _id: handover?._id || null,
        },
        project_status: projectStatus,
      };
    });

    const totalRows = processed.reduce(
      (acc, s) => acc + (s.rows?.length || 0),
      0
    );
    if (totalRows === 0) {
      return res
        .status(404)
        .json({ message: "No active items found for this project" });
    }

    const isLandscape = String(view).toLowerCase() === "landscape";
    const normalizeFormat = (f) => {
      if (!f) return "A4";
      const val = String(f).trim().toUpperCase();
      const map = {
        A0: "A0",
        A1: "A1",
        A2: "A2",
        A3: "A3",
        A4: "A4",
        A5: "A5",
        Letter: "Letter",
        Legal: "Legal",
        Tabloid: "Tabloid",
      };
      return map[val] || "A4";
    };
    const pdfFormat = normalizeFormat(format);
    const apiUrl = `${process.env.PDF_PORT}/scopePdf/scope-pdf`;
    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: {
        scopes: processed,
        pdfOptions: { landscape: isLandscape, format: pdfFormat },
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"],
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Scope_${project?.code || project?._id}.pdf"`,
    });
    axiosResponse.data.pipe(res);
  } catch (error) {
    console.error("Error generating scope PDF:", error);
    res.status(500).json({
      message: "Error generating scope PDF",
      error: error.message,
    });
  }
};

const IT_TEAM_USER_ID = new mongoose.Types.ObjectId("6839a4086356310d4e15f6fd");

const ensureProjectScope = async (req, res) => {
  try {
    const projects = await projectModells.find({}).select({ _id: 1 }).lean();

    if (!projects.length) {
      return res.status(404).json({ message: "No projects found" });
    }

    const categories = await materialcategoryModel
      .find({ status: { $ne: "inactive" } })
      .select({ _id: 1, name: 1 })
      .lean();

    const itemsTemplate = categories.map((c) => ({
      item_id: c._id,
      name: c.name || "",
      pr_status: false,
    }));

    let createdCount = 0;
    let skippedCount = 0;

    for (const project of projects) {
      const exists = await scopeModel
        .findOne({ project_id: project._id })
        .lean();

      if (exists) {
        skippedCount++;
        continue;
      }

      await scopeModel.create({
        project_id: project._id,
        items: itemsTemplate,
        createdBy: IT_TEAM_USER_ID,
        status_history: [],
        current_status: {
          status: "open",
          remarks: null,
          user_id: null,
        },
      });

      createdCount++;
    }

    return res.status(201).json({
      message: "Scopes ensured for all projects",
      totalProjects: projects.length,
      created: createdCount,
      skipped: skippedCount,
      itemsPerScope: itemsTemplate.length,
    });
  } catch (err) {
    console.error("ensureAllProjectScopes error:", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
};

const updateCommitmentDate = async (req, res) => {
  try {
    const { id, item_id } = req.params;
    const { date, remarks } = req.body;

    // Validate inputs
    if (!date || !remarks) {
      return res.status(400).json({ message: "Date and Remarks are required" });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid scope id" });
    }
    if (!mongoose.isValidObjectId(item_id)) {
      return res.status(400).json({ message: "Invalid item_id" });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date value" });
    }

    // Load the document so pre('save') middleware will fire
    const scope = await scopeModel.findById(id);
    if (!scope) {
      return res.status(404).json({ message: "Scope not found" });
    }

    // Find the targeted item by comparing string vs ObjectId
    const idx = scope.items.findIndex(
      (it) => it?.item_id?.toString() === item_id
    );
    if (idx === -1) {
      return res.status(404).json({ message: "Item not found in scope" });
    }

    const now = new Date();
    const userId = req?.user?._id || req?.user?.userId || req?.user?.id || null;

    // Push to history
    scope.items[idx].commitment_date_history =
      scope.items[idx].commitment_date_history || [];
    scope.items[idx].commitment_date_history.push({
      date: parsedDate,
      remarks,
      user_id: userId,
      updatedAt: now,
    });

    // Update current commitment date
    scope.items[idx].current_commitment_date = {
      date: parsedDate,
      remarks,
      user_id: userId,
      updatedAt: now,
    };

    scope.markModified(`items.${idx}.commitment_date_history`);
    await scope.save();

    const updatedItem = scope.items[idx];

    return res.status(200).json({
      message: "Commitment date updated successfully.",
      data: {
        scope_id: id,
        item_id,
        item: updatedItem,
      },
    });
  } catch (error) {
    console.error("updateCommitmentDate error:", error);
    return res.status(500).json({
      message: "Internal server error.",
      error: error?.message || error,
    });
  }
};

module.exports = {
  createScope,
  getScopeById,
  getAllScopes,
  updateScope,
  deleteScope,
  updateScopeStatus,
  getScopePdf,
  ensureProjectScope,
  updateCommitmentDate,
  exportScopes,
};
