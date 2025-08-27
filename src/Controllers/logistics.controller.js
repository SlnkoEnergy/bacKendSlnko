const mongoose = require("mongoose");
const Logistic = require("../Modells/logistics.model");
const { nextLogisticCode } = require("../utils/logisticscounter.utils");
const purchaseOrderModells = require("../Modells/purchaseorder.model");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");
const updateStatus = require("../utils/updatestatus.utils");
const getParamId = (req) => req.params.id || req.params._id || req.body.id;
const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const toObjectId = (v) => (isId(v) ? new mongoose.Types.ObjectId(v) : null);
const eqId = (a, b) => a && b && String(a) === String(b);

const ALLOWED_STATUS = ["ready_to_dispatch", "out_for_delivery", "delivered"];

function resolveUomFromPO(it) {
  const mpo = it?.material_po;
  if (!mpo || typeof mpo !== "object") return it.uom ?? null;

  const lines = Array.isArray(mpo.items) ? mpo.items : [];
  if (!lines.length) return it.uom ?? null;

  if (isId(it.po_item_id)) {
    const exact = lines.find((l) => eqId(l?._id, it.po_item_id));
    if (exact?.uom) return exact.uom;
  }

  // Helpers for fallbacks
  const matchByCategory = (l) => {
    const lineCat =
      l?.category?._id || l?.category || l?.category_id?._id || l?.category_id;
    return it.category_id ? eqId(lineCat, it.category_id) : true;
  };
  const matchByProduct = (l) =>
    it.product_name ? l?.product_name === it.product_name : true;
  const matchByMake = (l) =>
    it.product_make ? l?.make === it.product_make : true;

  let guess = lines.find(
    (l) => matchByCategory(l) && matchByProduct(l) && matchByMake(l)
  );
  if (guess?.uom) return guess.uom;

  guess = lines.find((l) => matchByProduct(l) && matchByMake(l));
  if (guess?.uom) return guess.uom;

  guess = lines.find((l) => matchByCategory(l));
  if (guess?.uom) return guess.uom;

  if (lines.length === 1 && lines[0]?.uom) return lines[0].uom;

  return it.uom ?? null;
}
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const approxEq = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const normalizeCatId = (cat) => {
  if (!cat) return null;
  if (typeof cat === "object" && cat._id) return String(cat._id);
  if (isId(cat)) return String(cat);
  return null;
};

/** Get all logistics item rows for one PO (material_po == poId) */
async function fetchLogItemsForPO(poId) {
  const _poId = toObjectId(poId);
  if (!_poId) return [];
  const rows = await Logistic.aggregate([
    { $unwind: "$items" },
    { $match: { "items.material_po": _poId } },
    {
      $project: {
        po_item_id: "$items.po_item_id",
        category_id: "$items.category_id",
        product_name: "$items.product_name",
        product_make: "$items.product_make",
        received_qty: {
          $convert: {
            input: "$items.received_qty",
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
  ]);
  return rows || [];
}

function matchesPOLine(poLine, logRow) {
  if (logRow.po_item_id && poLine._id && eqId(logRow.po_item_id, poLine._id))
    return true;

  const poCat = normalizeCatId(poLine.category);
  const liCat = logRow.category_id ? String(logRow.category_id) : null;
  const catOk = poCat && liCat ? poCat === liCat : true;

  const prodOk = poLine.product_name
    ? String(poLine.product_name) === String(logRow.product_name || "")
    : true;

  const makeOk = poLine.product_make
    ? String(poLine.product_make) === String(logRow.product_make || "")
    : true;

  return catOk && prodOk && makeOk;
}

async function recalcPOFromReceipts(poId, userId, baseRemarks = "") {
  const po = await purchaseOrderModells.findById(poId);
  if (!po) return;

  const poLines = Array.isArray(po.item) ? po.item : [];
  if (poLines.length === 0) return;

  const logRows = await fetchLogItemsForPO(poId);

  let allFullyReceived = true;
  let anyReceived = false;

  for (const line of poLines) {
    const ordered = toNum(line.quantity);
    if (ordered <= 0) continue;

    let sumReceived = 0;
    for (const r of logRows) {
      if (matchesPOLine(line, r)) {
        sumReceived += toNum(r.received_qty);
      }
    }

    if (sumReceived > 0) anyReceived = true;
    if (!approxEq(sumReceived, ordered)) {
      allFullyReceived = false;
    }
  }

  let finalStatus = po.current_status?.status || "po_created";
  let scopeRemark = "";

  if (allFullyReceived) {
    finalStatus = "delivered";
    scopeRemark = "FULLY DELIVERED (all items received)";
    if (!po.delivery_date) po.delivery_date = new Date();
  } else {
    finalStatus = "partially_delivered";
    scopeRemark = anyReceived
      ? "PARTIALLY DELIVERED (some items not fully received)"
      : "PARTIALLY DELIVERED (no receipts yet)";
  }

  const combinedRemarks = [baseRemarks, scopeRemark]
    .filter(Boolean)
    .join(" | ");

  const sameStatus = po.current_status?.status === finalStatus;
  const sameRemarks = (po.current_status?.remarks || "") === combinedRemarks;
  if (!sameStatus || !sameRemarks) {
    po.status_history.push({
      status: finalStatus,
      remarks: combinedRemarks,
      user_id: userId || null,
    });
    po.current_status = {
      status: finalStatus,
      remarks: combinedRemarks,
      user_id: userId || null,
    };
    await po.save();
  }
}

const createLogistic = async (req, res) => {
  try {
    const {
      po_id = [],
      attachment_url = "",
      vehicle_number,
      driver_number,
      total_ton,
      total_transport_po_value,
      description = "",
      items = [],
    } = req.body;

    const logistic_code = await nextLogisticCode();

    if (
      !po_id.length ||
      !vehicle_number ||
      !driver_number ||
      total_ton == null ||
      total_transport_po_value == null
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (po_id.some((id) => !isId(id))) {
      return res.status(400).json({ message: "Invalid po_id in array" });
    }

    const mappedItems = items.map((it, i) => {
      if (!isId(it.material_po)) {
        const err = new Error(`Invalid material_po at items[${i}]`);
        err.status = 400;
        throw err;
      }
      if (it.category_id && !isId(it.category_id)) {
        const err = new Error(`Invalid category_id at items[${i}]`);
        err.status = 400;
        throw err;
      }
      return {
        material_po: it.material_po,

        po_item_id: isId(it.po_item_id) ? it.po_item_id : undefined,
        category_id: it.category_id || undefined,
        product_name: it.product_name ?? "",
        uom: typeof it.uom === "string" ? it.uom : "",
        product_make: it.product_make ?? "",
        quantity_requested: String(it.quantity_requested ?? ""),
        quantity_po: String(it.quantity_po ?? ""),
        received_qty: String(it.received_qty ?? ""),
        weight: String(it.weight ?? it.ton ?? ""),
      };
    });

    const doc = await Logistic.create({
      logistic_code,
      po_id,
      attachment_url,
      vehicle_number,
      driver_number,
      total_ton: String(total_ton),
      total_transport_po_value: String(total_transport_po_value),
      description,
      items: mappedItems,
      created_by: req.user?.userId ?? null,

      current_status: {
        status: "ready_to_dispatch",
        remarks: "",
        user_id: req.user?.userId ?? null,
      },
      status_history: [
        {
          status: "ready_to_dispatch",
          remarks: "",
          user_id: req.user?.userId ?? null,
        },
      ],
    });

    res
      .status(201)
      .json({ message: "Logistic entry created successfully", data: doc });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ message: err.message || "Failed to create logistic" });
  }
};

const getAllLogistics = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize, 10) || 50));

    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();
    const poId = (req.query.po_id || "").trim();

    // -------- normalize po_number (single or CSV) ----------
    const isBlankish = (v) => {
      if (v == null) return true;
      const s = String(v).trim().toLowerCase();
      return !s || s === "undefined" || s === "null";
    };

    const rawPoNumberQ = req.query.po_number; // could be undefined | string | string[]
    let poNumbers = [];
    if (!isBlankish(rawPoNumberQ)) {
      if (Array.isArray(rawPoNumberQ)) {
        poNumbers = rawPoNumberQ
          .flatMap((s) => String(s).split(","))
          .map((s) => s.trim())
          .filter((s) => s && s.toLowerCase() !== "undefined" && s.toLowerCase() !== "null");
      } else {
        poNumbers = String(rawPoNumberQ)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s.toLowerCase() !== "undefined" && s.toLowerCase() !== "null");
      }
    }
    // -------------------------------------------------------

    // Build filter with ANDed clauses so we don't clobber $or from search
    const andClauses = [];

    if (search) {
      andClauses.push({
        $or: [
          { logistic_code:  { $regex: search, $options: "i" } },
          { vehicle_number: { $regex: search, $options: "i" } },
          { driver_number:  { $regex: search, $options: "i" } },
          { description:    { $regex: search, $options: "i" } },
        ],
      });
    }

    if (status) {
      andClauses.push({ "current_status.status": status });
    }

    // Collect PO ids from po_id and from po_number(s)
    const poIdList = [];
    if (poId && isId(poId)) poIdList.push(toObjectId(poId));

    if (poNumbers.length) {
      const pos = await purchaseOrderModells
        .find({ po_number: { $in: poNumbers } })
        .select("_id po_number")
        .lean();

      if (pos.length === 0) {
        // IMPORTANT: only short-circuit when po_number WAS actually provided and none matched.
        return res.status(200).json({
          message: "Logistics fetched successfully",
          meta: { total: 0, page, pageSize, count: 0 },
          data: [],
        });
      }

      poIdList.push(...pos.map((p) => p._id));
    }

    if (poIdList.length) {
      // Match both ObjectId and string forms; also match items.material_po
      const objectIds = poIdList.map((id) => toObjectId(id));
      const stringIds = objectIds.map(String);

      andClauses.push({
        $or: [
          { po_id: { $in: objectIds } },
          { po_id: { $in: stringIds } },
          { "items.material_po": { $in: objectIds } },
          { "items.material_po": { $in: stringIds } },
        ],
      });
    }

    // If NO po_number (or blankish) and NO po_id and NO other filters, this stays {}, returning ALL data
    const filter = andClauses.length ? { $and: andClauses } : {};

    const [total, raw] = await Promise.all([
      Logistic.countDocuments(filter),
      Logistic.find(filter)
        .select(
          [
            "logistic_code",
            "po_id",
            "items",
            "vehicle_number",
            "driver_number",
            "total_transport_po_value",
            "total_ton",
            "current_status",
            "dispatch_date",
            "delivery_date",
            "description",
            "created_by",
            "createdAt",
          ].join(" ")
        )
        .populate("po_id", "po_number vendor po_value p_id")
        .populate("items.material_po", "po_number vendor p_id items")
        .populate({ path: "items.category_id", select: "name category_name" })
        .populate("created_by", "_id name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    const logistics = raw.map((doc) => {
      // Normalize po_id to an array for aggregation
      const poArr = Array.isArray(doc.po_id) ? doc.po_id : (doc.po_id ? [doc.po_id] : []);

      const vendorList = Array.from(
        new Set(
          poArr
            .map((p) => (p && typeof p === "object" ? p.vendor : null))
            .filter(Boolean)
        )
      );

      const transportValueSum = poArr.reduce(
        (acc, p) => acc + (parseFloat(p?.po_value) || 0),
        0
      );

      return {
        ...doc,
        vendor: vendorList[0] || null,
        transport_vendors: vendorList,
        transport_po_value_sum: Number.isFinite(transportValueSum) ? transportValueSum : null,
        items: (doc.items || []).map((it) => ({
          ...it,
          category_name: it?.category_id?.category_name ?? it?.category_id?.name ?? null,
          vendor:
            (it?.material_po && typeof it.material_po === "object" ? it.material_po.vendor : null) ||
            vendorList[0] ||
            null,
          uom: resolveUomFromPO(it),
          po_number:
            (it?.material_po && typeof it.material_po === "object" ? it.material_po.po_number : it?.po_number) || null,
          project_id:
            (it?.material_po && typeof it.material_po === "object" ? it.material_po.p_id : it?.project_id) || null,
        })),
      };
    });

    return res.status(200).json({
      message: "Logistics fetched successfully",
      meta: { total, page, pageSize, count: logistics.length },
      data: logistics,
    });
  } catch (err) {
    console.error("Error fetching logistics:", err);
    return res.status(500).json({ message: "Failed to fetch logistics", error: err.message });
  }
};


/* ---------------- get by id ---------------- */
const getLogisticById = async (req, res) => {
  try {
    const id = getParamId(req);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    let logistic = await Logistic.findById(id)
      .select(
        [
          "logistic_code",
          "po_id",
          "items",
          "vehicle_number",
          "driver_number",
          "total_transport_po_value",
          "total_ton",
          "current_status",
          "dispatch_date",
          "delivery_date",
          "description",
          "created_by",
          "createdAt",
        ].join(" ")
      )
      .populate("po_id", "po_number vendor po_value p_id")
      .populate("items.material_po", "po_number vendor p_id items")
      .populate("items.category_id", "name category_name")
      .populate("created_by", "_id name")
      .lean();

    if (!logistic) {
      return res.status(404).json({ message: "Logistic not found" });
    }

    const vendorList = Array.from(
      new Set(
        (Array.isArray(logistic.po_id) ? logistic.po_id : [])
          .map((p) => (p && typeof p === "object" ? p.vendor : null))
          .filter(Boolean)
      )
    );

    const transportValueSum = (
      Array.isArray(logistic.po_id) ? logistic.po_id : []
    ).reduce((acc, p) => acc + (parseFloat(p?.po_value) || 0), 0);

    logistic = {
      ...logistic,
      vendor: vendorList[0] || null,
      transport_vendors: vendorList,
      transport_po_value_sum: Number.isFinite(transportValueSum)
        ? transportValueSum
        : null,

      items: (logistic.items || []).map((it) => ({
        ...it,
        category_name:
          it?.category_id?.category_name ?? it?.category_id?.name ?? null,
        vendor:
          (it?.material_po && typeof it.material_po === "object"
            ? it.material_po.vendor
            : null) ||
          vendorList[0] ||
          null,

        uom: it.uom ?? "",

        po_number:
          (it?.material_po && typeof it.material_po === "object"
            ? it.material_po.po_number
            : it?.po_number) || null,
        project_id:
          (it?.material_po && typeof it.material_po === "object"
            ? it.material_po.p_id
            : it?.project_id) || null,
      })),
    };

    res
      .status(200)
      .json({ message: "Logistic fetched successfully", data: logistic });
  } catch (err) {
    console.error("Error fetching logistic:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch logistic", error: err.message });
  }
};

const updateLogistic = async (req, res) => {
  try {
    const id = getParamId(req);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const logisticDoc = await Logistic.findById(id);
    if (!logisticDoc) {
      return res.status(404).json({ message: "Logistic not found" });
    }
    const rawCode = String(logisticDoc.logistic_code || "").trim();

    const safeCode = rawCode
      .replace(/[\/\\]+/g, "_")
      .replace(/[:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_");

    const folderPath = `Logistics/${safeCode}`;

    const uploadedFileUrls = [];

    for (const file of req.files || []) {
      const mimeType = mime.lookup(file.originalname) || file.mimetype;
      let buffer = file.buffer;

      if (mimeType.startsWith("image/")) {
        const extension = mime.extension(mimeType);
        if (extension === "jpeg" || extension === "jpg") {
          buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        } else if (extension === "png") {
          buffer = await sharp(buffer).png({ quality: 40 }).toBuffer();
        } else if (extension === "webp") {
          buffer = await sharp(buffer).webp({ quality: 40 }).toBuffer();
        } else {
          buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        }
      }

      const form = new FormData();
      form.append("file", buffer, {
        filename: file.originalname,
        contentType: mimeType,
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
        uploadedFileUrls.push(url);
      } else {
        console.warn(`No URL found for uploaded file ${file.originalname}`);
      }
    }

    const bodyData = {
      ...req.body,
    };
    if (uploadedFileUrls.length > 0) {
      bodyData.attachment_url = [
        ...(logisticDoc.attachment_url || []),
        ...uploadedFileUrls,
      ];
    }

    const updatedLogistic = await Logistic.findByIdAndUpdate(id, bodyData, {
      new: true,
    });

    res.status(200).json({
      message: "Logistic updated successfully",
      data: updatedLogistic,
    });
  } catch (err) {
    console.error("Error updating logistic:", err);
    res
      .status(500)
      .json({ message: "Failed to update logistic", error: err.message });
  }
};

const deleteLogistic = async (req, res) => {
  try {
    const id = getParamId(req);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const deletedLogistic = await Logistic.findByIdAndDelete(id);
    if (!deletedLogistic) {
      return res.status(404).json({ message: "Logistic not found" });
    }

    res.status(200).json({ message: "Logistic deleted successfully" });
  } catch (err) {
    console.error("Error deleting logistic:", err);
    res
      .status(500)
      .json({ message: "Failed to delete logistic", error: err.message });
  }
};

const updateLogisticStatus = async (req, res) => {
  try {
    const id = getParamId(req);
    const { status, remarks = "", dispatch_date } = req.body;
    const userId = req.user?.userId || null;

    if (!id || !isId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // 1) Load the document (NOT lean)
    const doc = await Logistic.findById(id);
    if (!doc) return res.status(404).json({ message: "Logistic not found" });

    // 2) Push to history (like your Tasks controller)
    if (!Array.isArray(doc.status_history)) doc.status_history = [];
    doc.status_history.push({ status, remarks, user_id: userId });

    // 3) Apply date side-effects
    const now = new Date();
    if (status === "ready_to_dispatch") {
      doc.dispatch_date = dispatch_date
        ? new Date(dispatch_date)
        : (doc.dispatch_date || now);
    }
    if (status === "out_for_delivery") {
      if (!doc.dispatch_date) doc.dispatch_date = now;
    }
    if (status === "delivered") {
      if (!doc.dispatch_date) doc.dispatch_date = now;
      if (!doc.delivery_date) doc.delivery_date = now;
    }

    // 4) Let your util compute current_status from the history (default = ready_to_dispatch)
    updateStatus(doc, "ready_to_dispatch");

    // 5) Save
    await doc.save();

    // 6) Re-fetch populated for response
    const fresh = await Logistic.findById(id)
      .select(
        "logistic_code total_transport_po_value vehicle_number driver_number total_ton current_status status_history dispatch_date delivery_date po_id items"
      )
      .populate("po_id", "po_number vendor po_value p_id")
      .populate("items.material_po", "po_number vendor p_id items")
      .populate({ path: "items.category_id", select: "name category_name" })
      .lean();

    // Compute current_status on the lean object for the API response
    updateStatus(fresh, "ready_to_dispatch");

    // 7) If delivered, recalc impacted POs
    if (status === "delivered") {
      const affectedPoIds = new Set(
        (fresh.items || [])
          .map((it) => {
            const v = it?.material_po;
            return v && typeof v === "object" ? v._id : v;
          })
          .filter(Boolean)
          .map(String)
      );

      await Promise.all(
        Array.from(affectedPoIds).map((poId) =>
          recalcPOFromReceipts(
            poId,
            userId,
            `Auto from Logistics ${fresh.logistic_code}: delivered`
          )
        )
      );
    }

    // 8) Enrich response (unchanged)
    const vendorList = Array.from(
      new Set(
        (Array.isArray(fresh?.po_id) ? fresh.po_id : [])
          .map((p) => (p && typeof p === "object" ? p.vendor : null))
          .filter(Boolean)
      )
    );

    const enrichedItems = (fresh.items || []).map((it) => ({
      ...it,
      category_name:
        it?.category_id?.category_name ?? it?.category_id?.name ?? null,
      uom: resolveUomFromPO(it),
      vendor:
        (it?.material_po && typeof it.material_po === "object"
          ? it.material_po.vendor
          : null) ||
        vendorList[0] ||
        null,
      po_number:
        it?.material_po && typeof it.material_po === "object"
          ? it.material_po.po_number
          : null,
      project_id:
        it?.material_po && typeof it.material_po === "object"
          ? it.material_po.p_id
          : null,
    }));

    return res.status(200).json({
      message: "Status updated",
      data: {
        ...fresh,
        vendor: vendorList[0] || null,
        transport_vendors: vendorList,
        items: enrichedItems,
      },
    });
  } catch (err) {
    console.error("updateLogisticStatus error:", err);
    return res
      .status(500)
      .json({ message: "Failed to update status", error: err.message });
  }
};

module.exports = {
  createLogistic,
  getAllLogistics,
  getLogisticById,
  updateLogistic,
  updateLogisticStatus,
  deleteLogistic,
};
