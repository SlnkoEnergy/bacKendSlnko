const vendorModells = require("../models/vendor.model");
const axios = require("axios");
const FormData = require("form-data");
const mime = require("mime-types");
const sharp = require("sharp");

const slugify = (str = "") =>
  String(str)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

async function uploadFiles(files, folderPath) {
  const uploaded = [];

  for (const file of files || []) {
    const origMime =
      file.mimetype ||
      mime.lookup(file.originalname) ||
      "application/octet-stream";
    const origExt =
      mime.extension(origMime) ||
      (file.originalname.split(".").pop() || "").toLowerCase();

    let outBuffer = file.buffer;
    let outExt = origExt;
    let outMime = origMime;

    if (origMime.startsWith("image/")) {
      let target = ["jpeg", "jpg", "png", "webp"].includes(origExt)
        ? origExt
        : "jpeg";
      if (target === "jpg") target = "jpeg";

      if (target === "jpeg") {
        outBuffer = await sharp(outBuffer).jpeg({ quality: 40 }).toBuffer();
        outExt = "jpg";
        outMime = "image/jpeg";
      } else if (target === "png") {
        outBuffer = await sharp(outBuffer)
          .png({ compressionLevel: 9 })
          .toBuffer();
        outExt = "png";
        outMime = "image/png";
      } else if (target === "webp") {
        outBuffer = await sharp(outBuffer).webp({ quality: 40 }).toBuffer();
        outExt = "webp";
        outMime = "image/webp";
      }
    }

    const base = file.originalname.replace(/\.[^/.]+$/, "");
    const finalName = `${base}.${outExt}`;

    const form = new FormData();
    form.append("file", outBuffer, {
      filename: finalName,
      contentType: outMime,
    });

    const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(
      folderPath
    )}`;

    const resp = await axios.post(uploadUrl, form, {
      headers: {
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const data = resp.data;
    const url =
      Array.isArray(data) && data.length > 0
        ? data[0]
        : data.url || data.fileUrl || (data.data && data.data.url) || null;

    if (url) uploaded.push({ name: finalName, url });
    else console.warn(`No URL returned for ${finalName}`);
  }

  return uploaded;
}

// --- Main handler
const addVendor = async function addVendor(req, res) {
  try {
    let data = req.body?.data ?? req.body;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_e) {}
    }
    if (!data || typeof data !== "object") {
      return res.status(400).json({ msg: "Invalid payload." });
    }
    const rawName = (data.name || "").trim();

    if (!rawName) {
      return res.status(400).json({ msg: "Vendor name is required." });
    }

    const vendorExist = await vendorModells.findOne({ name: rawName });
    if (vendorExist) {
      return res.status(400).json({ msg: "Vendor already exists!" });
    }

    const safeName = slugify(rawName);
    const folderPath = `vendor/${safeName}`;

    let profileImageUrl = "";
    if (req.files && req.files.length > 0) {
      const uploaded = await uploadFiles(req.files, folderPath);
      profileImageUrl = uploaded?.[0]?.url || "";
    }

    const vendorDoc = {
      ...data,
      name: rawName,
      profile_image: profileImageUrl || data.profile_image || "",
    };

    const vendor = new vendorModells(vendorDoc);
    await vendor.save();

    return res.status(200).json({
      msg: "Vendor added successfully",
      data: vendor,
    });
  } catch (error) {
    console.error("addVendor error:", error);
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
