// controllers/inspection.controller.js
const { catchAsyncError } = require("../middlewares/catchasyncerror.middleware");
const Inspection = require("../Modells/inspection.model");
const ErrorHandler = require("../middlewares/error.middleware")

// CREATE
// controller
const createInspection = catchAsyncError(async (req, res) => {
  const userId = req.user?.userId;
  const b = req.body || {};

  let doc;
  if (b.items && b.inspection) {
    const items = Array.isArray(b.items) ? b.items : [];
    const ins = b.inspection || {};

    doc = {
      project_code:  b.project_code,
      dept_category: b.dept_category, 
      vendor: b.vendor,
      vendor_contact: ins.contact_person || "",
      vendor_mobile: ins.contact_mobile || "",
      mode: ins.mode,
      location: ins.mode === "offline" ? ins.location || "" : "",
      description: ins.notes || b.description || "",
      date: ins.datetime || b.date || undefined,
      item: items.map((it) => ({
        category_id: it.category_id || it.category || it.productCategoryId || undefined,
        product_name: it.product_name || it.productName || "",
        description: it.description || it.briefDescription || "",
        product_make: it.product_make || it.make || "",
        quantity: String(it.quantity ?? 0),
      })),
      created_by: userId,
    };
  } else {
    doc = { ...b, created_by: userId };
  }

  const inspection = new Inspection(doc);
  const saved = await inspection.save();
  res.status(201).json(saved);
});



const getAllInspections = catchAsyncError(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const order = req.query.order === "desc" ? -1 : 1;
    const search = req.query.search || "";

    // Build search filter
    const searchFilter = {
      $or: [
        { vendor: { $regex: search, $options: "i" } },
        { vendor_contact: { $regex: search, $options: "i" } },
        { dept_category: { $regex: search, $options: "i" } },
      ],
    };

    const inspections = await Inspection.find(searchFilter)
      .populate("project_id created_by current_status.user_id")
      .sort({ [sortBy]: order })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Inspection.countDocuments(searchFilter);

    res.json({
      data: inspections,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  
});


// READ ONE
const getInspectionById = catchAsyncError(async (req, res) => {
    const inspection = await Inspection.findById(req.params.id).populate("project_id created_by current_status.user_id");
    if (!inspection) return next(new ErrorHandler("Not Found", 404));
    res.json(inspection);
});

// UPDATE
const updateInspection = catchAsyncError(async (req, res) => {
    const updated = await Inspection.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });
    if (!updated) return next(new ErrorHandler("Not Found", 404));
    res.json(updated);
});

// DELETE
const deleteInspection = async (req, res) => {
  try {
    const deleted = await Inspection.findByIdAndDelete(req.params.id);
    if (!deleted) return next(new ErrorHandler("Not Found", 404));
    res.json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createInspection,
  updateInspection,
  getInspectionById,
  getAllInspections,
  deleteInspection
}