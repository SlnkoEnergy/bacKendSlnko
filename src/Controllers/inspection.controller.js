// controllers/inspection.controller.js
const {
  catchAsyncError,
} = require("../middlewares/catchasyncerror.middleware");
const Inspection = require("../models/inspection.model");
const ErrorHandler = require("../middlewares/error.middleware");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");
const { nextInspectionCode } = require("../utils/inspection.utils");
const purchaseOrderModel = require("../models/purchaseorder.model");
const userModells = require("../models/user.model");
const { getnovuNotification } = require("../utils/nouvnotification.utils");

const createInspection = catchAsyncError(async (req, res) => {
  const userId = req.user?.userId;
  const b = req.body || {};

  const inspection_code = await nextInspectionCode();

  let doc;
  if (b.items && b.inspection) {
    const items = Array.isArray(b.items) ? b.items : [];
    const ins = b.inspection || {};

    doc = {
      project_code: b.project_code,
      po_id: b.po_id,
      inspection_code,
      vendor: b.vendor,
      vendor_contact: ins.contact_person || "",
      vendor_mobile: ins.contact_mobile || "",
      mode: ins.mode,
      location: ins.mode === "offline" ? ins.location || "" : "",
      description: ins.notes || b.description || "",
      date: ins.datetime || b.date || undefined,
      item: items.map((it) => ({
        category_id:
          it.category_id || it.productCategoryId || it._id || undefined,
        product_name: it.product_name || it.productName || "",
        description: it.description || it.briefDescription || "",
        product_make: it.product_make || it.make || "",
        quantity: String(it.quantity ?? 0),
      })),
      created_by: userId,
    };
  } else {
    doc = { ...b, created_by: userId, inspection_code };
  }

  const inspection = new Inspection(doc);
  const saved = await inspection.save();

  try {
    const workflow = "po-inspecction";
    const senders = await userModells
      .find({
        $or: [{ department: "Engineering" }],
      })
      .select("_id")
      .lean()
      .then((users) => users.map((u) => u._id));

    const data = {
      message: ` Inspection is created for ${b.po_number} `,
    };

    await getnovuNotification(workflow, senders, data);
  } catch (error) {
    console.log(error);
  }

  res.status(201).json({
    msg: "Inspection created successfully",
    data: saved,
  });
});

const getAllInspections = catchAsyncError(async (req, res, next) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Number.parseInt(req.query.limit, 10) || 10;
  const sortBy = req.query.sortBy || "createdAt";
  const order = req.query.order === "asc" ? 1 : -1;

  const search = (req.query.search || "").trim();

  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  const { po_number } = req.query;

  const pipeline = [];
  if (
    po_number &&
    po_number !== "null" &&
    po_number !== "undefined" &&
    po_number.trim() !== ""
  ) {
    pipeline.push({ $match: { po_number } });
  }

  // Date filter
  const matchDate = {};
  if (startDate || endDate) {
    matchDate["date"] = {};
    if (startDate) matchDate["date"].$gte = startDate;
    if (endDate) matchDate["date"].$lte = endDate;
  }
  if (Object.keys(matchDate).length) pipeline.push({ $match: matchDate });

  // Category lookup
  pipeline.push({
    $lookup: {
      from: "materialcategories",
      localField: "item.category_id",
      foreignField: "_id",
      as: "categories",
    },
  });

  // Optional search (project_code, vendor, etc.)
  if (search) {
    const regex = new RegExp(search, "i");
    pipeline.push({
      $match: {
        $or: [
          { project_code: { $regex: regex } },
          { vendor: { $regex: regex } },
          { "categories.name": { $regex: regex } },
          { inspection_code: { $regex: regex } },
          { po_number: { $regex: regex } },
        ],
      },
    });
  }

  // Pagination
  const sortStage = { $sort: { [sortBy]: order } };
  const skipStage = { $skip: (page - 1) * limit };
  const limitStage = { $limit: limit };

  pipeline.push({
    $facet: {
      data: [
        sortStage,
        skipStage,
        limitStage,
        {
          $lookup: {
            from: "users",
            localField: "created_by",
            foreignField: "_id",
            as: "created_by_doc",
          },
        },
        {
          $unwind: {
            path: "$created_by_doc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "current_status.user_id",
            foreignField: "_id",
            as: "current_status_user_doc",
          },
        },
        {
          $unwind: {
            path: "$current_status_user_doc",
            preserveNullAndEmptyArrays: true,
          },
        },
        // ✅ Lookup purchase order here
        {
          $lookup: {
            from: "purchaseorders",
            localField: "po_number",
            foreignField: "po_number",
            as: "po_doc",
          },
        },
        {
          $unwind: {
            path: "$po_doc",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            project_code: "$po_doc.p_id",
            item: {
              $map: {
                input: "$item",
                as: "it",
                in: {
                  $mergeObjects: [
                    "$$it",
                    {
                      category_oid: "$$it.category_id",
                      category_id: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$categories",
                              as: "cat",
                              cond: { $eq: ["$$cat._id", "$$it.category_id"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                  ],
                },
              },
            },
            "current_status.user_doc": "$current_status_user_doc",
          },
        },
      ],
      totalCount: [{ $count: "count" }],
    },
  });

  const agg = await Inspection.aggregate(pipeline);

  const docs = agg?.[0]?.data || [];
  const total = agg?.[0]?.totalCount?.[0]?.count || 0;

  res.json({
    data: docs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

const updateStatusInspection = catchAsyncError(async (req, res, next) => {
  try {
    const { status, remarks } = req.body;
    const { id } = req.params;

    const inspection = await Inspection.findById(id).populate(
      "item.category_id",
      "name"
    );
    if (!inspection) return next(new ErrorHandler("Inspection Not Found", 404));

    const projectCode = (inspection.project_code || "unknown_project").replace(
      /[/\\]/g,
      "_"
    );
    const firstItem = Array.isArray(inspection.item)
      ? inspection.item[0]
      : null;
    const categoryName = (
      firstItem?.category_id?.name || "unknown_category"
    ).replace(/[/\\]/g, "_");

    const folderPath = `inspection/${projectCode}/${categoryName}`.replace(
      / /g,
      "_"
    );

    // Upload files (if any)
    const uploadedAttachmentObjs = [];

    for (const file of req.files || []) {
      const mimeType =
        mime.lookup(file.originalname) ||
        file.mimetype ||
        "application/octet-stream";
      let buffer = file.buffer;

      // Compress images
      if (mimeType.startsWith("image/")) {
        const ext = mime.extension(mimeType);
        if (ext === "jpeg" || ext === "jpg") {
          buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        } else if (ext === "png") {
          buffer = await sharp(buffer).png({ quality: 40 }).toBuffer();
        } else if (ext === "webp") {
          buffer = await sharp(buffer).webp({ quality: 40 }).toBuffer();
        } else {
          buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        }
      }

      // Upload to blob storage
      const form = new FormData();
      form.append("file", buffer, {
        filename: file.originalname,
        contentType: mimeType,
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;
      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const respData = response.data;
      const url =
        (Array.isArray(respData) && respData[0]) ||
        respData?.url ||
        respData?.fileUrl ||
        respData?.data?.url ||
        null;

      if (url) {
        uploadedAttachmentObjs.push({ attachment_url: url });
      }
    }

    inspection.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
      updatedAt: new Date(),
      attachments: uploadedAttachmentObjs,
    });

    await inspection.save();

    try {
      const workflow = "po-inspecction";
      const senders = await userModells
        .find({
          $or: [{ department: "SCM" }],
        })
        .select("_id")
        .lean()
        .then((users) => users.map((u) => u._id));

      const data = {
        message: `Status change again the ${inspection.po_number}`,
      };

      await getnovuNotification(workflow, senders, data);
    } catch (error) {
      console.log(error);
    }

    res.status(200).json({
      message: "Status Updated Successfully",
      data: inspection,
    });
  } catch (error) {
    console.error("Error updating inspection status:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message || String(error),
    });
  }
});

// READ ONE
const getInspectionById = catchAsyncError(async (req, res, next) => {
  const inspection = await Inspection.findById(req.params.id)
    .populate({
      path: "created_by",
      select: "_id name emp_id email phone role department createdAt updatedAt",
    })
    .populate({
      path: "current_status.user_id",
      select: "_id name emp_id email phone role department createdAt updatedAt",
    })
    .populate({
      path: "item.category_id",
      select: "_id name",
    })
    .populate({
      path: "status_history.user_id",
      select: "_id name emp_id email phone role department createdAt updatedAt",
    })
    .lean();

  if (!inspection) return next(new ErrorHandler("Not Found", 404));

  const purchaseOrder = await purchaseOrderModel
    .findOne({
      po_number: inspection.po_number,
    })
    .select("p_id");

  if (purchaseOrder) {
    inspection.project_code = purchaseOrder.p_id;
  }

  res.json(inspection);
});

// UPDATE
const updateInspection = catchAsyncError(async (req, res, next) => {
  const updated = await Inspection.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  if (!updated) return next(new ErrorHandler("Not Found", 404));
  res.json(updated);
});

const deleteInspection = catchAsyncError(async (req, res, next) => {
  const deleted = await Inspection.findByIdAndDelete(req.params.id);
  if (!deleted) return next(new ErrorHandler("Not Found", 404));
  res.json({ message: "Deleted successfully" });
});

module.exports = {
  createInspection,
  updateInspection,
  getInspectionById,
  getAllInspections,
  deleteInspection,
  updateStatusInspection,
};
