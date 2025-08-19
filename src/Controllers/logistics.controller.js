const Logistic = require("../Modells/logistics.model");

const createLogistic = async (req, res) => {
  try {
    const logistic = new Logistic({
      ...req.body,
      created_by: req.user?.userId || null, 
    });

    const savedLogistic = await logistic.save();
    res.status(201).json({
      message: "Logistic entry created successfully",
      data: savedLogistic,
    });
  } catch (err) {
    console.error("Error creating logistic:", err);
    res.status(500).json({ message: "Failed to create logistic", error: err.message });
  }
};

const getAllLogistics = async (req, res) => {
  try {
    const logistics = await Logistic.find()
      .populate("po_id")
      .populate("items.category_id")
      .populate("created_by")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Logistics fetched successfully",
      data: logistics,
    });
  } catch (err) {
    console.error("Error fetching logistics:", err);
    res.status(500).json({ message: "Failed to fetch logistics", error: err.message });
  }
};

// ============================
// GET Logistic by ID
// ============================
const getLogisticById = async (req, res) => {
  try {
    const { id } = req.params;
    const logistic = await Logistic.findById(id)
    .populate("po_id", "po_number")
      .populate("items.category_id")
      .populate("created_by", "_id name");

    if (!logistic) {
      return res.status(404).json({ message: "Logistic not found" });
    }

    res.status(200).json({
      message: "Logistic fetched successfully",
      data: logistic,
    });
  } catch (err) {
    console.error("Error fetching logistic:", err);
    res.status(500).json({ message: "Failed to fetch logistic", error: err.message });
  }
};

// ============================
// UPDATE Logistic
// ============================
const updateLogistic = async (req, res) => {
  try {
    const { id } = req.params;

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
    res.status(500).json({ message: "Failed to update logistic", error: err.message });
  }
};

// ============================
// DELETE Logistic
// ============================
const deleteLogistic = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedLogistic = await Logistic.findByIdAndDelete(id);

    if (!deletedLogistic) {
      return res.status(404).json({ message: "Logistic not found" });
    }

    res.status(200).json({ message: "Logistic deleted successfully" });
  } catch (err) {
    console.error("Error deleting logistic:", err);
    res.status(500).json({ message: "Failed to delete logistic", error: err.message });
  }
};

module.exports = {
  createLogistic,
  getAllLogistics,
  getLogisticById,
  updateLogistic,
  deleteLogistic,
};