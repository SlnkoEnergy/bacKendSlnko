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
const { sendNotification } = require("../utils/sendnotification.utils");
const inspectionModel = require("../models/inspection.model");
const projectModel = require("../models/project.model");
const PohistoryModel = require("../models/Pohistory.model");

function toSafeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
const toNum = (expr) => ({
  $convert: {
    input: {
      $cond: [
        { $eq: [{ $type: expr }, "string"] },
        {
          $replaceAll: {
            input: { $trim: { input: expr } },
            find: ",",
            replacement: "",
          },
        },
        expr,
      ],
    },
    to: "double",
    onError: 0,
    onNull: 0,
  },
});

const aggregationPipeline = [
  {
    $lookup: {
      from: "addmoneys",
      localField: "p_id",
      foreignField: "p_id",
      as: "credits",
    },
  },
  {
    $lookup: {
      from: "subtract moneys",
      localField: "p_id",
      foreignField: "p_id",
      as: "debits",
    },
  },
  {
    $lookup: {
      from: "adjustmentrequests",
      localField: "p_id",
      foreignField: "p_id",
      as: "adjustments",
    },
  },
  {
    $lookup: {
      from: "purchaseorders",
      let: { projectId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } },
      ],
      as: "pos",
    },
  },
  {
    $lookup: {
      from: "payrequests",
      let: { poNumbers: "$pos.po_number" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $in: ["$po_number", "$$poNumbers"] },
                { $eq: ["$approved", "Approved"] },
                { $ne: ["$utr", null] },
                { $ne: ["$utr", ""] },
              ],
            },
          },
        },
      ],
      as: "pays",
    },
  },
  {
    $lookup: {
      from: "biildetails",
      localField: "pos.po_number",
      foreignField: "po_number",
      as: "bills",
    },
  },

  {
    $addFields: {
      totalCredit: {
        $round: [
          {
            $sum: {
              $map: { input: "$credits", as: "c", in: toNum("$$c.cr_amount") },
            },
          },
          2,
        ],
      },
      totalDebit: {
        $round: [
          {
            $sum: {
              $map: { input: "$debits", as: "d", in: toNum("$$d.amount_paid") },
            },
          },
          2,
        ],
      },
      availableAmount: {
        $round: [
          {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: "$credits",
                    as: "c",
                    in: toNum("$$c.cr_amount"),
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: "$debits",
                    as: "d",
                    in: toNum("$$d.amount_paid"),
                  },
                },
              },
            ],
          },
          2,
        ],
      },
      totalAdjustment: {
        $round: [
          {
            $subtract: [
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$adjustments",
                        as: "a",
                        cond: { $eq: ["$$a.adj_type", "Add"] },
                      },
                    },
                    as: "a",
                    in: { $abs: toNum("$$a.adj_amount") },
                  },
                },
              },
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$adjustments",
                        as: "a",
                        cond: { $eq: ["$$a.adj_type", "Subtract"] },
                      },
                    },
                    as: "a",
                    in: { $abs: toNum("$$a.adj_amount") },
                  },
                },
              },
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $addFields: {
      paidAmount: {
        $cond: [
          { $gt: [{ $size: "$pays" }, 0] },
          {
            $sum: {
              $map: { input: "$pays", as: "p", in: toNum("$$p.amount_paid") },
            },
          },
          {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$debits",
                    as: "d",
                    cond: {
                      $and: [
                        { $eq: ["$$d.approved", "Approved"] },
                        { $ne: ["$$d.utr", null] },
                        { $ne: ["$$d.utr", ""] },
                      ],
                    },
                  },
                },
                as: "d",
                in: toNum("$$d.amount_paid"),
              },
            },
          },
        ],
      },
    },
  },
  {
    $addFields: {
      total_po_basic: {
        $round: [
          {
            $sum: {
              $map: {
                input: "$pos",
                as: "po",
                in: {
                  $convert: {
                    input: { $trim: { input: "$$po.po_basic" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          2,
        ],
      },
    },
  },
  {
    $addFields: {
      gst_as_po_basic: {
        $round: [
          {
            $sum: {
              $map: {
                input: "$pos",
                as: "d",
                in: {
                  $convert: {
                    input: { $trim: { input: "$$d.gst" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          2,
        ],
      },
    },
  },
  {
    $addFields: {
      total_po_with_gst: {
        $round: [{ $add: ["$total_po_basic", "$gst_as_po_basic"] }, 2],
      },
    },
  },
  {
    $addFields: {
      totalAmountPaid: {
        $round: [{ $ifNull: ["$paidAmount", 0] }, 2],
      },
      balancePayable: {
        $round: [
          {
            $subtract: [
              { $ifNull: ["$total_po_with_gst", 0] },
              { $ifNull: ["$paidAmount", 0] },
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $addFields: {
      netBalance: {
        $subtract: [
          { $ifNull: ["$totalCredit", 0] },
          {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$debits",
                    as: "d",
                    cond: { $eq: ["$$d.paid_for", "Customer Adjustment"] },
                  },
                },
                as: "d",
                in: toNum("$$d.amount_paid"),
              },
            },
          },
        ],
      },
    },
  },
  {
    $addFields: {
      balanceSlnko: {
        $round: [
          {
            $subtract: [
              {
                $subtract: [
                  { $ifNull: ["$netBalance", 0] },
                  { $ifNull: ["$totalAmountPaid", 0] },
                ],
              },
              { $ifNull: ["$totalAdjustment", 0] },
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $addFields: {
      tcs: {
        $cond: {
          if: { $gt: ["$netBalance", 5000000] },
          then: {
            $round: [
              { $multiply: [{ $subtract: ["$netBalance", 5000000] }, 0.001] },
              0,
            ],
          },
          else: 0,
        },
      },
    },
  },
  {
    $addFields: {
      balanceRequired: {
        $round: [
          {
            $subtract: [
              { $subtract: ["$balanceSlnko", "$balancePayable"] },
              "$tcs",
            ],
          },
          2,
        ],
      },
    },
  },

  {
    $project: {
      _id: 1,
      p_id: 1,
      code: 1,
      customer: 1,
      name: 1,
      p_group: 1,
      totalCredit: 1,
      totalDebit: 1,
      availableAmount: 1,
      totalAdjustment: 1,
      totalAmountPaid: 1,
      balanceSlnko: 1,
      balancePayable: 1,
      balanceRequired: 1,
    },
  },
];

// --- Recompute helper ---
async function recomputeProjectBalanceForPo(pid) {
  const pidNum = toSafeNumber(pid);
  if (!pidNum) return;

  const project = await projectModel
    .findOne({ p_id: pidNum }, { _id: 1 })
    .lean();
  if (!project) return;

  const rows = await projectModel.aggregate([
    { $match: { p_id: pidNum } },
    ...aggregationPipeline,
  ]);
  if (!rows.length) return;

  const r = rows[0];
  await projectBalanceModel.updateOne(
    { p_id: project._id },
    {
      $set: {
        p_id: project._id,
        totalCredited: r.totalCredit || 0,
        totalDebited: r.totalDebit || 0,
        amountAvailable: r.availableAmount || 0,
        totalAdjustment: r.totalAdjustment || 0,
        balanceSlnko: r.balanceSlnko || 0,
        balancePayable: r.balancePayable || 0,
        balanceRequired: r.balanceRequired || 0,
      },
    },
    { upsert: true }
  );
}

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

    let projectObjectId;

    const project = await projectModel.findOne({ code: p_id });
    if (!project) {
      return res.status(404).json("Project Not Found");
    }
    const project_id = project._id;
    const exists = await purchaseOrderModells.exists({ po_number });
    if (exists && initial_status !== "approval_pending")
      return res.status(400).send({ message: "PO Number already used!" });

    const itemsSanitized = item.map((it) => ({
      category: it.category ?? null,
      category_name: it.category_name ?? null,
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
      project_id: project_id,
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
    await recomputeProjectBalanceForPo(newPO.p_id);

    res.status(200).send({
      message: "Purchase Order has been added successfully!",
      newPO,
    });
  } catch (error) {
    res.status(500).send({
      message: "An error occurred while processing your request.",
      error: error.message,
    });
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
    if (payload.project_id != null) {
      const pid = String(payload.project_id).trim();
      if (!mongoose.Types.ObjectId.isValid(pid)) {
        return res.status(400).json({ msg: "invalid project_id" });
      }
      payload.project_id = new mongoose.Types.ObjectId(pid);
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
          url =
            Array.isArray(respData) && respData.length > 0
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
      updateOps.$set.current_status = {
        status: "approval_pending",
        user_id: req.user.userId,
        remarks: "",
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
      p_id: update.p_id,
      project_id: update.project_id,
      attachments: update.attachments || [],
    };

    await pohisttoryModells.create(pohistory);

    await recomputeProjectBalanceForPo(update.p_id);

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
      .populate("vendor", "_id name")
      .lean();

    if (!poDoc) {
      return res.status(404).json({ msg: "Purchase Order not found" });
    }

    let vendor_id = "";
    let vendor_name = "";

    if (poDoc.vendor && typeof poDoc.vendor === "object" && poDoc.vendor._id) {
      vendor_id = String(poDoc.vendor._id);
      vendor_name = poDoc.vendor.name || "";
    } else if (poDoc.vendor && mongoose.isValidObjectId(poDoc.vendor)) {
      const v = await vendorModells
        .findById(poDoc.vendor)
        .select("_id name")
        .lean();
      vendor_id = v?._id ? String(v._id) : String(poDoc.vendor);
      vendor_name = v?.name || "";
    } else if (typeof poDoc.vendor === "string") {
      vendor_name = poDoc.vendor;
      if (poDoc.vendor_id) vendor_id = String(poDoc.vendor_id);
    }

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

    const inspectionCount = await inspectionModel.countDocuments({
      po_number: poDoc.po_number,
    });

    const updatedPO = {
      ...poDoc,
      vendor_id,
      vendor: vendor_name,
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

const generatePurchaseOrderPdf = async (req, res) => {
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
    } else {
      query = {
        _id: mongoose.isValidObjectId(_id)
          ? new mongoose.Types.ObjectId(_id)
          : _id,
      };
    }

  const doc = await purchaseOrderModells
  .findOne(query)
  .populate("vendor", "_id name")
  .select("item date po_number vendor p_id _id") 
  .lean()
  .exec();


    const notes = await PohistoryModel.find({
      subject_type: "purchase_order",
      subject_id: String(doc._id),
      event_type: "note",
      message: { $regex: /^Payment Terms & Conditions/i },
    })
      .select("message")
      .lean();

    if (!doc) {
      return res.status(404).json({ msg: "Purchase order not found" });
    }

    const Purchase = (doc.item || []).map((it) => {
      const qty = Number(it?.quantity) || 0;
      const unit = Number(it?.cost) || 0;
      const taxPct = Number(it?.gst_percent) || 0;
      return {
        category: it?.category_name || "",
        product: it?.product_name || "",
        description: it?.description || "",
        make: it?.make || "",
        quantity: qty,
        unit_price: unit,
        taxes: taxPct,
        amount: qty * unit + (qty * unit * taxPct) / 100,
      };
    });

    const apiUrl = `${process.env.PDF_PORT}/purchase-order/po-sheet`;

    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: {
        Purchase,
        orderNumber: doc.po_number,
        vendorName: doc.vendor,
        Date: doc.date,
        project_id: doc.p_id,
        message: notes[0]?.message,
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"],
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Purchase_order.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (error) {
    console.error("PDF generation error:", error);
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

    if (!po_number) {
      const poList = await purchaseOrderModells
        .find({}, { po_number: 1, _id: 0 })
        .lean();

      return res.status(200).json({
        po_numbers: (poList || []).map((po) => po.po_number),
      });
    }

    const selectedPo = await purchaseOrderModells.findOne({ po_number }).lean();
    if (!selectedPo) {
      return res.status(404).json({ message: "PO not found" });
    }

    const poAggregate = await purchaseOrderModells.aggregate([
      { $match: { po_number } },
      {
        $group: {
          _id: "$po_number",
          total_po_value: {
            $sum: {
              $convert: {
                input: "$po_value",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ]);
    const po_value = poAggregate.length ? poAggregate[0].total_po_value : 0;

    const categoryIds = [];
    if (Array.isArray(selectedPo.item)) {
      for (const it of selectedPo.item) {
        const id = it?.category;
        if (!id) continue;

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

    let categoryNameById = new Map();
    if (categoryIds.length) {
      const cats = await materialCategoryModells
        .find({ _id: { $in: categoryIds } }, { name: 1 })
        .lean();

      for (const c of cats) {
        if (c?._id) categoryNameById.set(String(c._id), c?.name || "");
      }
    }

    const itemNames = [];
    if (Array.isArray(selectedPo.item)) {
      for (const it of selectedPo.item) {
        let name = "";
        const catId = it?.category;
        if (catId) {
          const key =
            catId instanceof mongoose.Types.ObjectId
              ? String(catId)
              : mongoose.Types.ObjectId.isValid(catId)
                ? String(new mongoose.Types.ObjectId(catId))
                : null;

          if (key) name = categoryNameById.get(key) || "";
        }
        if (!name && typeof it?.product_name === "string") {
          const pn = it.product_name.trim();
          if (pn) name = pn;
        }
        if (name) itemNames.push(name);
      }
    }

    const seen = new Set();
    const deduped = itemNames.filter((n) =>
      seen.has(n) ? false : (seen.add(n), true)
    );
    const itemName = deduped.join(", ");

    let vendorDetails = {};
    const vendorId = selectedPo.vendor; // expected to be vendor _id now
    if (vendorId) {
      let vendorDoc = null;

      // Accept both ObjectId and string forms
      if (vendorId instanceof mongoose.Types.ObjectId) {
        vendorDoc = await vendorModells.findById(vendorId).lean();
      } else if (
        typeof vendorId === "string" &&
        mongoose.Types.ObjectId.isValid(vendorId)
      ) {
        vendorDoc = await vendorModells
          .findById(new mongoose.Types.ObjectId(vendorId))
          .lean();
      } else {
        // Fallback (legacy data: stored vendor name)
        vendorDoc = await vendorModells.findOne({ name: vendorId }).lean();
      }

      if (vendorDoc) {
        vendorDetails = {
          vendor_id: String(vendorDoc._id),
          benificiary: vendorDoc.name || "",
          acc_number: vendorDoc.Account_No || vendorDoc.account_no || "",
          ifsc: vendorDoc.IFSC_Code || vendorDoc.ifsc || "",
          // "branch" previously mapped to Bank_Name in your code; keep both just in case
          branch:
            vendorDoc.Branch || vendorDoc.branch || vendorDoc.Bank_Name || "",
          bank_name: vendorDoc.Bank_Name || "",
        };
      }
    }

    const approvedPayments = await payRequestModells.aggregate([
      { $match: { po_number, approved: "Approved" } },
      {
        $group: {
          _id: "$po_number",
          totalAdvancePaid: {
            $sum: {
              $convert: {
                input: "$amount_paid",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ]);
    const totalAdvancePaid = approvedPayments.length
      ? approvedPayments[0].totalAdvancePaid
      : 0;

    const po_balance = po_value - totalAdvancePaid;

    // 7) ---- Final response ----
    return res.status(200).json({
      p_id: selectedPo.p_id,
      po_number: selectedPo.po_number,
      po_value,
      vendor: vendorDetails.benificiary || selectedPo.vendor, // human friendly
      item: itemName,
      total_advance_paid: totalAdvancePaid,
      po_balance,
      ...vendorDetails, // includes vendor_id, acc_number, ifsc, branch, bank_name
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

    // vendor_id (optional)
    const vendorIdParam = (req.query.vendor_id || "").trim();
    let vendorObjectId = null;
    if (vendorIdParam) {
      if (!mongoose.isValidObjectId(vendorIdParam)) {
        return res.status(400).json({ msg: "Invalid vendor_id" });
      }
      vendorObjectId = new mongoose.Types.ObjectId(vendorIdParam);
    }

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
      typeof req.query.itemSearch === "string"
        ? req.query.itemSearch.trim()
        : "";
    const itemSearchRegex = itemSearch ? new RegExp(itemSearch, "i") : null;

    // Build AND clauses for specific id filters (NOT the global "search")
    const andClauses = [];

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

    // Base equality/range filters (dates use computed dateObj)
    const baseEq = {
      ...(req.query.project_id && { p_id: req.query.project_id }),

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
          baseEq["current_status.status"] = "short_quantity";
          break;
        case "Partially Delivered":
          baseEq["current_status.status"] = "partially_delivered";
          break;
        default:
          break;
      }
    }

    const preMatch = andClauses.length
      ? { $and: andClauses, ...baseEq }
      : baseEq;

    // First stage: safely compute dateObj and also create a consistent string for PO number
    const safeDateObjAndPoStrStage = {
      $addFields: {
        dateObj: {
          $switch: {
            branches: [
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
                    format: "%Y-%m-%d",
                    onError: null,
                    onNull: null,
                  },
                },
              },
              { case: { $eq: [{ $type: "$date" }, "date"] }, then: "$date" },
            ],
            default: null,
          },
        },
        po_number_str: { $toString: "$po_number" }, // for stable regex search
      },
    };

    // Vendor resolution stages (support vendor stored as ObjectId or string)
    const vendorResolveStages = [
      {
        $addFields: {
          vendor_obj_id: {
            $cond: [
              { $eq: [{ $type: "$vendor" }, "objectId"] },
              "$vendor",
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "vendors",
          localField: "vendor_obj_id",
          foreignField: "_id",
          as: "vendorDoc",
        },
      },
      {
        $addFields: {
          vendor_name: {
            $cond: [
              { $gt: [{ $size: "$vendorDoc" }, 0] },
              { $arrayElemAt: ["$vendorDoc.name", 0] },
              {
                $cond: [
                  { $eq: [{ $type: "$vendor" }, "string"] },
                  "$vendor",
                  "",
                ],
              },
            ],
          },
        },
      },
      { $project: { vendorDoc: 0 } },
    ];

    // Optional vendor_id filter (after vendor_obj_id is added)
    const vendorIdMatchStage = vendorObjectId
      ? [{ $match: { vendor_obj_id: vendorObjectId } }]
      : [];

    // Single, unified search across p_id, po_number_str, vendor_name
    const makeSearchStage = (s) => {
      if (!s) return [];
      const re = new RegExp(s, "i");
      return [
        {
          $match: {
            $or: [
              { p_id: { $regex: re } },
              { po_number_str: { $regex: re } },
              { vendor_name: { $regex: re } },
            ],
          },
        },
      ];
    };

    const pipeline = [
      safeDateObjAndPoStrStage,
      { $match: preMatch },

      {
        $addFields: {
          total_billed_num: {
            $convert: {
              input: "$total_billed",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          po_value_num: {
            $convert: {
              input: "$po_value",
              to: "double",
              onError: 0,
              onNull: 0,
            },
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
        ? [
          {
            $match: {
              resolvedCatNames: { $elemMatch: { $regex: itemSearchRegex } },
            },
          },
        ]
        : []),

      ...vendorResolveStages,
      ...vendorIdMatchStage,

      ...makeSearchStage(search), // unified search here (AFTER vendor_name exists)

      {
        $addFields: {
          // keep numeric conversions for projection
          po_value: {
            $convert: {
              input: "$po_value",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          total_advance_paid: {
            $convert: {
              input: "$total_advance_paid",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
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
          vendor: "$vendor_name",
          vendor_id: "$vendor_obj_id",
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
      safeDateObjAndPoStrStage,
      { $match: preMatch },

      {
        $addFields: {
          total_billed_num: {
            $convert: {
              input: "$total_billed",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          po_value_num: {
            $convert: {
              input: "$po_value",
              to: "double",
              onError: 0,
              onNull: 0,
            },
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
        ? [
          {
            $match: {
              resolvedCatNames: { $elemMatch: { $regex: itemSearchRegex } },
            },
          },
        ]
        : []),

      ...vendorResolveStages,
      ...vendorIdMatchStage,

      ...makeSearchStage(search),

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

    const toArray = (v) =>
      Array.isArray(v)
        ? v
        : typeof v === "string"
          ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
          : [];

    // 1) Selected IDs (if any)
    const rawIds = [
      ...toArray(req.body?.purchaseorders),
      ...toArray(req.query?.purchaseorders),
    ];
    const validIds = rawIds
      .map((id) =>
        mongoose.Types.ObjectId.isValid(id)
          ? new mongoose.Types.ObjectId(id)
          : null
      )
      .filter(Boolean);

    // 2) Otherwise use filters (for “All” export)
    const filters = req.body?.filters || req.query?.filters || {};
    let matchStage = {};

    if (validIds.length) {
      matchStage = { _id: { $in: validIds } };
    } else {
      const {
        status,
        search,
        etdFrom,
        etdTo,
        deliveryFrom,
        deliveryTo,
        filter,
        project_id,
        pr_id,
        item_id,
        itemSearch,
      } = filters;

      const and = [];

      if (project_id)
        and.push({ $or: [{ project_id }, { "project_id._id": project_id }] });
      if (pr_id) and.push({ $or: [{ pr_id }, { "pr._id": pr_id }] });
      if (item_id) and.push({ "item._id": item_id });

      if (search) {
        const q = String(search).trim();
        and.push({
          $or: [
            { p_id: new RegExp(q, "i") },
            { po_number: new RegExp(q, "i") },
            { vendor: new RegExp(q, "i") },
          ],
        });
      }

      if (itemSearch) {
        and.push({
          $or: [
            { "item.category_name": new RegExp(itemSearch, "i") },
            { "item.product_name": new RegExp(itemSearch, "i") },
          ],
        });
      }

      const toISO = (d, endOfDay = false) => {
        if (!d) return null;
        const dt = new Date(d);
        if (Number.isNaN(dt)) return null;
        if (endOfDay) dt.setHours(23, 59, 59, 999);
        return dt;
      };

      if (etdFrom || etdTo) {
        const gte = toISO(etdFrom);
        const lte = toISO(etdTo, true);
        const range = {};
        if (gte) range.$gte = gte;
        if (lte) range.$lte = lte;
        and.push({ etd: range });
      }

      if (deliveryFrom || deliveryTo) {
        const gte = toISO(deliveryFrom);
        const lte = toISO(deliveryTo, true);
        const range = {};
        if (gte) range.$gte = gte;
        if (lte) range.$lte = lte;
        and.push({ delivery_date: range });
      }

      // UI “Filter” mapping
      if (filter) {
        const baseEq = {};
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
            baseEq["current_status.status"] = "short_quantity";
            break;
          case "Partially Delivered":
            baseEq["current_status.status"] = "partially_delivered";
            break;
          default:
            break;
        }
        if (Object.keys(baseEq).length) and.push(baseEq);
      }

      // Bill Status (Fully / Pending)
      if (status === "Fully Billed") {
        and.push({
          $expr: {
            $gte: [
              { $toDouble: { $ifNull: ["$total_billed", 0] } },
              { $toDouble: { $ifNull: ["$po_value", 0] } },
            ],
          },
        });
      } else if (status === "Bill Pending") {
        and.push({
          $expr: {
            $lt: [
              { $toDouble: { $ifNull: ["$total_billed", 0] } },
              { $toDouble: { $ifNull: ["$po_value", 0] } },
            ],
          },
        });
      }

      matchStage = and.length ? { $and: and } : {};
    }

    const pipeline = [
      Object.keys(matchStage).length ? { $match: matchStage } : null,

      {
        $addFields: {
          po_number_str: { $toString: "$po_number" },
          po_value_num: {
            $convert: {
              input: "$po_value",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          total_billed_num: {
            $convert: {
              input: "$total_billed",
              to: "double",
              onError: 0,
              onNull: 0,
            },
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

      // Sum approved payments (UTR present)
      {
        $lookup: {
          from: "payrequests",
          let: { poNumber: "$po_number_str" },
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
            {
              $project: {
                amount_paid: {
                  $convert: {
                    input: "$amount_paid",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          ],
          as: "approvedPayments",
        },
      },
      {
        $addFields: {
          amount_paid_num: { $sum: "$approvedPayments.amount_paid" },
        },
      },

      { $unwind: { path: "$item", preserveNullAndEmptyArrays: false } },

      {
        $addFields: {
          item_category_name: { $ifNull: ["$item.category_name", "-"] },
          item_product_name: { $ifNull: ["$item.product_name", "-"] },
          item_uom: { $ifNull: ["$item.uom", "-"] },
          item_quantity_num: {
            $convert: {
              input: "$item.quantity",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          item_unit_price_num: {
            $convert: {
              input: "$item.cost",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
          item_gst_percent_num: {
            $convert: {
              input: "$item.gst_percent",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      {
        $addFields: {
          line_basic: {
            $multiply: ["$item_quantity_num", "$item_unit_price_num"],
          },
          line_gst_amount: {
            $multiply: [
              { $multiply: ["$item_quantity_num", "$item_unit_price_num"] },
              { $divide: ["$item_gst_percent_num", 100] },
            ],
          },
        },
      },
      {
        $addFields: {
          line_total_incl_gst: { $add: ["$line_basic", "$line_gst_amount"] },
        },
      },

      // -------- NEW: Delay calculation --------
      {
        $addFields: {
          delay_days: {
            $cond: [
              { $eq: ["$etd", null] },
              0,
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$dispatch_date", null] },
                      { $gt: ["$dispatch_date", "$etd"] },
                    ],
                  },
                  {
                    $dateDiff: {
                      startDate: "$etd",
                      endDate: "$dispatch_date",
                      unit: "day",
                    },
                  },
                  {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$dispatch_date", null] },
                          { $gt: ["$$NOW", "$etd"] },
                        ],
                      },
                      {
                        $dateDiff: {
                          startDate: "$etd",
                          endDate: "$$NOW",
                          unit: "day",
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          delay_label: {
            $cond: [
              { $gt: ["$delay_days", 0] },
              {
                $concat: ["Delayed by ", { $toString: "$delay_days" }, " days"],
              },
              "No delay",
            ],
          },
        },
      },
      // -------- END FIX --------

      {
        $project: {
          _id: 0,
          p_id: 1,
          po_number: "$po_number_str",
          vendor: 1,
          date: 1,
          etd: 1,
          delivery_date: 1,
          dispatch_date: 1,
          material_ready_date: 1,
          current_status_status: "$current_status.status",

          // numbers & computed fields
          po_value_num: 1,
          amount_paid_num: 1,
          total_billed_num: 1,
          partial_billing: 1,

          // delay fields
          delay_days: 1,
          delay_label: 1,

          // per-item
          category_name: "$item_category_name",
          product_name: "$item_product_name",
          uom: "$item_uom",
          quantity: "$item_quantity_num",
          unit_price: "$item_unit_price_num",
          gst_percent: "$item_gst_percent_num",
          line_basic: 1,
          line_total_incl_gst: 1,
        },
      },
    ].filter(Boolean);

    const rowsAgg = await purchaseOrderModells.aggregate(pipeline);

    const formatDate = (d) => {
      if (!d) return "";
      const dt = new Date(d);
      if (isNaN(dt)) return String(d); // keep raw if not a valid Date
      const dd = String(dt.getDate()).padStart(2, "0");
      const mon = dt.toLocaleString("en-GB", { month: "short" });
      const yy = String(dt.getFullYear());
      return `${dd}-${mon}-${yy}`;
    };

    // Map current_status -> your UI filter label
    const deriveFilterLabel = (r) => {
      const s = String(r.current_status_status || "").toLowerCase();

      if (s === "approval_pending") return "Approval Pending";
      if (s === "approval_done") return "Approval Done";
      if (s === "po_created" && !r.etd) return "ETD Pending";
      if (s === "po_created" && r.etd) return "ETD Done";
      if (s === "material_ready" && r.material_ready_date)
        return "Material Ready";
      if (s === "ready_to_dispatch" && r.dispatch_date)
        return "Ready to Dispatch";
      if (s === "out_for_delivery") return "Out for Delivery";
      if (s === "delivered") return "Delivered";
      if (s === "short_quantity") return "Short Quantity";
      if (s === "partially_delivered") return "Partially Delivered";

      return "";
    };

    // Final CSV rows
    const rows = rowsAgg.map((r) => ({
      p_id: r.p_id || "",
      po_number: r.po_number || "",
      vendor: r.vendor || "",

      po_date: formatDate(r.date), // PO date is your string field
      etd_date: formatDate(r.etd),
      mr_date: formatDate(r.material_ready_date),
      rtd_date: formatDate(r.dispatch_date),
      delivery_date: formatDate(r.delivery_date),

      filter: deriveFilterLabel(r),

      // delay
      delay_days: Number(r.delay_days || 0),
      delay_label: r.delay_label || "No delay",

      category: r.category_name || "-",
      product: r.product_name || "-",
      uom: r.uom || "-",
      quantity: Number(r.quantity || 0),
      unit_price: Number(r.unit_price || 0),
      gst_percent: Number(r.gst_percent || 0),
      line_basic: Number(r.line_basic || 0),
      line_total_incl_gst: Number(r.line_total_incl_gst || 0),

      po_value: Number(r.po_value_num || 0),
      amount_paid: Number(r.amount_paid_num || 0),
      total_billed: Number(r.total_billed_num || 0),
      billing_status: r.partial_billing || "",
    }));

    // CSV headers (added Delay columns + date columns + Filter)
    const fields = [
      { label: "Project ID", value: "p_id" },
      { label: "PO Number", value: "po_number" },
      { label: "Vendor", value: "vendor" },

      { label: "PO Date", value: "po_date" },
      { label: "ETD Date", value: "etd_date" },
      { label: "MR Date", value: "mr_date" },
      { label: "RTD Date", value: "rtd_date" },
      { label: "Delivery Date", value: "delivery_date" },

      { label: "Filter", value: "filter" },

      { label: "Delay (days)", value: "delay_days" },
      { label: "Delay Label", value: "delay_label" },

      { label: "Category", value: "category" },
      { label: "Product", value: "product" },
      { label: "UOM", value: "uom" },
      { label: "Qty", value: "quantity" },
      { label: "Unit Price", value: "unit_price" },
      { label: "GST %", value: "gst_percent" },
      { label: "Line Total (Basic)", value: "line_basic" },
      { label: "Line Total (incl. GST)", value: "line_total_incl_gst" },
      { label: "PO Value", value: "po_value" },
      { label: "Amount Paid", value: "amount_paid" },
      { label: "Total Billed", value: "total_billed" },
      { label: "Billing Status", value: "billing_status" },
    ];

    const parser = new Parser({ fields, quote: '"', withBOM: false });
    const csvBody = parser.parse(rows);
    const csv = "\uFEFF" + csvBody; // BOM for Excel

    const fileName = `PO_Items_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error("getExportPo error:", err);
    return res
      .status(500)
      .json({ msg: "Export failed", error: err?.message || String(err) });
  }
};

const updateSalesPO = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks, basic_sales, sales_invoice, po_number, gst_on_sales } = req.body || {};

    
    if (!id && !po_number) {
      return res
        .status(400)
        .json({ message: "Provide either _id (param) or po_number (body)." });
    }

    if (!remarks?.trim()) {
      return res
        .status(400)
        .json({ message: "Remarks are required to update Sales PO." });
    }

    const basic = Number(basic_sales);
    const gst = Number(gst_on_sales || 0);
    const invoice = String(sales_invoice || "").trim();

    if (!Number.isFinite(basic))
      return res.status(400).json({ message: "basic_sales must be a number" });
    if (!Number.isFinite(gst))
      return res.status(400).json({ message: "gst_on_sales must be a number" });
    if (!invoice)
      return res.status(400).json({ message: "Sales Invoice is mandatory" });

  
    const po = id
      ? await purchaseOrderModells.findById(id)
      : await purchaseOrderModells.findOne({
        po_number: String(po_number).trim(),
      });

    if (!po) return res.status(404).json({ message: "PO not found" });

    const poValue = Number(po.po_value) || 0;
    const alreadySales = Number(po.total_sales_value) || 0;
    const entryTotal = basic + gst;

  
    const safePo = (s) =>
      String(s || "")
        .trim()
        .replace(/[\/\s]+/g, "_");

    const folderPath = `Account/PO/${safePo(po.po_number)}`;
    const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${encodeURIComponent(
      folderPath
    )}`;

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
          const sharpInst = sharp(buffer);
          if (["jpeg", "jpg"].includes(ext))
            buffer = await sharpInst.jpeg({ quality: 40 }).toBuffer();
          else if (ext === "png")
            buffer = await sharpInst.png({ quality: 40 }).toBuffer();
          else if (ext === "webp")
            buffer = await sharpInst.webp({ quality: 40 }).toBuffer();
          else buffer = await sharpInst.jpeg({ quality: 40 }).toBuffer();
        } catch (e) {
          console.warn("Image compression failed, using original:", e.message);
        }
      }


      try {
        const form = new FormData();
        form.append("file", buffer, {
          filename: attachment_name,
          contentType: mimeType,
        });

        const resp = await axios.post(uploadUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const data = resp?.data || {};
        const url =
          (Array.isArray(data) &&
            (typeof data[0] === "string" ? data[0] : data[0]?.url)) ||
          data?.url ||
          data?.fileUrl ||
          data?.data?.url ||
          null;

        if (url)
          uploadedAttachments.push({ attachment_url: url, attachment_name });
        else console.warn(`No URL returned for ${attachment_name}`);
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
      remarks: remarks.trim(),
      attachments: uploadedAttachments,
      converted_at: new Date(),
      basic_sales: basic,
      gst_on_sales: gst,
      sales_invoice: invoice,
      user_id: userId,
    });

    po.isSales = true;
    po.total_sales_value = alreadySales + entryTotal;
    po.markModified("sales_Details");

    if (!["for", "slnko", "client"].includes(po.delivery_type)) {
      po.delivery_type = undefined;
    }

    await po.save();


    return res.status(200).json({
      message:
        uploadedAttachments.length > 0
          ? "Sales PO updated with attachments (isSales = true)"
          : "Sales PO updated successfully (isSales = true)",
      data: {
        po_number: po.po_number,
        po_value: poValue,
        basic_sales: basic,
        gst_on_sales: gst,
        total_sales_value: po.total_sales_value,
        attachments: uploadedAttachments,
      },
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

    if (
      status === "approval_pending" ||
      status === "approval_done" ||
      status === "approval_rejected" ||
      status === "po_created"
    ) {
      let text = "";
      if (status === "approval_pending") text = "Approval Pending";
      if (status === "approval_done") text = "Approval Done";
      if (status === "approval_rejected") text = "Approval Rejected";
      if (status === "po_created") text = "Po Created";

      try {
        const workflow = "purchase-order";
        let senders = [];

        if (status === "approval_pending" || status === "po_created") {
          senders = await userModells
            .find({
              department: "CAM",
            })
            .select("_id")
            .lean()
            .then((users) => users.map((u) => u._id));
        }
        if (status === "approval_done" || status === "approval_rejected") {
          senders = await userModells
            .find({
              $or: [
                {
                  department: "Projects",
                  role: "visitor",
                },

                { department: "SCM" },
              ],
            })
            .select("_id")
            .lean()
            .then((users) => users.map((u) => u._id));
        }
        const data = {
          Module: purchaseOrder.p_id,
          sendBy_Name: sendBy_Name.name,
          message: `Purchase Order is now marked as ${text}`,
          link: `/add_po?mode=edit&_id=${purchaseOrder._id}`,
        };

        setImmediate(() => {
          sendNotification(workflow, senders, data).catch((err) =>
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
    });
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

const bulkMarkDelivered = async (req, res) => {
  try {
    const { ids = [], date, remarks = "Bulk marked as delivered" } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: "Provide a non-empty 'ids' array." });
    }

    // Helper: get 'now' in IST unless a date is provided
    const nowIST = () => {
      const now = new Date();
      return new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
      );
    };
    const effectiveDate = date ? new Date(date) : nowIST();

    // Split the incoming IDs into Mongo ObjectIds vs non-ObjectIds (treated as po_number)
    const objectIds = [];
    const poNumbers = [];
    for (const x of ids) {
      if (typeof x === "string" && mongoose.Types.ObjectId.isValid(x))
        objectIds.push(new mongoose.Types.ObjectId(x));
      else poNumbers.push(String(x));
    }

    // Fetch POs first (so we know which PRs to recalc + for a clean response)
    const foundPOs = await purchaseOrderModells
      .find({
        $or: [
          ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
          ...(poNumbers.length ? [{ po_number: { $in: poNumbers } }] : []),
        ],
      })
      .select("_id po_number pr_id item current_status")
      .lean();

    if (!foundPOs.length) {
      return res.status(404).json({
        message: "No matching Purchase Orders found for provided ids.",
      });
    }

    // Build bulk updates: set delivered + same-day dates + status history entry
    const bulkOps = foundPOs.map((po) => ({
      updateOne: {
        filter: { _id: po._id },
        update: {
          $set: {
            etd: effectiveDate, // Expected Time/Date (set to same day)
            material_ready_date: effectiveDate, // Material Received Date (same day)
            dispatch_date: effectiveDate, // Ready To Dispatch Date (same day)
            delivery_date: effectiveDate, // Delivery Date (same day)
            "current_status.status": "delivered",
            "current_status.updated_at": effectiveDate,
          },
          $push: {
            status_history: {
              status: "delivered",
              remarks,
              user_id: req.user?.userId || null,
              at: effectiveDate,
            },
          },
        },
      },
    }));

    const bulkResult = await purchaseOrderModells.bulkWrite(bulkOps, {
      ordered: false,
    });

    // Recompute PR items for affected PRs (reuse your status aggregation logic)
    const prIds = Array.from(
      new Set(foundPOs.map((p) => String(p.pr_id || "")).filter(Boolean))
    );

    // Helper: recompute statuses for a single PR (same logic style as updateStatusPO)
    const recomputePRItems = async (prId) => {
      const pr = await purchaseRequest.findById(prId).lean();
      if (!pr) return;

      const allPOs = await purchaseOrderModells.find({ pr_id: pr._id }).lean();

      const updatedItems = await Promise.all(
        (pr.items || []).map(async (item) => {
          const itemIdStr = String(item.item_id);

          // Find all POs matching this item (id or name)
          const relevantPOs = allPOs.filter((po) => {
            const poItem = po.item;
            if (typeof poItem === "string") return poItem === itemIdStr;
            if (poItem?._id) return String(poItem._id) === itemIdStr;
            return false;
          });

          const allStatuses = relevantPOs
            .map((po) => po.current_status?.status)
            .filter(Boolean);

          if (!allStatuses.length) return { ...item };

          const same = allStatuses.every((s) => s === allStatuses[0]);
          return {
            ...item,
            status: same ? allStatuses[0] : getLowerPriorityStatus(allStatuses),
          };
        })
      );

      await purchaseRequest.findByIdAndUpdate(pr._id, { items: updatedItems });
    };

    await Promise.all(prIds.map((id) => recomputePRItems(id)));

    return res.status(200).json({
      message: "Purchase Orders marked as delivered successfully.",
      meta: {
        requested: ids.length,
        matched: bulkResult?.matchedCount ?? foundPOs.length,
        modified: bulkResult?.modifiedCount ?? foundPOs.length,
        prUpdated: prIds.length,
        effectiveDate,
      },
      data: foundPOs.map((p) => ({
        _id: p._id,
        po_number: p.po_number,
        pr_id: p.pr_id,
      })),
    });
  } catch (error) {
    console.error("bulkMarkDelivered error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Controller
const linkProjectToPOByPid = async (req, res) => {
  try {
    const poCodes = await purchaseOrderModells.distinct("p_id", {
      p_id: { $type: "string", $ne: "" },
      $or: [{ project_id: { $exists: false } }, { project_id: null }],
    });

    if (!poCodes.length) {
      return res.status(200).json({
        ok: true,
        message: "Nothing to link. No POs missing project_id.",
        updated: 0,
      });
    }

    const projects = await projectModel
      .find({ code: { $in: poCodes } }, { _id: 1, code: 1 })
      .lean();

    const codeToProjectId = new Map(
      projects.map((p) => [String(p.code).trim(), p._id])
    );

    const ops = [];
    for (const code of poCodes) {
      const projectId = codeToProjectId.get(String(code).trim());
      if (!projectId) continue;

      ops.push({
        updateMany: {
          filter: {
            p_id: code,
            $or: [{ project_id: { $exists: false } }, { project_id: null }],
          },
          update: { $set: { project_id: projectId } },
        },
      });
    }

    if (!ops.length) {
      return res.status(200).json({
        ok: true,
        message:
          "No matching projectDetail.code found for the POs missing project_id.",
        updated: 0,
      });
    }

    const result = await purchaseOrderModells.bulkWrite(ops, {
      ordered: false,
    });

    console.log(
      "[linkProjectIdsSimple] scannedCodes=%d, modified=%d",
      poCodes.length,
      result.modifiedCount || 0
    );

    return res.status(200).json({
      ok: true,
      message: "Linked project_id where p_id matched projectDetail.code.",
      updated: result.modifiedCount || 0,
      scannedCodes: poCodes.length,
    });
  } catch (err) {
    console.error("linkProjectIdsSimple error:", err);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
      error: err.message,
    });
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
  bulkMarkDelivered,
  generatePurchaseOrderPdf,
  linkProjectToPOByPid,
};
