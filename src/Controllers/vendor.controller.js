const vendorModells = require("../models/vendor.model");

const addVendor = async function (req, res) {
  try {
    const { data } = req.body;

    const vendorExist = await vendorModells.findOne({
      name: data.name,
    });
    if (vendorExist) {
      return res.status(400).json({ msg: "Vendor already exists!" });
    }
    const vendor = new vendorModells(data);
    await vendor.save();
    return res.status(200).json({
      msg: "Vendor added successfully",
      data: vendor,
    });
  } catch (error) {
    res.status(400).json({
      msg: "Internal Server Error",
      error: error.message,
    });
  }
};

// Get all vendors
const getVendor = async function (req, res) {
  let data = await vendorModells.find();
  res.status(200).json({ msg: "all vendor", data });
};

const getAllVendors = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { "contact_details.email": { $regex: search, $options: "i" } },
            { "contact_details.phone": { $regex: search, $options: "i" } },
          ],
        }
      : {};
    const total = await vendorModells.countDocuments(query);
    const vendors = await vendorModells
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);
    res.status(200).json({
      msg: "All vendors",
      data: vendors,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
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
    res
      .status(400)
      .json({ msg: "Internal Server error", error: error.message });
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
    res
      .status(400)
      .json({ msg: " Internal Server error", error: error.message });
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
  getAllVendors,
  updateVendor,
  deleteVendor,
  getVendorDropwdown,
  getVendorNameSearch,
};
