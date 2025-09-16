const purchaseOrderModells = require("../models/purchaseorder.model");
const recoveryPurchaseOrder = require("../models/recoveryPurchaseOrderModells");
const pohisttoryModells = require("../models/pohistoryModells");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");
const { default: mongoose } = require("mongoose");
const materialCategoryModells = require("../models/materialcategory.model");
const {
  getLowerPriorityStatus,
} = require("../utils/updatePurchaseRequestStatus");
const purchaseRequest = require("../models/purchaserequest.model");
const payRequestModells = require("../models/payRequestModells");
const vendorModells = require("../models/vendor.model");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");
const userModells = require("../models/user.model");
const { getnovuNotification } = require("../utils/nouvnotification.utils");
const inspectionModel = require("../models/inspection.model");
const billModel = require("../models/bill.model");
const purchaseorderModel = require("../models/purchaseorder.model");

const addPo = async function (req, res) {
  try {
    const {
      p_id,
      date,
      po_number,
      vendor,
      pr_id,
      pr_no,
      item,
      other = "",
      partial_billing,
      po_basic,
      gst,
      po_value,
      amount_paid,
      comment,
      updated_on,
      initial_status,
      delivery_type,
      isSales,
      sales_Details,
    } = req.body;

    const userId = req.user.userId;

    if (!po_number && initial_status !== "approval_pending")
      return res.status(400).send({ message: "po_number is required." });
    if (!Array.isArray(item) || item.length === 0)
      return res
        .status(400)
        .send({ message: "items array is required and cannot be empty." });

    const exists = await purchaseOrderModells.exists({ po_number });
    if (exists && initial_status !== "approval_pending")
      return res.status(400).send({ message: "PO Number already used!" });

    const itemsSanitized = item.map((it) => ({
      category: it.category ?? null,
      product_name: String(it.product_name ?? ""),
      gst_percent: String(it.gst_percent ?? ""),
      product_make: String(it.product_make ?? ""),
      description: String(it.description ?? ""),
      uom: String(it.uom ?? ""),
      quantity: String(it.quantity ?? "0"),
      cost: String(it.cost ?? "0"),
    }));
    const isSalesFlag = isSales === false;

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const basicTotal = itemsSanitized.reduce(
      (sum, it) => sum + toNum(it.quantity) * toNum(it.cost),
      0
    );
    const gstTotal = itemsSanitized.reduce((sum, it) => {
      const q = toNum(it.quantity);
      const c = toNum(it.cost);
      const g = toNum(it.gst);
      return sum + (q * c * g) / 100;
    }, 0);
    const grandTotal = basicTotal + gstTotal;

    const poBasicStr =
      po_basic != null ? String(po_basic) : basicTotal.toFixed(2);
    const gstStr = gst != null ? String(gst) : gstTotal.toFixed(2);
    const poValueNum =
      typeof po_value === "number"
        ? po_value
        : toNum(po_value ?? grandTotal.toFixed(2));

    const newPO = new purchaseOrderModells({
      p_id,
      po_number,
      date,
      item: itemsSanitized,
      other,
      vendor,
      submitted_By: userId,
      pr: {
        pr_id: pr_id ? new mongoose.Types.ObjectId(pr_id) : undefined,
        pr_no: pr_no,
      },
      partial_billing,
      po_basic: poBasicStr,
      gst: gstStr,
      po_value: poValueNum,
      amount_paid: typeof amount_paid === "number" ? amount_paid : undefined,
      comment,
      updated_on,
      etd: null,
      delivery_date: null,
      dispatch_date: null,
      material_ready_date: null,
      delivery_type,
      ...(isSalesFlag ? { isSales: false } : {}),
      ...(isSalesFlag && Array.isArray(sales_Details) ? { sales_Details } : {}),
    });

    newPO.status_history.push({
      status: initial_status,
      remarks: "",
      user_id: userId,
    });

    await newPO.save();

    res.status(200).send({
      message: "Purchase Order has been added successfully!",
      newPO,
    });
  } catch (error) {
    console.error("addPo error:", error);
    res
      .status(500)
      .send({ message: "An error occurred while processing your request." });
  }
};

const editPO = async function (req, res) {
  try {
    const id = req.params.id || req.params._id;
    if (!id) return res.status(400).json({ msg: "id is required" });
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ msg: "invalid id" });
    }

    // Get current PO
    const existing = await purchaseOrderModells.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ msg: "PO not found" });
    }

    const currStatus = existing?.current_status?.status;

    const bodyData =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data || req.body;

    const payload = { ...bodyData };

    if (Array.isArray(payload.items) && !Array.isArray(payload.item)) {
      payload.item = payload.items;
      delete payload.items;
    }

    if ("attachments" in payload) {
      delete payload.attachments;
    }
    const uploadedAttachments = [];

    if (req.files && req.files.length) {
      const safePoNumber = String(existing.po_number || "").replace(/ /g, "_");
      const folderPath = `SCM/PO/${safePoNumber}`;

      for (const file of req.files) {
        const attachment_name = file.originalname || "file";
        const mimeType =
          mime.lookup(attachment_name) ||
          file.mimetype ||
          "application/octet-stream";
        let buffer = file.buffer;

        if (mimeType.startsWith("image/")) {
          const ext = mime.extension(mimeType);
          try {
            if (ext === "jpeg" || ext === "jpg") {
              buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
            } else if (ext === "png") {
              buffer = await sharp(buffer).png({ quality: 40 }).toBuffer();
            } else if (ext === "webp") {
              buffer = await sharp(buffer).webp({ quality: 40 }).toBuffer();
            } else {
              buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
            }
          } catch (e) {
            console.warn(
              "Image compression failed, using original buffer:",
              e?.message
            );
          }
        }

        // Upload the file
        const form = new FormData();
        form.append("file", buffer, {
          filename: attachment_name,
          contentType: mimeType,
        });

        const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(folderPath)}`;

        let url = null;
        try {
          const response = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });

          const respData = response.data;
          // Common shapes you used in createExpense
          url = Array.isArray(respData) && respData.length > 0
            ? respData[0]
            : respData.url ||
            respData.fileUrl ||
            (respData.data && respData.data.url) ||
            null;

        } catch (e) {
          console.error("Upload failed for:", attachment_name, e?.message);
        }

        if (url) {
          uploadedAttachments.push({
            attachment_url: url,
            attachment_name,
          });
        } else {
          console.warn(`No URL found for uploaded file ${attachment_name}`);
        }
      }
    }

    const updateOps = {
      $set: { ...payload },
    };

    if (currStatus === "approval_rejected") {
      updateOps.$push = {
        status_history: {
          status: "approval_pending",
          remarks: "",
          user_id: req.user.userId,
        },
      };
    }

    if (uploadedAttachments.length) {
      if (!updateOps.$push) updateOps.$push = {};
      updateOps.$push.attachments = { $each: uploadedAttachments };
    }

    const update = await purchaseOrderModells
      .findByIdAndUpdate(id, updateOps, { new: true })
      .lean();

    const pohistory = {
      po_number: update.po_number,
      offer_Id: update.offer_Id,
      date: update.date,
      item: update.item,
      other: update.other,
      po_value: update.po_value,
      total_advance_paid: update.total_advance_paid,
      po_balance: update.po_balance,
      vendor: update.vendor,
      partial_billing: update.partial_billing,
      amount_paid: update.amount_paid,
      comment: update.comment,
      po_basic: update.po_basic,
      gst: update.gst,
      updated_on: new Date().toISOString(),
      submitted_By: update.submitted_By,
      delivery_type: update.delivery_type,
      attachments: update.attachments || [],
    };

    await pohisttoryModells.create(pohistory);

    return res.status(200).json({
      msg: "PO updated successfully",
      data: update,
    });
  } catch (error) {
    console.error("editPO error:", error);
    return res
      .status(500)
      .json({ msg: "Internal Server error", error: error.message });
  }
};

//Get-Purchase-Order
const getPO = async function (req, res) {
  try {
    const id = req.params._id;
    let data = await purchaseOrderModells.findById(id).lean();
    if (!data) return res.status(404).json({ message: "PO not found" });

    const isObjectId = mongoose.Types.ObjectId.isValid(data.item);

    if (isObjectId) {
      const material = await materialCategoryModells
        .findById(data.item)
        .select("name");
      data.item = material?.name || null;
    }
    res.status(200).json({ msg: "PO Detail", data });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving PO", error: error.message });
  }
};

//get PO History
const getpohistory = async function (req, res) {
  try {
    const data = await pohisttoryModells.find().lean();

    const updatedData = await Promise.all(
      data.map(async (entry) => {
        const isObjectId = mongoose.Types.ObjectId.isValid(entry.item);
        if (isObjectId) {
          const material = await materialCategoryModells
            .findById(entry.item)
            .select("name");
          return {
            ...entry,
            item: material?.name || null,
          };
        } else {
          return {
            ...entry,
            item: entry.item,
          };
        }
      })
    );

    res.status(200).json({ msg: "All PO History", data: updatedData });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching PO history", error: error.message });
  }
};

// get-purchase-order-by p_id
const getPOByPONumber = async (req, res) => {
  try {
    const { po_number, _id } = req.query;

    if (!po_number && !_id) {
      return res.status(400).json({ msg: "po number or id is required" });
    }

    let query = {};
    if (po_number && _id) {
      query = {
        $or: [
          { po_number },
          {
            _id: mongoose.isValidObjectId(_id)
              ? new mongoose.Types.ObjectId(_id)
              : _id,
          },
        ],
      };
    } else if (po_number) {
      query = { po_number };
    } else if (_id) {
      query = {
        _id: mongoose.isValidObjectId(_id)
          ? new mongoose.Types.ObjectId(_id)
          : _id,
      };
    }

    const poDoc = await purchaseOrderModells
      .findOne(query)
      .populate("submitted_By", "_id name")
      .lean();

    if (!poDoc) {
      return res.status(404).json({ msg: "Purchase Order not found" });
    }

    // Handle both `item` and `items`
    const itemsArr = Array.isArray(poDoc?.items)
      ? poDoc.items
      : Array.isArray(poDoc?.item)
        ? poDoc.item
        : [];

    if (itemsArr.length) {
      const catIdSet = new Set();
      for (const it of itemsArr) {
        const cat = it?.category;
        if (!cat) continue;

        if (
          typeof cat === "object" &&
          cat?._id &&
          mongoose.isValidObjectId(cat._id)
        ) {
          catIdSet.add(String(cat._id));
        } else if (mongoose.isValidObjectId(cat)) {
          catIdSet.add(String(cat));
        }
      }

      // Fetch missing category names
      const catDocs = catIdSet.size
        ? await materialCategoryModells
          .find({ _id: { $in: Array.from(catIdSet) } })
          .select({ name: 1 })
          .lean()
        : [];

      const catMap = new Map(
        catDocs.map((c) => [String(c._id), { _id: c._id, name: c.name }])
      );

      const mappedItems = itemsArr.map((it) => {
        const cat = it?.category;
        if (cat && typeof cat === "object" && cat._id) {
          const key = String(cat._id);
          return catMap.has(key) ? { ...it, category: catMap.get(key) } : it;
        }
        if (cat && mongoose.isValidObjectId(cat)) {
          const key = String(cat);
          return catMap.has(key) ? { ...it, category: catMap.get(key) } : it;
        }
        return it;
      });

      if (Array.isArray(poDoc.items)) poDoc.items = mappedItems;
      if (Array.isArray(poDoc.item)) poDoc.item = mappedItems;
    }

    const catIdSet = new Set();
    for (const it of itemsArr) {
      const cat = it?.category;
      if (!cat) continue;


      if (
        typeof cat === "object" &&
        cat?._id &&
        mongoose.isValidObjectId(cat._id)
      ) {
        catIdSet.add(String(cat._id));
      } else if (mongoose.isValidObjectId(cat)) {
        catIdSet.add(String(cat));
      }
    }

    // Fetch missing category names
    const catDocs = catIdSet.size
      ? await materialCategoryModells
        .find({ _id: { $in: Array.from(catIdSet) } })
        .select({ name: 1 })
        .lean()
      : [];

    const catMap = new Map(
      catDocs.map((c) => [String(c._id), { _id: c._id, name: c.name }])
    );

    const mappedItems = itemsArr.map((it) => {
      const cat = it?.category;
      if (cat && typeof cat === "object" && cat._id) {
        const key = String(cat._id);
        return catMap.has(key) ? { ...it, category: catMap.get(key) } : it;
      }
      if (cat && mongoose.isValidObjectId(cat)) {
        const key = String(cat);
        return catMap.has(key) ? { ...it, category: catMap.get(key) } : it;
      }
      return it;
    })
    const inspectionCount = await inspectionModel.countDocuments({
      po_number: poDoc.po_number,
    });

    const updatedPO = {
      ...poDoc,
      inspectionCount,
    };

    return res.status(200).json({
      msg: "Purchase Order fetched successfully",
      data: updatedPO,
    });
  } catch (error) {
    console.error("Error in getPOByPONumber:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getPOById = async (req, res) => {
  try {
    const { p_id, _id } = req.body;

    const query = {};
    if (_id) query._id = _id;
    if (p_id) query.p_id = p_id;

    const data = await purchaseOrderModells.findOne(query).lean();

    if (!data) {
      return res.status(404).json({ msg: "Purchase Order not found" });
    }

    res.status(200).json({ msg: "Purchase Order found", data });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving PO", error: error.message });
  }
};

const getPOHistoryById = async (req, res) => {
  try {
    const { po_number, _id } = req.query;

    const query = {};
    if (_id) query._id = _id;
    if (po_number) query.po_number = po_number;

    const data = await pohisttoryModells.findOne(query).lean();

    if (!data) {
      return res.status(404).json({ msg: "Purchase Order not found" });
    }

    res.status(200).json({ msg: "Purchase Order found", data });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving PO", error: error.message });
  }
};

//get ALLPO
const getallpo = async function (req, res) {
  try {
    const updatedData = await purchaseOrderModells
      .find()
      .populate("item.category", "_id name");

    res.status(200).json({ msg: "All PO", data: updatedData });
  } catch (error) {
    res.status(500).json({ msg: "Error fetching data", error: error.message });
  }
};

const getallpodetail = async function (req, res) {
  try {
    const { po_number } = req.query;

    // If no po_number, return list of POs
    if (!po_number) {
      const poList = await purchaseOrderModells
        .find({}, { po_number: 1, _id: 0 })
        .lean();

      return res.status(200).json({
        po_numbers: poList.map((po) => po.po_number),
      });
    }

    // Load PO
    const selectedPo = await purchaseOrderModells.findOne({ po_number }).lean();
    if (!selectedPo) {
      return res.status(404).json({ message: "PO not found" });
    }

    // Total po_value (handles string/number)
    const poAggregate = await purchaseOrderModells.aggregate([
      { $match: { po_number } },
      {
        $group: {
          _id: "$po_number",
          total_po_value: { $sum: { $toDouble: "$po_value" } },
        },
      },
    ]);
    const po_value = poAggregate.length ? poAggregate[0].total_po_value : 0;

    // ---- Resolve item names from MaterialCategory ----
    // Collect category ObjectIds from item[]
    const categoryIds = [];
    if (Array.isArray(selectedPo.item)) {
      for (const it of selectedPo.item) {
        const id = it?.category;
        if (id) {
          if (id instanceof mongoose.Types.ObjectId) {
            categoryIds.push(id);
          } else if (
            typeof id === "string" &&
            mongoose.Types.ObjectId.isValid(id)
          ) {
            categoryIds.push(new mongoose.Types.ObjectId(id));
          }
        }
      }
    }

    // Find category names for collected ids
    let categoryNameById = new Map();
    if (categoryIds.length) {
      const cats = await materialCategoryModells
        .find({ _id: { $in: categoryIds } }, { name: 1 })
        .lean();
      for (const c of cats) {
        if (c?._id && c?.name) categoryNameById.set(String(c._id), c.name);
      }
    }

    // Build item string: prefer category.name, else product_name, else ""
    const itemNames = [];
    if (Array.isArray(selectedPo.item)) {
      for (const it of selectedPo.item) {
        let name = "";
        const catId = it?.category;
        if (catId) {
          const key = String(
            catId instanceof mongoose.Types.ObjectId
              ? catId
              : new mongoose.Types.ObjectId(catId)
          );
          name = categoryNameById.get(key) || "";
        }
        if (!name && typeof it?.product_name === "string") {
          name = it.product_name.trim();
        }
        if (name) itemNames.push(name);
      }
    }
    // Remove duplicates while preserving order
    const seen = new Set();
    const deduped = itemNames.filter((n) =>
      seen.has(n) ? false : (seen.add(n), true)
    );
    const itemName = deduped.join(", ");

    // ---- Vendor details (unchanged) ----
    let vendorDetails = {};
    if (selectedPo.vendor) {
      const matchedVendor = await vendorModells
        .findOne({ name: selectedPo.vendor })
        .lean();
      if (matchedVendor) {
        vendorDetails = {
          benificiary: matchedVendor.name,
          acc_number: matchedVendor.Account_No,
          ifsc: matchedVendor.IFSC_Code,
          branch: matchedVendor.Bank_Name,
        };
      }
    }

    // ---- Approved payments sum ----
    const approvedPayments = await payRequestModells.aggregate([
      { $match: { po_number, approved: "Approved" } },
      {
        $group: {
          _id: "$po_number",
          totalAdvancePaid: { $sum: { $toDouble: "$amount_paid" } },
        },
      },
    ]);
    const totalAdvancePaid = approvedPayments.length
      ? approvedPayments[0].totalAdvancePaid
      : 0;

    const po_balance = po_value - totalAdvancePaid;

    // ---- Final response (same keys) ----
    return res.status(200).json({
      p_id: selectedPo.p_id,
      po_number: selectedPo.po_number,
      po_value,
      vendor: selectedPo.vendor,
      item: itemName, // resolved MaterialCategory names (fallback to product_name)
      total_advance_paid: totalAdvancePaid,
      po_balance,
      ...vendorDetails,
    });
  } catch (err) {
    console.error("Error fetching purchase order:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const getallpoNumber = async function (req, res) {
  try {
    const po_numbers = await purchaseOrderModells.find();

    res.status(200).json({ msg: "All Po-Numbers", data: po_numbers });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Internal Server Error", error: error.message });
  }
};

const getPaginatedPo = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const skip = (page - 1) * pageSize;

    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();
    const filter = (req.query.filter || "").trim();

    const parseCustomDate = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      return isNaN(d) ? null : d;
    };

    const createdFrom = parseCustomDate(req.query.createdFrom);
    const createdTo = parseCustomDate(req.query.createdTo);
    const etdFrom = parseCustomDate(req.query.etdFrom);
    const etdTo = parseCustomDate(req.query.etdTo);
    const deliveryFrom = parseCustomDate(req.query.deliveryFrom);
    const deliveryTo = parseCustomDate(req.query.deliveryTo);

    const itemSearch =
      typeof req.query.itemSearch === "string" ? req.query.itemSearch.trim() : "";
    const itemSearchRegex = itemSearch ? new RegExp(itemSearch, "i") : null;

    const andClauses = [];

    if (search) {
      const searchRegex = new RegExp(search, "i");
      andClauses.push({
        $or: [
          { p_id: { $regex: searchRegex } },
          { po_number: { $regex: searchRegex } },
          { vendor: { $regex: searchRegex } },
        ],
      });
    }

    if (req.query.item_id) {
      const idStr = String(req.query.item_id);
      const maybeId = mongoose.isValidObjectId(idStr)
        ? new mongoose.Types.ObjectId(idStr)
        : idStr;
      andClauses.push({ "item.category": maybeId });
    }

    if (req.query.pr_id) {
      const idStr = String(req.query.pr_id);
      const maybeId = mongoose.isValidObjectId(idStr)
        ? new mongoose.Types.ObjectId(idStr)
        : idStr;
      andClauses.push({ "pr.pr_id": maybeId });
    }

    const baseEq = {
      ...(req.query.project_id && { p_id: req.query.project_id }),

      // created date range uses dateObj (computed below)
      ...(createdFrom || createdTo
        ? {
          dateObj: {
            ...(createdFrom ? { $gte: createdFrom } : {}),
            ...(createdTo ? { $lte: createdTo } : {}),
          },
        }
        : {}),

      ...(etdFrom || etdTo
        ? {
          etd: {
            ...(etdFrom ? { $gte: etdFrom } : {}),
            ...(etdTo ? { $lte: etdTo } : {}),
          },
        }
        : {}),

      ...(deliveryFrom || deliveryTo
        ? {
          delivery_date: {
            ...(deliveryFrom ? { $gte: deliveryFrom } : {}),
            ...(deliveryTo ? { $lte: deliveryTo } : {}),
          },
        }
        : {}),
    };

    if (filter) {
      switch (filter) {
        case "Approval Pending":
          baseEq["current_status.status"] = "approval_pending";
          break;
        case "Approval Done":
          baseEq["current_status.status"] = "approval_done";
          break;
        case "ETD Pending":
          baseEq["current_status.status"] = "po_created";
          baseEq["etd"] = null;
          break;
        case "ETD Done":
          baseEq["current_status.status"] = "po_created";
          baseEq["etd"] = { $ne: null };
          break;
        case "Material Ready":
          baseEq["current_status.status"] = "material_ready";
          baseEq["material_ready_date"] = { $ne: null };
          break;
        case "Ready to Dispatch":
          baseEq["current_status.status"] = "ready_to_dispatch";
          baseEq["dispatch_date"] = { $ne: null };
          break;
        case "Out for Delivery":
          baseEq["current_status.status"] = "out_for_delivery";
          break;
        case "Delivered":
          baseEq["current_status.status"] = "delivered";
          break;
        case "Short Quantity":
          matchStage["current_status.status"] = "short_quantity";
          break;
        case "Partially Delivered":
          baseEq["current_status.status"] = "partially_delivered";
          break;
        default:
          break;
      }
    }

    const preMatch = andClauses.length ? { $and: andClauses, ...baseEq } : baseEq;

    // Reusable first stage: safe compute dateObj from possibly empty/invalid strings
    const safeDateObjStage = {
      $addFields: {
        dateObj: {
          $switch: {
            branches: [
              // Parse only when it's a non-empty string
              {
                case: {
                  $and: [
                    { $eq: [{ $type: "$date" }, "string"] },
                    { $gt: [{ $strLenCP: "$date" }, 0] },
                  ],
                },
                then: {
                  $dateFromString: {
                    dateString: "$date",
                    format: "%Y-%m-%d", // change if your stored format differs
                    onError: null,
                    onNull: null,
                  },
                },
              },
              // Already a BSON Date
              { case: { $eq: [{ $type: "$date" }, "date"] }, then: "$date" },
            ],
            default: null,
          },
        },
      },
    };

    const pipeline = [
      safeDateObjStage,

      { $match: preMatch },

      {
        $addFields: {
          total_billed_num: {
            $convert: { input: "$total_billed", to: "double", onError: 0, onNull: 0 },
          },
          po_value_num: {
            $convert: { input: "$po_value", to: "double", onError: 0, onNull: 0 },
          },
        },
      },

      {
        $addFields: {
          partial_billing: {
            $cond: [
              { $gte: ["$total_billed_num", "$po_value_num"] },
              "Fully Billed",
              "Bill Pending",
            ],
          },
        },
      },

      ...(status ? [{ $match: { partial_billing: status } }] : []),

      {
        $lookup: {
          from: "materialcategories",
          localField: "item.category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      {
        $addFields: {
          resolvedCatNames: {
            $map: { input: "$categoryData", as: "c", in: "$$c.name" },
          },
        },
      },
      ...(itemSearch
        ? [{ $match: { resolvedCatNames: { $elemMatch: { $regex: itemSearchRegex } } } }]
        : []),

     

      {
        $addFields: {
          po_number: { $toString: "$po_number" },
          po_value: {
            $convert: { input: "$po_value", to: "double", onError: 0, onNull: 0 },
          },
          total_advance_paid:{
            $convert:{ input: "$total_advance_paid", to:"double", onError:0, onNull:0 }
          }
        },
      },

       { $sort: { createdAt: -1, po_number: 1 } },
      { $skip: skip },
      { $limit: pageSize },

      
      {
        $project: {
          _id: 1,
          po_number: 1,
          p_id: 1,
          vendor: 1,
          date: 1,
          po_value: 1,
          po_basic: 1,
          gst: 1,
          amount_paid: "$total_advance_paid",
          total_billed: 1,
          partial_billing: 1,
          etd: 1,
          delivery_date: 1,
          dispatch_date: 1,
          material_ready_date: 1,
          current_status: 1,
          status_history: 1,
          category_names: "$resolvedCatNames",
          pr_id: "$pr.pr_id",
          pr_no: "$pr.pr_no",
        },
      },
    ];

    const countPipeline = [
      safeDateObjStage,
      { $match: preMatch },
      {
        $addFields: {
          total_billed_num: {
            $convert: { input: "$total_billed", to: "double", onError: 0, onNull: 0 },
          },
          po_value_num: {
            $convert: { input: "$po_value", to: "double", onError: 0, onNull: 0 },
          },
        },
      },
      {
        $addFields: {
          partial_billing: {
            $cond: [
              { $gte: ["$total_billed_num", "$po_value_num"] },
              "Fully Billed",
              "Bill Pending",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "materialcategories",
          localField: "item.category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      {
        $addFields: {
          resolvedCatNames: {
            $map: { input: "$categoryData", as: "c", in: "$$c.name" },
          },
        },
      },
      ...(itemSearch
        ? [{ $match: { resolvedCatNames: { $elemMatch: { $regex: itemSearchRegex } } } }]
        : []),
      ...(status ? [{ $match: { partial_billing: status } }] : []),
      { $count: "total" },
    ];

    const [result, countResult] = await Promise.all([
      purchaseOrderModells.aggregate(pipeline),
      purchaseOrderModells.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total || 0;

    const formatDate = (date) =>
      date
        ? new Date(date)
            .toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            .replace(/ /g, "/")
        : "";

    const data = result.map((it) => ({ ...it, date: formatDate(it.date) }));

    return res.status(200).json({
      msg: "All PO Detail With PO Number",
      meta: { total, page, pageSize, count: data.length },
      data,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      msg: "Error retrieving POs with category data",
      error: err.message,
    });
  }
};


const getExportPo = async (req, res) => {
  try {
    const { from, to, export: exportAll } = req.query;

    let matchStage = {};
    const parseDate = (str) => {
      const [day, month, year] = str.split("-").map(Number);
      return new Date(year, month - 1, day);
    };

    if (exportAll !== "all") {
      if (!from || !to) {
        return res.status(400).json({ msg: "from and to dates are required" });
      }

      const fromDate = parseDate(from);
      const toDate = parseDate(to);
      toDate.setHours(23, 59, 59, 999);

      matchStage = {
        date: {
          $gte: fromDate,
          $lte: toDate,
        },
      };
    }

    const rawData = await purchaseOrderModells.find(matchStage).lean();

    const pipeline = [
      { $match: matchStage },

      {
        $addFields: {
          po_number: { $toString: "$po_number" },
          po_value: { $toDouble: "$po_value" },
        },
      },

      {
        $lookup: {
          from: "payrequests",
          let: { poNumber: "$po_number" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: "$po_number" }, "$$poNumber"] },
                    { $eq: ["$approved", "Approved"] },
                    { $ne: ["$utr", null] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
          ],
          as: "approvedPayments",
        },
      },

      {
        $lookup: {
          from: "biildetails",
          localField: "po_number",
          foreignField: "po_number",
          as: "billData",
        },
      },

      {
        $addFields: {
          amount_paid: {
            $sum: {
              $map: {
                input: "$approvedPayments",
                as: "pay",
                in: {
                  $convert: {
                    input: "$$pay.amount_paid",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          total_billed: {
            $sum: {
              $map: {
                input: "$billData",
                as: "b",
                in: {
                  $convert: {
                    input: "$$b.bill_value",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        },
      },

      {
        $addFields: {
          partial_billing: {
            $cond: {
              if: { $lt: ["$total_billed", "$po_value"] },
              then: "Bill Pending",
              else: "Fully Billed",
            },
          },
          billingTypes: {
            $cond: {
              if: { $gt: [{ $size: "$billData" }, 0] },
              then: {
                $let: {
                  vars: {
                    sorted: {
                      $slice: [
                        {
                          $filter: {
                            input: {
                              $sortArray: {
                                input: "$billData",
                                sortBy: { updatedAt: -1 },
                              },
                            },
                            as: "d",
                            cond: { $ne: ["$$d.type", null] },
                          },
                        },
                        1,
                      ],
                    },
                  },
                  in: { $arrayElemAt: ["$$sorted.type", 0] },
                },
              },
              else: "-",
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          po_number: 1,
          p_id: 1,
          vendor: 1,
          item: 1,
          date: 1,
          po_value: 1,
          amount_paid: 1,
          total_billed: 1,
          partial_billing: 1,
          type: "$billingTypes",
        },
      },
    ];

    const result = await purchaseOrderModells.aggregate(pipeline);

    // Format fields
    const formatDate = (date) =>
      date
        ? new Date(date)
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .replace(/ /g, "/")
        : "";

    const formatted = result.map((item) => ({
      ...item,
      date: formatDate(item.date),
      po_value: Number(item.po_value)?.toLocaleString("en-IN"),
      amount_paid: Number(item.amount_paid)?.toLocaleString("en-IN"),
      total_billed: Number(item.total_billed)?.toLocaleString("en-IN"),
    }));

    const fields = [
      "p_id",
      "po_number",
      "vendor",
      "item",
      "date",
      "po_value",
      "amount_paid",
      "total_billed",
      "partial_billing",
      "type",
    ];
    const parser = new Parser({ fields, quote: '"' });
    const csv = parser.parse(formatted);

    res.header("Content-Type", "text/csv");
    res.attachment("PO_Export.csv");
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Export failed", error: err.message });
  }
};

const updateSalesPO = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body || {};

    if (!id) return res.status(400).json({ message: "_id is required" });
    if (!remarks || String(remarks).trim() === "") {
      return res
        .status(400)
        .json({ message: "Remarks are required to update Sales PO" });
    }

    const po = await purchaseOrderModells.findById(id);
    if (!po) return res.status(404).json({ message: "PO not found" });
    // if (!po.isSales)
    //   return res.status(400).json({ message: "This PO is not a Sales PO" });

    const safePo = (s) =>
      String(s || "").trim().replace(/[\/\s]+/g, "_");
    const folderPath = `Account/PO/${safePo(po.po_number)}`;
    const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(folderPath)}`;

    const files = req.file
      ? [req.file]
      : Array.isArray(req.files)
      ? req.files
      : req.files && typeof req.files === "object"
      ? Object.values(req.files).flat()
      : [];

    const uploadedAttachments = [];

    for (const file of files) {
      const attachment_name = file.originalname || "file";
      const mimeType =
        mime.lookup(attachment_name) ||
        file.mimetype ||
        "application/octet-stream";

      let buffer =
        file.buffer || (file.path ? fs.readFileSync(file.path) : null);
      if (!buffer) continue;

      if (mimeType.startsWith("image/")) {
        try {
          const ext = mime.extension(mimeType);
          if (ext === "jpeg" || ext === "jpg")
            buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
          else if (ext === "png")
            buffer = await sharp(buffer).png({ quality: 40 }).toBuffer();
          else if (ext === "webp")
            buffer = await sharp(buffer).webp({ quality: 40 }).toBuffer();
          else buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        } catch (e) {
          console.warn(
            "Image compression failed, using original buffer:",
            e?.message
          );
        }
      }

      const form = new FormData();
      form.append("file", buffer, {
        filename: attachment_name,
        contentType: mimeType,
      });

      try {
        const resp = await axios.post(uploadUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const data = resp?.data || null;
        const url =
          (Array.isArray(data) && (typeof data[0] === "string" ? data[0] : data[0]?.url)) ||
          data?.url ||
          data?.fileUrl ||
          data?.data?.url ||
          null;

        if (url) {
          uploadedAttachments.push({ attachment_url: url, attachment_name });
        } else {
          console.warn(`No URL returned for ${attachment_name}`);
        }
      } catch (e) {
        console.error(
          "Upload failed:",
          attachment_name,
          e.response?.status,
          e.response?.data || e.message
        );
      }
    }

    const userId = req.user?.userId || req.user?._id || null;
    if (!Array.isArray(po.sales_Details)) po.sales_Details = [];
    po.sales_Details.push({
      remarks: String(remarks).trim(),
      attachments: uploadedAttachments,
      converted_at: new Date(),
      user_id: userId,
    });

    po.isSales = true;

 
    po.markModified("sales_Details");

    await po.save();

    return res.status(200).json({
      message: uploadedAttachments.length
        ? "Sales PO updated with attachments (isSales=true)"
        : "Sales PO updated (remarks only, isSales=true)",
      data: po,
    });
  } catch (error) {
    console.error("Error updating Sales PO:", error);
    return res
      .status(500)
      .json({ message: "Error updating Sales PO", error: error.message });
  }
};
//Move-Recovery
const moverecovery = async function (req, res) {
  const { _id } = req.params._id;

  try {
    // Find and delete the item from the main collection
    const deletedItem = await purchaseOrderModells.findOneAndReplace(_id);

    if (!deletedItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Add the deleted item to the recovery collection
    const recoveryItem = new recoveryPurchaseOrder({
      po_number: deletedItem.po_number,
      p_id: deletedItem.p_id,
      date: deletedItem.date,
      item: deletedItem.item,
      other: deletedItem.other,
      po_value: deletedItem.po_value,
      final: deletedItem.final,
      po_balance: deletedItem.po_balance,
      vendor: deletedItem.vendor,
      partial_billing: deletedItem.partial_billing,
      amount_paid: deletedItem.amount_paid,
      comment: deletedItem.comment,
      updated_on: deletedItem.updated_on,
      submitted_By: deletedItem.submitted_By,
    });

    await recoveryItem.save();
    await purchaseOrderModells.deleteOne(_id);

    res.json({
      message: "Item moved to recovery collection successfully",
      item: recoveryItem,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting item" + error });
  }
};

//Export-CSV
const exportCSV = async function (req, res) {
  try {
    let users = await purchaseOrderModells.find().lean();
    if (users.length === 0) {
      return res.status(404).send("No data found to export.");
    }

    const fields = ["p_id", "date", "item", "other", "po_number", " po_value"];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(users);

    const filePath = path.join(__dirname, "exports", "users.csv");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, csv);

    res.download(filePath, "users.csv", (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error while downloading the file.");
      } else {
        console.log("File sent successfully.");
      }
    });
  } catch (error) {
    console.error("Error exporting to CSV:", error);
    res.status(500).send("An error occurred while exporting the data.");
  }
};

// Delete po
const deletePO = async function (req, res) {
  const _id = req.params._id;

  try {
    const data = await purchaseOrderModells.findByIdAndDelete(_id);

    if (!data) {
      return res.status(404).json({ msg: "PO not found" });
    }

    return res.status(200).json({
      msg: "PO deleted successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      msg: "Server error while deleting PO",
      error: error.message,
    });
  }
};

const updateEditandDeliveryDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { etd, delivery_date } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ message: "PR ID and Item ID are required" });
    }

    const updateFields = {};
    if (etd) updateFields["etd"] = etd;
    if (delivery_date) updateFields["delivery_date"] = delivery_date;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const updatedPO = await purchaseOrderModells.findOneAndUpdate(
      { po_number: id },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedPO) {
      return res
        .status(404)
        .json({ message: "Purchase Order or Item not found" });
    }

    res
      .status(200)
      .json({ message: "ETD/Delivery Date updated successfully", updatedPO });
  } catch (error) {
    console.error("Error updating ETD/Delivery Date:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateStatusPO = async (req, res) => {
  try {
    const { status, remarks, id, new_po_number, po_number } = req.body;

    if (!id) return res.status(404).json({ message: "ID is required" });
    if (!status && !remarks) {
      return res
        .status(404)
        .json({ message: "Status and remarks are required" });
    }

    const query = [{ po_number: id }];
    if (mongoose.isValidObjectId(id)) query.push({ _id: id });

    const purchaseOrder = await purchaseOrderModells.findOne({ $or: query });
    if (!purchaseOrder)
      return res.status(404).json({ message: "Purchase Order not found" });

    const incomingPoNumberRaw =
      typeof new_po_number !== "undefined" ? new_po_number : po_number;

    if (incomingPoNumberRaw != null) {
      const incomingPoNumber = String(incomingPoNumberRaw).trim();
      if (!incomingPoNumber) {
        return res.status(400).json({ message: "po_number cannot be empty" });
      }

      const duplicate = await purchaseOrderModells
        .findOne({
          po_number: incomingPoNumber,
          _id: { $ne: purchaseOrder._id },
        })
        .select("_id")
        .lean();

      if (duplicate) {
        return res
          .status(409)
          .json({ message: `PO number "${incomingPoNumber}" already exists` });
      }

      purchaseOrder.po_number = incomingPoNumber;
    }

    purchaseOrder.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });

    if (status === "material_ready") {
      purchaseOrder.material_ready_date = new Date();
    }

    if (status === "ready_to_dispatch") {
      purchaseOrder.dispatch_date = new Date();
    }

    await purchaseOrder.save();

    if (!purchaseOrder?.pr?.pr_id) {
      return res.status(201).json({
        message:
          "Purchase Order Status Updated (no related PR found to evaluate)",
        data: purchaseOrder,
      });
    }

    const pr = await purchaseRequest.findById(purchaseOrder.pr.pr_id).lean();
    if (!pr) {
      return res.status(201).json({
        message:
          "Purchase Order Status Updated (related PR not found to evaluate)",
        data: purchaseOrder,
      });
    }

    const allPOs = await purchaseOrderModells
      .find({ "pr.pr_id": pr._id })
      .lean();

    const updatedItems = await Promise.all(
      (pr.items || []).map(async (item) => {
        const itemIdStr = String(item.item_id);

        const relevantPOs = allPOs.filter((po) => {
          const poItem = po.item;
          if (typeof poItem === "string") return poItem === itemIdStr;
          if (poItem?._id) return String(poItem._id) === itemIdStr;
          return false;
        });

        const allStatuses = relevantPOs
          .map((po) => po.current_status?.status)
          .filter(Boolean);

        if (allStatuses.length === 0) return { ...item };

        const same = allStatuses.every((s) => s === allStatuses[0]);

        return {
          ...item,
          status: same ? allStatuses[0] : getLowerPriorityStatus(allStatuses),
        };
      })
    );

    await purchaseRequest.findByIdAndUpdate(pr._id, { items: updatedItems });
    const sendBy_id = req.user.userId;
    const sendBy_Name = await userModells.findById(sendBy_id);

    // Notification on Status Change to Approval Pending

    if (status === "approval_pending" || status === "approval_done" || status === "approval_rejected" || status === "po_created") {

      let text = "";
      if (status === "approval_pending") text = "Approval Pending";
      if (status === "approval_done") text = "Approval Done";
      if (status === "approval_rejected") text = "Approval Rejected";
      if (status === "po_created") text = "Po Created";

      try {
        const workflow = 'purchase-order';
        let senders = [];

        if (status === "approval_pending" || status === "po_created") {
          senders = await userModells.find({
            department: "CAM"
          }).select('_id').lean().then(users => users.map(u => u._id));
        }
        if (status === "approval_done" || status === "approval_rejected") {
          senders = await userModells.find({
            $or: [
              {
                department: "Projects",
                role: "visitor"
              },

              { department: "SCM" }
            ]

          }).select('_id').lean().then(users => users.map(u => u._id));
        }
        const data = {
          Module: purchaseOrder.p_id,
          sendBy_Name: sendBy_Name.name,
          message: `Purchase Order is now marked as ${text}`,
          link: `/add_po?mode=edit&_id=${purchaseOrder._id}`
        }

        setImmediate(() => {
          getnovuNotification(workflow, senders, data).catch(err =>
            console.error("Notification error:", err)
          );
        });

      } catch (error) {
        console.log(error);
      }
    }
    res.status(201).json({
      message: "Purchase Order Status Updated and PR Item Statuses Evaluated",
      data: purchaseOrder,
    })
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


const getPoBasic = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize, 10) || 10, 1),
      100
    );
    const skip = (page - 1) * pageSize;

    const search = req.query.search?.trim() || "";
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(safeSearch, "i");

    const matchStage = {
      $and: [
        {
          $or: [
            { "current_status.status": { $exists: false } },
            { "current_status.status": null },
            {
              "current_status.status": {
                $nin: ["approval_rejected", "approval_pending"],
              },
            },
          ],
        },
        ...(search
          ? [
            {
              $or: [
                { p_id: { $regex: searchRegex } },
                { po_number: { $regex: searchRegex } },
                { vendor: { $regex: searchRegex } },
              ],
            },
          ]
          : []),
      ],
    };

    const pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $addFields: {
          item: {
            $map: {
              input: {
                $cond: {
                  if: { $isArray: "$item" },
                  then: "$item",
                  else: [],
                },
              },
              as: "it",
              in: {
                product_name: "$$it.product_name",
                uom: "$$it.uom",
                make: "$$it.product_make",
                quantity: {
                  $convert: {
                    input: "$$it.quantity",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                category: {
                  $convert: {
                    input: "$$it.category",
                    to: "objectId",
                    onError: null,
                    onNull: null,
                  },
                },
              },
            },
          },
        },
      },

      {
        $lookup: {
          from: "materialcategories",
          localField: "item.category",
          foreignField: "_id",
          as: "categoryDocs",
        },
      },
      {
        $addFields: {
          items: {
            $map: {
              input: "$item",
              as: "it",
              in: {
                product_name: "$$it.product_name",
                uom: "$$it.uom",
                make: "$$it.make",
                quantity: "$$it.quantity",
                category: {
                  $let: {
                    vars: {
                      matchedCat: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$categoryDocs",
                              as: "cd",
                              cond: { $eq: ["$$cd._id", "$$it.category"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      _id: "$$matchedCat._id",
                      name: "$$matchedCat.name",
                    },
                  },
                },
              },
            },
          },
        },
      },

      {
        $project: {
          _id: 1,
          po_number: 1,
          vendor: 1,
          p_id: 1,
          po_value: {
            $convert: {
              input: "$po_value",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          items: 1,
        },
      },
    ];

    const countPipeline = [{ $match: matchStage }, { $count: "total" }];

    const [data, countResult] = await Promise.all([
      purchaseOrderModells.aggregate(pipeline),
      purchaseOrderModells.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    res.status(200).json({
      msg: "PO basic details fetched successfully",
      data,
      total,
      count: data.length,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        count: data.length,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
    });
  } catch (err) {
    console.error("getPoBasic error:", err);
    res.status(500).json({
      msg: "Error retrieving PO basic details",
      error: err.message,
    });
  }
};

const normalizePo = (v) => String(v || "").trim().toUpperCase();
const checkAndFixAllTotalAdvancePaid = async (req, res) => {
  try {
    const pos = await purchaseorderModel
      .find({})
      .select({ _id: 1, po_number: 1, total_advance_paid: 1 })
      .lean();

    if (!pos.length) {
      return res.json({ ok: true, processed: 0, updated: 0, results: [] });
    }

    const totals = await payRequestModells.aggregate([
      {
        $addFields: {
          po_norm: { $toUpper: { $trim: { input: "$po_number" } } },
          amt_num: {
            $toDouble: {
              $replaceAll: {
                input: { $ifNull: ["$amount_paid", "0"] },
                find: ",",
                replacement: "",
              },
            },
          },
          approved_norm: {
            $toUpper: { $trim: { input: { $ifNull: ["$approved", ""] } } },
          },
          utr_trim: { $trim: { input: { $ifNull: ["$utr", ""] } } },
        },
      },
      {
        $match: {
          approved_norm: "APPROVED",
          utr_trim: { $ne: "" },
        },
      },
      { $group: { _id: "$po_norm", total: { $sum: "$amt_num" } } },
      { $project: { _id: 0, po_norm: "$_id", total: 1 } },
    ]);

    const sumMap = new Map();
    for (const t of totals) sumMap.set(t.po_norm, t.total);

    const ops = [];
    const results = [];
    let updatedCount = 0;

    for (const p of pos) {
      const hasPoKey = Object.prototype.hasOwnProperty.call(p, "po_number");
      const rawPo = hasPoKey ? p.po_number : undefined;
      const poNorm = normalizePo(rawPo);
      const stored = Number(p.total_advance_paid ?? 0);

      const computed =
        !hasPoKey || poNorm.length === 0 ? 0 : Number(sumMap.get(poNorm) ?? 0);

      const EPS = 0.01;
      const diff = +(stored - computed).toFixed(2);
      const matches = Math.abs(diff) <= EPS;

      if (!matches) {
        ops.push({
          updateOne: {
            filter: { _id: p._id },
            update: { $set: { total_advance_paid: computed } },
          },
        });
        updatedCount++;
      }

      results.push({
        po_number_present: hasPoKey,
        po_number: rawPo ?? null,
        stored_before: stored,
        computed_sum: computed,
        diff,
        matches_before: matches,
        updated: !matches,
      });
    }

    if (ops.length) {
      await purchaseorderModel.bulkWrite(ops, { ordered: false });
    }

    return res.json({
      ok: true,
      processed: pos.length,
      updated: updatedCount,
      results,
    });
  } catch (err) {
    console.error("checkAndFixAllTotalAdvancePaid error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error", error: err.message });
  }
};


module.exports = {
  addPo,
  editPO,
  getPO,
  getallpo,
  getPaginatedPo,
  getExportPo,
  exportCSV,
  moverecovery,
  getPOByPONumber,
  getallpoNumber,
  getPOById,
  getallpodetail,
  deletePO,
  getpohistory,
  getPOHistoryById,
  updateEditandDeliveryDate,
  updateStatusPO,
  getPoBasic,
  updateSalesPO,
  checkAndFixAllTotalAdvancePaid
}