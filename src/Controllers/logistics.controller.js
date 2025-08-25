const mongoose = require("mongoose");
const Logistic = require("../Modells/logistics.model");
const { nextLogisticCode } = require("../utils/logisticscounter.utils");

// helpers
const getParamId = (req) => req.params.id || req.params._id || req.body.id;
const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const ALLOWED_STATUS = ["ready_to_dispatch", "out_for_delivery", "delivered"];

/* ---------------- create ---------------- */
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

    // Basic required fields
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
        category_id: it.category_id || undefined,
        product_name: it.product_name ?? "",
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

      // Default status without touching the model
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

/* ---------------- list ---------------- */
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
      // your model stores it here:
      filter["current_status.status"] = status;
    }
    if (poId) filter.po_id = poId;

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
        .populate("po_id", "po_number")
        .populate("items.material_po", "po_number")
        .populate({ path: "items.category_id", select: "name category_name" })
        .populate("created_by", "_id name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    const logistics = raw.map((doc) => ({
      ...doc,
      items: (doc.items || []).map((it) => ({
        ...it,
        category_name:
          it?.category_id?.category_name ?? it?.category_id?.name ?? null,
      })),
    }));

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

    const logistic = await Logistic.findById(id)
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
      .populate("po_id", "po_number")
      .populate("items.material_po", "po_number")
      .populate("items.category_id", "name")
      .populate("created_by", "_id name")
      .lean();

    if (!logistic) {
      return res.status(404).json({ message: "Logistic not found" });
    }

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

/* ---------------- update fields ---------------- */
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

/* ---------------- delete ---------------- */
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

/* ---------------- status update ---------------- */
const updateLogisticStatus = async (req, res) => {
  try {
    const id = getParamId(req);
    const { status, remarks, dispatch_date } = req.body; // optional remarks/date
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

    // Read current doc lean for conditional date logic (no validation here)
    const doc = await Logistic.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Logistic not found" });

    const now = new Date();
    const $set = {
      current_status: { status, remarks, user_id: userId },
    };
    const $push = {
      status_history: { status, remarks, user_id: userId },
    };

    // Auto-date stamping logic
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

    // Atomic update without triggering full doc validation on required fields
    await Logistic.updateOne({ _id: id }, { $set, $push });

    // Return fresh version (select only fields the UI needs)
    const fresh = await Logistic.findById(id)
      .select(
        "logistic_code total_transport_po_value vehicle_number driver_number total_ton current_status status_history dispatch_date delivery_date"
      )
      .populate("po_id", "po_number")
      .populate("items.material_po", "po_number")
      .lean();

    return res.status(200).json({ message: "Status updated", data: fresh });
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
