const mongoose = require("mongoose"); 
const Logistic = require("../Modells/logistics.model");
const { nextLogisticCode } = require("../utils/logisticscounter.utils");

const getParamId = (req) => req.params.id || req.params._id;

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
    const isId = (v) => mongoose.Types.ObjectId.isValid(v);

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
        weight: String(it.weight ?? ""),
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

    const filter = {};
    if (search) {
      filter.$or = [
        { logistic_code: { $regex: search, $options: "i" } },
        { vehicle_number: { $regex: search, $options: "i" } },
        { driver_number: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (status) filter.status = status;
    if (poId) filter.po_id = poId;

    const [total, raw] = await Promise.all([
      Logistic.countDocuments(filter),
      Logistic.find(filter)
        .select("logistic_code po_id items vehicle_number total_transport_po_value total_ton status created_by createdAt")
        .populate("po_id", "po_number")
        .populate("items.material_po", "po_number")
        // ⬇️ populate the category doc; select whichever field(s) exist in your schema
        .populate({ path: "items.category_id", select: "name category_name" })
        .populate("created_by", "_id name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
    ]);

    // ⬇️ If your category schema uses `name` (not `category_name`), expose a `category_name` alias on each item
    const logistics = raw.map(doc => ({
      ...doc,
      items: (doc.items || []).map(it => ({
        ...it,
        category_name: it?.category_id?.category_name ?? it?.category_id?.name ?? null,
      })),
    }));

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



const getLogisticById = async (req, res) => {
  try {
    const id = getParamId(req);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const logistic = await Logistic.findById(id)
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

    res
      .status(200)
      .json({ message: "Logistic updated successfully", data: updatedLogistic });
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

module.exports = {
  createLogistic,
  getAllLogistics,
  getLogisticById,
  updateLogistic,
  deleteLogistic,
};
