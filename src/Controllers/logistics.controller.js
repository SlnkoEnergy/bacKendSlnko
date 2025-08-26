const mongoose = require("mongoose");
const Logistic = require("../Modells/logistics.model");
const { nextLogisticCode } = require("../utils/logisticscounter.utils");
const purchaseOrderModells = require("../Modells/purchaseorder.model");

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
          $convert: { input: "$items.received_qty", to: "double", onError: 0, onNull: 0 }
        },
      },
    },
  ]);
  return rows || [];
}

function matchesPOLine(poLine, logRow) {
  if (logRow.po_item_id && poLine._id && eqId(logRow.po_item_id, poLine._id)) return true;

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

  const combinedRemarks = [baseRemarks, scopeRemark].filter(Boolean).join(" | ");

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
    const pageSize = Math.max(
      1,
      Math.min(200, parseInt(req.query.pageSize, 10) || 50)
    );
    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();
    const poId = (req.query.po_id || "").trim();

    const filter = {};
    if (search) {
      filter.$or = [
        { logistic_code: { $regex: search, $options: "i" } },
        { vehicle_number: { $regex: search, $options: "i" } },
        { driver_number: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (status) {
      filter["current_status.status"] = status;
    }
    if (poId && isId(poId)) {
      filter.po_id = toObjectId(poId);
    }

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
      const vendorList = Array.from(
        new Set(
          (Array.isArray(doc.po_id) ? doc.po_id : [])
            .map((p) => (p && typeof p === "object" ? p.vendor : null))
            .filter(Boolean)
        )
      );

      const transportValueSum = (
        Array.isArray(doc.po_id) ? doc.po_id : []
      ).reduce((acc, p) => acc + (parseFloat(p?.po_value) || 0), 0);

      return {
        ...doc,
        vendor: vendorList[0] || null,
        transport_vendors: vendorList,
        transport_po_value_sum: Number.isFinite(transportValueSum)
          ? transportValueSum
          : null,

        items: (doc.items || []).map((it) => ({
          ...it,
          category_name:
            it?.category_id?.category_name ?? it?.category_id?.name ?? null,
          vendor:
            (it?.material_po && typeof it.material_po === "object"
              ? it.material_po.vendor
              : null) ||
            vendorList[0] ||
            null,

          uom: resolveUomFromPO(it),

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
    });

    return res.status(200).json({
      message: "Logistics fetched successfully",
      meta: { total, page, pageSize, count: logistics.length },
      data: logistics,
    });
  } catch (err) {
    console.error("Error fetching logistics:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch logistics", error: err.message });
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

    const updatedLogistic = await Logistic.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedLogistic) {
      return res.status(404).json({ message: "Logistic not found" });
    }

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
    const { status, remarks, dispatch_date } = req.body;
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

    const doc = await Logistic.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Logistic not found" });

    const now = new Date();
    const $set = {
      current_status: { status, remarks, user_id: userId },
    };
    const $push = {
      status_history: { status, remarks, user_id: userId },
    };

    if (status === "ready_to_dispatch") {
      if (dispatch_date) $set.dispatch_date = new Date(dispatch_date);
      else if (!doc.dispatch_date) $set.dispatch_date = now;
    }
    if (status === "out_for_delivery") {
      if (!doc.dispatch_date) $set.dispatch_date = now;
    }
    if (status === "delivered") {
      if (!doc.dispatch_date) $set.dispatch_date = now;
      if (!doc.delivery_date) $set.delivery_date = now;
    }

    await Logistic.updateOne({ _id: id }, { $set, $push });

    const fresh = await Logistic.findById(id)
      .select(
        "logistic_code total_transport_po_value vehicle_number driver_number total_ton current_status status_history dispatch_date delivery_date po_id items"
      )
      .populate("po_id", "po_number vendor po_value p_id")
      .populate("items.material_po", "po_number vendor p_id items")
      .populate({ path: "items.category_id", select: "name category_name" })
      .lean();

    if (status === "delivered") {
      const affectedPoIds = new Set(
        (fresh.items || [])
          .map((it) => {
            const v = it?.material_po;
            return (v && typeof v === "object") ? v._id : v;
          })
          .filter(Boolean)
          .map(String)
      );

      await Promise.all(
        Array.from(affectedPoIds).map((poId) =>
          recalcPOFromReceipts(poId, userId, `Auto from Logistics ${fresh.logistic_code}: delivered`)
        )
      );
    }

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

    const responseData = {
      ...fresh,
      vendor: vendorList[0] || null,
      transport_vendors: vendorList,
      items: enrichedItems,
    };

    return res.status(200).json({ message: "Status updated", data: responseData });
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
