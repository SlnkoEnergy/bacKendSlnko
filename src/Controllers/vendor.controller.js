const vendorModells = require("../models/vendor.model");

const addVendor = async function (req, res) {
  try {
    let {
      id,

      name,

      Beneficiary_Name,

      Account_No,

      Bank_Name,

      IFSC_Code,
    } = req.body;

    const vendorexist = await vendorModells.findOne({
      name: name,
    });

    if (vendorexist) {
      return res.status(400).json({ msg: "Vendor already exists!" });
    }
    const add_vendor = new vendorModells({
      id,
      name,

      Beneficiary_Name,

      Account_No,

      Bank_Name,

      IFSC_Code,
    });

    // Save the record to the database
    await add_vendor.save();

    // Send a success response
    return res.status(200).json({
      msg: "Vendor added successfully",
      data: add_vendor,
    });
  } catch (error) {
    res.status(400).json({
      msg: "Error addVendor project",
      error: error.message,
      validationErrors: error.errors, // Show validation errors if any
    });
  }
};

// Get all vendors
const getVendor = async function (req, res) {
  let data = await vendorModells.find();
  res.status(200).json({ msg: "all vendor", data });
};

// Update vendor

const updateVendor = async function (req, res) {
  let _id = req.params._id;
  let updateData = req.body;
  try {
    let update = await vendorModells.findByIdAndUpdate(_id, updateData, {
      new: true,
    });

    if (!update) {
      return res.status(404).json({ msg: "Vendor not found" });
    }

    res.status(200).json({
      msg: "Vendor updated successfully",
      data: update,
    });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
  }
};

// Delete Vendor
const deleteVendor = async function (req, res) {
  let _id = req.params._id;
  try {
    let deleted = await vendorModells.findByIdAndDelete(_id);
    if (!deleted) {
      return res.status(404).json({ msg: "Vendor not found" });
    }
    res.status(200).json({ msg: "Vendor deleted successfully" });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
  }
};

const getVendorDropwdown = async (req, res) => {
  try {
    const vendors = await vendorModells.find(
      {},
      { name: 1, Beneficiary_Name: 1 }
    );
    res.status(200).json({
      message: "Vendors fetched successfully",
      data: vendors,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getVendorNameSearch = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7 } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 7) || 7, 1), 100);

    const filter = {};
    const term = (search || "").trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      filter.$or = [{ name: regex }, { Beneficiary_Name: regex }];
    }

    const [vendors, total] = await Promise.all([
      vendorModells
        .find(filter, { name: 1, Beneficiary_Name: 1 })
        .sort({ name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      vendorModells.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(total / limitNum), 1);

    res.status(200).json({
      message: "Vendors fetched successfully",
      data: vendors,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasPrev: pageNum > 1,
        hasNext: pageNum < totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  addVendor,
  getVendor,
  updateVendor,
  deleteVendor,
  getVendorDropwdown,
  getVendorNameSearch,
};
