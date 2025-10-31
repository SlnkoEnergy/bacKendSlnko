const billModel = require("../models/bill.model");
const purchaseOrderModel = require("../models/purchaseorder.model");
const moment = require("moment");
const mongoose = require("mongoose");
const { Types } = mongoose;
const { Parser } = require("json2csv");
const {
  catchAsyncError,
} = require("../middlewares/catchasyncerror.middleware");
const ErrorHandler = require("../middlewares/error.middleware");
const userModells = require("../models/user.model");
const materialcategoryModel = require("../models/materialcategory.model");

const toObjectIdOrNull = (val) => {
  if (!val) return null;
  if (val instanceof Types.ObjectId) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return Types.ObjectId.isValid(trimmed) ? new Types.ObjectId(trimmed) : null;
  }
  if (typeof val === "object" && val._id && Types.ObjectId.isValid(val._id)) {
    return new Types.ObjectId(val._id);
  }
  return null;
};

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

  const trim_bill_number = bill_number.trim();

  const existingBill = await billModel.findOne({
    bill_number: trim_bill_number,
  });

  if (existingBill && existingBill.po_number === po_number) {
    return res.status(404).json({
      message: "Bill Already Exists For this Po Number",
    });
  }

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

  let status = (req.query.status || "").trim().toLowerCase();

  status = status === "bill pending" ? "waiting bills" : status;

  let po_number = req.query.po_number;
  if (po_number === null || po_number === undefined || po_number === "null") {
    po_number = "";
  } else {
    po_number = String(po_number).trim();
  }

  const rawSearch = (req.query.search ?? req.query.q ?? req.body.search ?? "")
    .toString()
    .trim();
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const filters = [];
  if (status) filters.push({ po_status: status });
  if (po_number && po_number.length > 0) filters.push({ po_no: po_number });
  if (rawSearch) {
    const tokens = rawSearch.split(/\s+/).filter(Boolean).slice(0, 6);
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

  const parseDMY = (s) => {
    if (!s) return null;
    // supports "19-10-2024" -> Date("2024-10-19T00:00:00Z" local offset ok too)
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s).trim());
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
    const d = new Date(s); // fallback for ISO etc.
    return isNaN(d) ? null : d;
  };

  const fromRaw = req.query.dateFrom;
  const toRaw = req.query.dateEnd;

  const from = parseDMY(fromRaw);
  const to0 = parseDMY(toRaw);
  // exclusive end so full day is included
  const toExclusive = to0
    ? new Date(to0.getFullYear(), to0.getMonth(), to0.getDate() + 1)
    : null;

  const rangeCond = {};
  if (from) rangeCond.$gte = from;
  if (toExclusive) rangeCond.$lt = toExclusive;

  const pipeline = [
    // minimal PO join
    {
      $addFields: {
        __bill_date: {
          $let: {
            vars: { b: "$bill_date" },
            in: {
              $cond: [
                { $eq: [{ $type: "$$b" }, "date"] },
                "$$b",
                {
                  $cond: [
                    { $eq: [{ $type: "$$b" }, "string"] },
                    {
                      $dateFromString: {
                        dateString: "$$b",
                        onError: null,
                        onNull: null,
                      },
                    },
                    null,
                  ],
                },
              ],
            },
          },
        },
      },
    },

    // Apply the range: include if bill_date OR created_on is within range
    ...(Object.keys(rangeCond).length
      ? [{ $match: { __bill_date: rangeCond } }]
      : []),

    {
      $lookup: {
        from: "purchaseorders",
        localField: "po_number",
        foreignField: "po_number",
        pipeline: [
          {
            $project: {
              _id: 0,
              p_id: 1,
              vendor: 1,
              po_value: 1,
              total_billed: 1,
              item: 1,
            },
          },
        ],
        as: "po",
      },
    },
    { $unwind: { path: "$po", preserveNullAndEmptyArrays: true } },

    // robust numeric parsing
    {
      $addFields: {
        __po_value_num: {
          $let: {
            vars: { x: { $ifNull: ["$po.po_value", 0] } },
            in: {
              $cond: [
                { $eq: [{ $type: "$$x" }, "string"] },
                {
                  $convert: {
                    input: {
                      $replaceAll: { input: "$$x", find: ",", replacement: "" },
                    },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                {
                  $convert: {
                    input: "$$x",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              ],
            },
          },
        },
        __total_billed_num: {
          $let: {
            vars: { x: { $ifNull: ["$po.total_billed", 0] } },
            in: {
              $cond: [
                { $eq: [{ $type: "$$x" }, "string"] },
                {
                  $convert: {
                    input: {
                      $replaceAll: { input: "$$x", find: ",", replacement: "" },
                    },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                {
                  $convert: {
                    input: "$$x",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              ],
            },
          },
        },
      },
    },

    // flatten & compute status for filtering
    {
      $addFields: {
        item: "$po.item",
        project_id: "$po.p_id",
        vendor: "$po.vendor",
        po_no: "$po_number",
        bill_no: "$bill_number",
        po_value: "$__po_value_num",
        total_billed: "$__total_billed_num",
        po_status: {
          $cond: [
            { $eq: ["$__po_value_num", "$__total_billed_num"] },
            "fully billed",
            "waiting bills",
          ],
        },
      },
    },

    ...(filters.length ? [{ $match: { $and: filters } }] : []),

    { $sort: { createdAt: -1, _id: -1 } },

    {
      $facet: {
        totalCount: [{ $count: "count" }],
        data: [
          { $skip: skip },
          { $limit: pageSize },

          // capture sort keys for stable re-sort after group
          { $addFields: { __sortAt: "$createdAt", __sortId: "$_id" } },

          {
            $lookup: {
              from: "vendors",
              let: { vendorId: "$po.vendor" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        "$_id",
                        {
                          $cond: [
                            { $eq: [{ $type: "$$vendorId" }, "objectId"] },
                            "$$vendorId",
                            null,
                          ],
                        },
                      ],
                    },
                  },
                },
                { $project: { name: 1 } },
              ],
              as: "vendorDoc",
            },
          },

          {
            $addFields: {
              vendor: {
                $ifNull: [
                  { $arrayElemAt: ["$vendorDoc.name", 0] },
                  "$po.vendor",
                ],
              },
            },
          },

          // re-sort deterministically
          { $sort: { __sortAt: -1, __sortId: -1 } },

          // approver name (page only)
          {
            $lookup: {
              from: "users",
              localField: "approved_by",
              foreignField: "_id",
              pipeline: [
                { $project: { _id: 0, name: 1, full_name: 1, username: 1 } },
              ],
              as: "_approvedUser",
            },
          },
          {
            $addFields: {
              approved_by_name: {
                $ifNull: [
                  { $arrayElemAt: ["$_approvedUser.name", 0] },
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$_approvedUser.full_name", 0] },
                      { $arrayElemAt: ["$_approvedUser.username", 0] },
                    ],
                  },
                ],
              },
            },
          },
          { $addFields: { created_on: "$createdAt" } },
          {
            $unset: [
              "__sortAt",
              "__sortId",
              "_cat",
              "_itemArr",
              "_approvedUser",
              "_wasItemArray",
              "items",
            ],
          },
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
              received: "$status",
              created_on: 1,
              approved_by: 1,
              approved_by_name: 1,
            },
          },
        ],
      },
    },

    {
      $addFields: {
        total: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
      },
    },
    { $project: { totalCount: 0 } },
  ];

  const [result] = await billModel.aggregate(pipeline);
  const data = result?.data || [];
  const total = result?.total || 0;

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
  const { Ids } = req.body;

  let matchStage = {};
  const parseDate = (str) => {
    const [day, month, year] = str.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const objectIds = Ids.map((id) => new mongoose.Types.ObjectId(id));
  if (objectIds.length > 0) {
    matchStage = { _id: { $in: objectIds } }
  }
  else if (exportAll !== "all") {
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
      $addFields: {
        created_on: { $ifNull: ["$createdAt", "$created_on"] },
        _approved_oid: {
          $let: {
            vars: { t: { $type: "$approved_by" } },
            in: {
              $cond: [
                { $eq: ["$$t", "objectId"] },
                "$approved_by",
                {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$$t", "string"] },
                        {
                          $regexMatch: {
                            input: "$approved_by",
                            regex: /^[a-f0-9]{24}$/i,
                          },
                        },
                      ],
                    },
                    { $toObjectId: "$approved_by" },
                    null,
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { uid: "$_approved_oid" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
          {
            $project: {
              _id: 0,
              name: {
                $ifNull: [
                  "$name",
                  {
                    $trim: {
                      input: {
                        $concat: [
                          { $ifNull: ["$first_name", ""] },
                          " ",
                          { $ifNull: ["$last_name", ""] },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
        as: "approved_user",
      },
    },
    {
      $addFields: {
        approved_by_name: {
          $ifNull: [
            { $arrayElemAt: ["$approved_user.name", 0] },
            "$approved_by",
          ],
        },
      },
    },
    {
      $project: {
        bill_number: 1,
        bill_date: 1,
        bill_value: 1,
        approved_by: "$approved_by_name",
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

      const adjustedTotalBilled =
        prevTotalBilled - prevBillValue + newBillValue;

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

const normStr = (v) =>
  v == null ? "" : String(Array.isArray(v) ? v[0] : v).trim();

const bill_approved = catchAsyncError(async (req, res, next) => {
  let { po_number, bill_number } = req.body;
  const rawUserId = req.user?.userId;

  po_number = normStr(po_number);
  bill_number = normStr(bill_number);

  if (!po_number) return next(new ErrorHandler("PO number is required.", 400));

  const approverId = toObjectIdOrNull(rawUserId);
  if (!approverId) return next(new ErrorHandler("Invalid approver id.", 400));

  const expr = {
    $and: [
      {
        $eq: [
          { $trim: { input: { $toString: "$po_number" } } },
          po_number,
        ],
      },
      ...(bill_number
        ? [
          {
            $eq: [
              { $trim: { input: { $toString: "$bill_number" } } },
              bill_number,
            ],
          },
        ]
        : []),
    ],
  };

  const bill = await billModel.findOne({ $expr: expr }).lean();
  if (!bill) return next(new ErrorHandler("Bill not found.", 404));

  const cleanedApprovedBy = toObjectIdOrNull(bill.approved_by);
  const patch = {};

  if (bill.approved_by === "" || bill.approved_by !== cleanedApprovedBy) {
    patch.approved_by = cleanedApprovedBy;
  }

  if (cleanedApprovedBy) {
    if (Object.keys(patch).length) {
      await billModel.updateOne({ _id: bill._id }, { $set: patch });
    }
    const refreshed = await billModel.findById(bill._id).lean();
    return res.status(200).json({
      success: true,
      msg: "Bill already approved.",
      data: refreshed,
    });
  }

  patch.approved_by = approverId;
  await billModel.updateOne({ _id: bill._id }, { $set: patch });

  const updated = await billModel.findById(bill._id).lean();
  return res.status(200).json({
    success: true,
    msg: "Bill approved successfully.",
    data: updated,
  });
});



function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(s = "") {
  return s.trim().replace(/\s+/g, " ");
}

async function findUserByName(raw) {
  const name = normalizeName(raw);
  if (!name) return null;

  let user = await userModells
    .findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    })
    .lean();

  if (user) return user;

  // 2) fallback: contains (case-insensitive)
  user = await userModells
    .findOne({
      name: { $regex: escapeRegex(name), $options: "i" },
    })
    .lean();

  return user || null;
}

const manipulatebill = async (req, res) => {
  try {
    // Only fetch bills where either field is a string -> reduces work
    const bills = await billModel
      .find({
        $or: [
          { submitted_by: { $type: "string" } },
          { approved_by: { $type: "string" } },
        ],
      })
      .lean(); // lean for speed; we'll bulkWrite updates

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
      updated: bulkResult ? bulkResult.modifiedCount || 0 : 0,
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
  manipulatebill,
};
