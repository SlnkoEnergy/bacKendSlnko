// controllers/logistic.controller.js
const mongoose = require("mongoose"); // ✅ needed for ObjectId checks
const Logistic = require("../Modells/logistics.model"); // ⬅️ ensure this path & casing are correct

// helper to accept either :id or :_id from routes
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
      po_id,
      attachment_url,
      vehicle_number,
      driver_number,
      total_ton: String(total_ton),                       // schema: String
      total_transport_po_value: String(total_transport_po_value), // schema: String (required)
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
    const logistics = await Logistic.find()
      .populate("po_id")
      .populate("items.material_po", "po_number") // optional: show PO number for item POs
      .populate("items.category_id")
      .populate("created_by")
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json({ message: "Logistics fetched successfully", data: logistics });
  } catch (err) {
    console.error("Error fetching logistics:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch logistics", error: err.message });
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
