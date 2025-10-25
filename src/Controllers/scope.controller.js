const scopeModel = require("../models/scope.model");
const MaterialCategory = require("../models/materialcategory.model");
const projectModells = require("../models/project.model");
const { default: axios } = require("axios");
const { default: mongoose } = require("mongoose");
const materialcategoryModel = require("../models/materialcategory.model");
const purchaseorderModel = require("../models/purchaseorder.model");
const handoverModel = require("../models/handoversheet.model");

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
    const project = await projectModells.findById(project_id).select("_id code");
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
      .populate("createdBy", "_id name");

    if (!scope) return res.status(404).json({ message: "Scope not found" });

    // 3) All POs for this project (by project code in p_id)
    const pos = await purchaseorderModel
      .find({ p_id: projectCode })
      .select("_id po_number date etd delivery_date current_status item createdAt")
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
        po_date: p?.date ?? null,              // (string in your schema)
        etd: p?.etd ?? null,                   // (Date)
        delivered_date: p?.delivery_date ?? null, // (Date)
      }));

      const has_po_created = list.some(
        (p) => p?.current_status?.status === "po_created"
      );

      return {
        ...it,
        po_exists: simplified.length > 0,
        has_po_created,
        pos: simplified, // <<< multiple PO objects here
      };
    });

    // 6) Response
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
    const scopes = await scopeModel
      .find()
      .populate("current_status.user_id", "name")
      .populate("status_history.user_id", "name");

    return res.status(200).json({
      message: "Materials with scope info retrieved successfully",
      data: scopes,
    });
  } catch (error) {
    return res.status(500).json({
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
    .sort((a, b) => (a.w - b.w) || (b.ts - a.ts))
    .map((x) => x.p);
};

const getScopePdf = async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ message: "Project ID is required" });
    }

    const project = await projectModells.findById(project_id).lean();
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Handover (CAM Person) by project p_id
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

    // Load scope(s)
    const scopeData = await scopeModel
      .find({ project_id })
      .populate("current_status.user_id", "_id name")
      .populate("status_history.user_id", "_id name")
      .populate("createdBy", "_id name")
      .lean();

    if (!scopeData || !scopeData.length) {
      return res.status(404).json({ message: "No scope data found for this project" });
    }

    const allItemIds = [];
    for (const s of scopeData) {
      const items = Array.isArray(s.items) ? s.items : [];
      for (const it of items) {
        if (it?.item_id && mongoose.isValidObjectId(it.item_id)) {
          allItemIds.push(String(it.item_id));
        }
      }
    }

    const categories = await MaterialCategory
      .find({ _id: { $in: allItemIds } })
      .select("_id status")
      .lean();

    const catStatusMap = new Map(categories.map(c => [String(c._id), c.status || "inactive"]));

    const inactiveByScope = [];
    scopeData.forEach((s, idx) => {
      const items = Array.isArray(s.items) ? s.items : [];
      const inactiveItems = items
        .filter(it => {
          const key = it?.item_id ? String(it.item_id) : null;
          const st = key ? catStatusMap.get(key) : "inactive";
          return st !== "active";
        })
        .map(it => ({
          item_id: it?.item_id || null,
          name: it?.name || null,
          type: it?.type || null,
          scope: it?.scope || null,
          category_status: it?.item_id ? (catStatusMap.get(String(it.item_id)) || "inactive") : "inactive",
        }));

      if (inactiveItems.length > 0) {
        inactiveByScope.push({
          scope_index: idx,
          scope_id: s?._id || null,
          inactive_items: inactiveItems,
        });
      }
    });

    if (inactiveByScope.length > 0) {
      return res.status(400).json({
        message: "Cannot generate PDF: One or more categories are inactive.",
        details: inactiveByScope,
      });
    }

    const projectCode = String(project?.code || "").trim();
    const pos = projectCode
      ? await purchaseorderModel
          .find({ p_id: projectCode })
          .select("_id po_number date etd delivery_date current_status item createdAt")
          .lean()
      : [];

    // categoryId -> [po, ...]
    const catToPOs = new Map();
    for (const po of pos) {
      const items = Array.isArray(po.item) ? po.item : [];
      for (const poIt of items) {
        const catId = poIt?.category ? String(poIt.category) : null;
        if (!catId) continue;
        if (!catToPOs.has(catId)) catToPOs.set(catId, []);
        catToPOs.get(catId).push(po);
      }
    }

    // Process scopes → items/rows (all categories are active at this point)
    const processed = scopeData.map((scope) => {
      const plainItems = Array.isArray(scope.items) ? scope.items : [];

      let sr = 0;
      const items = plainItems.map((it) => {
        sr += 1;
        const itemId = it?.item_id ? String(it.item_id) : null;
        const poList = (catToPOs.get(itemId) || []).map((p) => ({
          po_number: fmt(p?.po_number),
          status: fmt(p?.current_status?.status),
          po_date: fmt(p?.date),
          etd: fmt(p?.etd),
          delivered_date: fmt(p?.delivery_date),
        }));

        const sorted = sortAndDedupePos(poList);
        const effective = sorted.length
          ? sorted
          : [{ po_number: "Pending", status: "", po_date: null, etd: null, delivered_date: null }];

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
          first_po,
          other_pos,
        };
      });

      // Flatten rows for the PDF service
      const rows = [];
      for (const it of items) {
        rows.push({
          sr_no: it.sr_no,
          name: it.name,
          type: it.type,
          scope: it.scope,
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
        totalItems: plainItems.length,
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

    // hand off to PDF service
    const apiUrl = `${process.env.PDF_PORT}/scopePdf/scope-pdf`;
    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: { scopes: processed },
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


module.exports = {
  createScope,
  getScopeById,
  getAllScopes,
  updateScope,
  deleteScope,
  updateScopeStatus,
  getScopePdf,
  ensureProjectScope,
};
