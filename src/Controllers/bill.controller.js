const billModel = require("../models/bill.model");
const purchaseOrderModel = require("../models/purchaseorder.model");
const moment = require("moment");
const mongoose = require("mongoose");
const { Parser } = require("json2csv");
const {
  catchAsyncError,
} = require("../middlewares/catchasyncerror.middleware");
const ErrorHandler = require("../middlewares/error.middleware");
const userModells = require("../models/user.model");

const addBill = catchAsyncError(async function (req, res, next) {
  const {
    po_number,
    bill_number,
    bill_date,
    bill_value,
    bill_type,
    item,
    description,
  } = req.body;

  const userId = req.user.userId;

  const purchaseOrder = await purchaseOrderModel.findOne({ po_number });
  if (!purchaseOrder) {
    return next(new ErrorHandler("Purchase Order not found.", 404));
  }
  purchaseOrder.total_billed = String(
    Number(purchaseOrder.total_billed ?? 0) + Number(bill_value ?? 0)
  );
  purchaseOrder.total_bills = Number(purchaseOrder.total_bills || 0) + 1;
  purchaseOrder.save();

  const newBill = new billModel({
    po_number,
    bill_number,
    bill_date: moment(bill_date, "YYYY-MM-DD").toDate(),
    bill_value,
    item,
    description,
    type: bill_type,
    submitted_by: userId,
  });

  const savedBill = await newBill.save();

  if (bill_type === "Final") {
    await purchaseOrderModel.updateOne(
      { po_number },
      { $set: { final: "disabled" } }
    );
  }

  res.status(201).json({
    message: "Bill added successfully!",
    data: savedBill,
  });
});

const getBill = catchAsyncError(async (req, res) => {
  const data = await billModel.find();
  res.status(200).json({ msg: "All Bill Details", data });
});

const getPaginatedBill = catchAsyncError(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const skip = (page - 1) * pageSize;
  const search = req.query.search?.trim() || "";
  const status = req.query.status?.trim();
  const searchRegex = new RegExp(search, "i");
  const rawDate = req.query.date;
  let dateMatchStage = [];

  if (rawDate) {
    const [day, month, year] = rawDate.split("/");
    const start = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    const end = new Date(`${year}-${month}-${day}T23:59:59.999Z`);

    dateMatchStage = [
      {
        $addFields: {
          bills: {
            $filter: {
              input: "$bills",
              as: "bill",
              cond: {
                $and: [
                  { $gte: ["$$bill.created_on", start] },
                  { $lte: ["$$bill.created_on", end] },
                ],
              },
            },
          },
        },
      },
      {
        $match: {
          "bills.0": { $exists: true },
        },
      },
    ];
  }

  const matchStage = search
    ? {
        $or: [
          { bill_number: { $regex: searchRegex } },
          { po_number: { $regex: searchRegex } },
          { approved_by: { $regex: searchRegex } },
          { "poData.vendor": { $regex: searchRegex } },
          { "poData.item": { $regex: searchRegex } },
        ],
      }
    : {};

  const pipeline = [
    {
      $lookup: {
        from: "purchaseorders",
        localField: "po_number",
        foreignField: "po_number",
        as: "poData",
      },
    },
    { $unwind: "$poData" },
    { $match: matchStage },
    {
      $group: {
        _id: "$po_number",
        p_id: { $first: "$poData.p_id" },
        vendor: { $first: "$poData.vendor" },
        item: { $first: "$poData.item" },
        po_value: { $first: "$poData.po_value" },
        bills: {
          $push: {
            bill_number: "$bill_number",
            bill_date: "$bill_date",
            bill_value: "$bill_value",
            approved_by: "$approved_by",
            created_on: { $ifNull: ["$createdAt", "$created_on"] },
          },
        },
      },
    },
    {
      $addFields: {
        po_number: "$_id",
        total_billed: {
          $sum: {
            $map: {
              input: "$bills",
              as: "b",
              in: { $toDouble: "$$b.bill_value" },
            },
          },
        },
      },
    },
    {
      $addFields: {
        po_status: {
          $cond: {
            if: { $eq: ["$total_billed", "$po_value"] },
            then: "Fully Billed",
            else: "Bill Pending",
          },
        },
        po_balance: {
          $max: [
            {
              $cond: {
                if: { $eq: ["$po_value", "$total_billed"] },
                then: 0,
                else: { $subtract: ["$po_value", "$total_billed"] },
              },
            },
            0,
          ],
        },
      },
    },
    ...(status ? [{ $match: { po_status: status } }] : []),
    ...dateMatchStage,
    {
      $facet: {
        paginatedResults: [
          { $sort: { "bills.created_on": -1 } },
          { $skip: skip },
          { $limit: pageSize },
          {
            $project: {
              _id: 0,
              po_number: 1,
              p_id: 1,
              vendor: 1,
              item: 1,
              po_value: 1,
              bills: 1,
              total_billed: 1,
              po_status: 1,
              po_balance: 1,
            },
          },
        ],
        totalCount: [{ $count: "total" }],
      },
    },
  ];

  const [result] = await billModel.aggregate(pipeline);
  const data = result.paginatedResults || [];
  const total = result.totalCount[0]?.total || 0;

  res.status(200).json({
    msg: "All Bill Detail With PO Data",
    meta: {
      total,
      page,
      pageSize,
      count: data.length,
    },
    data,
  });
});


const getAllBill = catchAsyncError(async (req, res, next) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const pageSize = Number.parseInt(req.query.pageSize, 10) || 10;
  const skip = (page - 1) * pageSize;

  const status = (req.query.status || "").trim();

  let po_number = req.query.po_number;
  if (po_number === null || po_number === undefined || po_number === "null") {
    po_number = "";
  } else {
    po_number = String(po_number).trim();
  }

  const rawSearch = (req.query.search ?? req.query.q ?? "").toString().trim();

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pipeline = [
    // Join PO basics
    {
      $lookup: {
        from: "purchaseorders",
        localField: "po_number",
        foreignField: "po_number",
        as: "po",
      },
    },
    { $unwind: { path: "$po", preserveNullAndEmptyArrays: true } },

    // Normalize item -> array, unwind items (so we can attach category names)
    {
      $addFields: {
        _wasItemArray: { $isArray: "$item" },
        item: {
          $cond: [
            { $isArray: "$item" },
            "$item",
            [{ $ifNull: ["$item", null] }],
          ],
        },
      },
    },
    { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },

    // Attach category name to each item
    {
      $lookup: {
        from: "materialcategories",
        let: { cid: "$item.category_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$cid"] } } },
          { $project: { _id: 1, name: 1 } },
        ],
        as: "itemCat",
      },
    },
    {
      $addFields: {
        "item.category_name": {
          $ifNull: [{ $arrayElemAt: ["$itemCat.name", 0] }, null],
        },
      },
    },

    // Re-group back to one bill doc
    {
      $group: {
        _id: "$_id",
        doc: { $first: "$$ROOT" },
        items: { $push: "$item" },
      },
    },
    {
      $addFields: {
        items: {
          $filter: { input: "$items", as: "it", cond: { $ne: ["$$it", null] } },
        },
        "doc.item": {
          $cond: [
            "$doc._wasItemArray",
            "$items", // keep array if originally array
            { $arrayElemAt: ["$items", 0] }, // back to single item if originally single
          ],
        },
      },
    },

    // SAFETY: keep current doc if "doc" is missing to avoid 'newRoot missing'
    {
      $replaceRoot: {
        newRoot: { $ifNull: ["$doc", "$$ROOT"] },
      },
    },

    // Cast numeric fields for po totals
    {
      $addFields: {
        __po_value_num: { $toDouble: { $ifNull: ["$po.po_value", 0] } },
        __total_billed_num: { $toDouble: { $ifNull: ["$po.total_billed", 0] } },
      },
    },

    // Populate approved_by -> users.name (fallbacks supported)
    {
      $lookup: {
        from: "users",
        localField: "approved_by", // bill.approved_by (ObjectId)
        foreignField: "_id",
        as: "approvedUser",
      },
    },
    {
      $addFields: {
        approved_by_name: {
          $ifNull: [
            { $arrayElemAt: ["$approvedUser.name", 0] },
            {
              $ifNull: [
                { $arrayElemAt: ["$approvedUser.full_name", 0] },
                { $arrayElemAt: ["$approvedUser.username", 0] },
              ],
            },
          ],
        },
      },
    },

    // Flatten fields for output & filtering
    {
      $addFields: {
        project_id: "$po.p_id",
        po_no: "$po_number",
        vendor: "$po.vendor",
        bill_no: "$bill_number",
        bill_date: "$bill_date",
        bill_value: "$bill_value",
        po_value: "$__po_value_num",
        total_billed: "$__total_billed_num",
        po_status: {
          $cond: [
            { $eq: ["$__po_value_num", "$__total_billed_num"] },
            "fully billed",
            "waiting bills",
          ],
        },
        received: "$status",
        created_on: "$createdAt",
      },
    },

    // Final shape (add fields here if you want to return them)
    {
      $project: {
        _id: 1,
        project_id: 1,
        po_no: 1,
        vendor: 1,
        item: 1,
        bill_no: 1,
        bill_date: 1,
        bill_value: 1,
        po_value: 1,
        total_billed: 1,
        po_status: 1,
        received: 1,
        created_on: 1,
        approved_by: 1,       // keep original ObjectId
        approved_by_name: 1,  // populated name
      },
    },
  ];

  // ----- Filters -----
  const filters = [];

  if (status) {
    filters.push({ po_status: status });
  }

  if (po_number && po_number.length > 0) {
    // exact match for param po_number (as you had)
    filters.push({ po_no: po_number });
    // If you prefer partial:
    // filters.push({ po_no: { $regex: escapeRegExp(po_number), $options: "i" } });
  }

  if (rawSearch) {
    const tokens = rawSearch.split(/\s+/).filter(Boolean).slice(0, 6); // safety cap
    const andOfOrs = tokens.map((t) => {
      const rx = new RegExp(escapeRegExp(t), "i");
      return {
        $or: [
          { po_no: rx },
          { vendor: rx },
          { bill_no: rx },
          { project_id: rx },
        ],
      };
    });
    filters.push({ $and: andOfOrs });
  }

  if (filters.length) {
    pipeline.push({ $match: { $and: filters } });
  }

  // ----- Sort + paginate + total -----
  pipeline.push(
    { $sort: { created_on: -1, _id: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: pageSize }],
        totalCount: [{ $count: "count" }],
      },
    },
    {
      $addFields: {
        total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
      },
    },
    { $project: { totalCount: 0 } }
  );

  const result = await billModel.aggregate(pipeline);
  const { data = [], total = 0 } = result[0] || {};

  return res.status(200).json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 0,
    data,
  });
});


//Bills Exports
const exportBills = catchAsyncError(async (req, res, next) => {
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
      $expr: {
        $and: [
          {
            $gte: [{ $ifNull: ["$createdAt", "$created_on"] }, fromDate],
          },
          {
            $lte: [{ $ifNull: ["$createdAt", "$created_on"] }, toDate],
          },
        ],
      },
    };
  }

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "purchaseorders",
        localField: "po_number",
        foreignField: "po_number",
        as: "poData",
      },
    },
    { $unwind: "$poData" },
    {
      $project: {
        bill_number: 1,
        bill_date: 1,
        bill_value: 1,
        approved_by: 1,
        created_on: { $ifNull: ["$createdAt", "$created_on"] },
        po_number: 1,
        p_id: "$poData.p_id",
        vendor: "$poData.vendor",
        item: "$poData.item",
        po_value: "$poData.po_value",
      },
    },
  ];

  const bills = await billModel.aggregate(pipeline);

  const formattedBills = bills.map((bill) => ({
    ...bill,
    bill_value: Number(bill.bill_value)?.toLocaleString("en-IN"),
    po_value: Number(bill.po_value)?.toLocaleString("en-IN"),
    bill_date: bill.bill_date
      ? new Date(bill.bill_date).toLocaleDateString("en-GB")
      : "",
    created_on: bill.created_on
      ? new Date(bill.created_on).toLocaleString("en-GB")
      : "",
  }));

  const fields = [
    "p_id",
    "bill_number",
    "bill_date",
    "bill_value",
    "created_on",
    "po_number",
    "vendor",
    "item",
    "approved_by",
  ];

  const json2csvParser = new Parser({ fields, quote: '"' });
  const csv = json2csvParser.parse(formattedBills);

  res.header("Content-Type", "text/csv");
  res.attachment("bills_export.csv");
  return res.send(csv);
});

const GetBillByID = catchAsyncError(async (req, res, next) => {
  const { po_number, _id } = req.query;

  const matchStage = {};
  if (po_number) matchStage.po_number = po_number;
  if (_id) matchStage._id = new mongoose.Types.ObjectId(_id);

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "purchaseorders",
        localField: "po_number",
        foreignField: "po_number",
        as: "poData",
      },
    },
    { $unwind: { path: "$poData", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "materialcategories",
        localField: "item.category_id",
        foreignField: "_id",
        as: "categoryDoc",
      },
    },
    { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        "item.category_name": { $ifNull: ["$categoryDoc.name", null] },
      },
    },
    {
      $group: {
        _id: "$_id",
        po_number: { $first: "$po_number" },
        bill_number: { $first: "$bill_number" },
        bill_date: { $first: "$bill_date" },
        bill_value: { $first: "$bill_value" },
        submitted_by: { $first: "$submitted_by" },
        type: { $first: "$type" },
        status: { $first: "$status" },
        description: { $first: "$description" },
        created_on: { $first: "$created_on" },
        poData: { $first: "$poData" },
        items: {
          $push: {
            category_id: "$item.category_id",
            category_name: "$item.category_name",
            product_name: "$item.product_name",
            product_make: "$item.product_make",
            uom: "$item.uom",
            quantity: "$item.quantity",
            bill_value: "$item.bill_value",
            gst_percent: "$item.gst_percent",
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        po_number: 1,
        bill_number: 1,
        bill_date: 1,
        bill_value: 1,
        type: 1,
        status: 1,
        description: 1,
        submitted_by: 1,
        created_on: 1,
        items: 1,
        poData: {
          p_id: "$poData.p_id",
          date: "$poData.date",
          po_value: "$poData.po_value",
          vendor: "$poData.vendor",
          total_billed: "$poData.total_billed",
        },
      },
    },
  ];

  const data = await billModel.aggregate(pipeline);
  res.status(200).json({ data, msg: "Bill details fetched successfully" });
});

//update-bill
const updatebill = catchAsyncError(async function (req, res, next) {
  let id = req.params._id;
  let updatedata = req.body;

  const existingBill = await billModel.findById(id);
  if (!existingBill) {
    return next(new ErrorHandler("Bill not found", 404));
  }

  let data = await billModel.findByIdAndUpdate(id, updatedata, { new: true });
  if (!data) {
    return next(new ErrorHandler("Bill not found after update", 404));
  }

  if (data.purchase_order_id) {
    const po = await purchaseOrderModells.findById(data.purchase_order_id);
    if (po) {
      const prevTotalBilled = po.total_billed || 0;
      const prevBillValue = existingBill.bill_value || 0;
      const newBillValue = data.bill_value || 0;

      const adjustedTotalBilled = prevTotalBilled - prevBillValue + newBillValue;

      po.total_billed = adjustedTotalBilled;
      await po.save();
    }
  }

  res.status(200).json({ msg: "Bill updated successfully", data });
});


//delete-bill
const deleteBill = catchAsyncError(async function (req, res, next) {
  let id = req.params._id;
  let data = await billModel.findByIdAndDelete(id);
  if (!data) {
    return next(new ErrorHandler("User Not found", 404));
  }
  res.status(200).json({ msg: "Bill deleted sucessfully", data });
});

// bill_appoved
const bill_approved = catchAsyncError(async function (req, res, next) {
  const { bill_number } = req.body;
  const userId = req.user.userId;
  const existingBill = await billModel.findOne({
    bill_number: bill_number,
  });
  if (!existingBill) {
    return next(new ErrorHandler("No bill found", 404));
  }

  if (
    existingBill.approved_by !== undefined &&
    existingBill.approved_by !== null
  ) {
    return next(
      new ErrorHandler(
        "Bill is already approved and cannot be updated to an empty string.",
        400
      )
    );
  }
  const approvedby = await billModel.findOneAndUpdate(
    { bill_number },
    { $set: { approved_by: userId } },
    { new: true }
  );

  res.status(200).json({
    msg: "Bill updated successfully.",
    data: approvedby,
  });
});


function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// normalize whitespace; trim; collapse multiple spaces
function normalizeName(s = "") {
  return s.trim().replace(/\s+/g, " ");
}

// lookup strategy: exact (case-insensitive), else contains (case-insensitive)
async function findUserByName(raw) {
  const name = normalizeName(raw);
  if (!name) return null;

  // 1) exact match (case-insensitive)
  let user = await userModells.findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  }).lean();

  if (user) return user;

  // 2) fallback: contains (case-insensitive)
  user = await userModells.findOne({
    name: { $regex: escapeRegex(name), $options: "i" },
  }).lean();

  return user || null;
}

const manipulatebill = async (req, res) => {
  try {
    // Only fetch bills where either field is a string -> reduces work
    const bills = await billModel.find({
      $or: [
        { submitted_by: { $type: "string" } },
        { approved_by: { $type: "string" } },
      ],
    }).lean(); // lean for speed; we'll bulkWrite updates

    let processed = 0;
    let toUpdate = [];

    for (const bill of bills) {
      processed++;

      const updateDoc = {};
      let hasChanges = false;

      // submitted_by
      if (typeof bill.submitted_by === "string" && bill.submitted_by.trim()) {
        const user = await findUserByName(bill.submitted_by);
        if (user?._id) {
          console.log(
            `Bill ${bill._id} | submitted_by: "${bill.submitted_by}" → ${user._id}`
          );
          updateDoc.submitted_by = user._id;
          hasChanges = true;
        } else {
          console.warn(
            `Bill ${bill._id} | submitted_by unmatched: "${bill.submitted_by}"`
          );
        }
      }

      // approved_by
      if (typeof bill.approved_by === "string" && bill.approved_by.trim()) {
        const user = await findUserByName(bill.approved_by);
        if (user?._id) {
          console.log(
            `Bill ${bill._id} | approved_by: "${bill.approved_by}" → ${user._id}`
          );
          updateDoc.approved_by = user._id;
          hasChanges = true;
        } else {
          console.warn(
            `Bill ${bill._id} | approved_by unmatched: "${bill.approved_by}"`
          );
        }
      }

      if (hasChanges) {
        toUpdate.push({
          updateOne: {
            filter: { _id: bill._id },
            update: { $set: updateDoc },
          },
        });
      }
    }

    let bulkResult = null;
    if (toUpdate.length) {
      bulkResult = await billModel.bulkWrite(toUpdate, { ordered: false });
    }

    res.status(200).json({
      message: "Bills normalized successfully",
      processed,
      updated: bulkResult ? (bulkResult.modifiedCount || 0) : 0,
      attempted: toUpdate.length,
    });
  } catch (error) {
    console.error("Error normalizing bills:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


module.exports = {
  addBill,
  getBill,
  getPaginatedBill,
  GetBillByID,
  updatebill,
  deleteBill,
  bill_approved,
  exportBills,
  getAllBill,
  manipulatebill
};
