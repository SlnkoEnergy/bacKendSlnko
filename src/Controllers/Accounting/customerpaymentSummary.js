const CreditModel = require("../../models/addMoneyModells");
const DebitModel = require("../../models/debitMoneyModells");
const AdjustmentModel = require("../../models/adjustmentRequestModells");
const ClientModel = require("../../models/purchaseorder.model");
const ProjectModel = require("../../models/project.model");
const { Parser } = require("json2csv");
const { default: axios } = require("axios");

const asDouble = (expr) => ({
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

const inr = (n) => Number(n || 0);

const fmtDate = (d) => {
  const dt = d ? new Date(d) : null;
  if (!dt || isNaN(dt)) return "-";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const roundMoney = (v, digits = 0) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  const r = Math.round(n * p) / p;
  return Object.is(r, -0) ? 0 : r;
};
const digitsByKey = {};

const getCustomerPaymentSummary = async (req, res) => {
  try {
    const {
      p_id,
      _id,
      export: exportToCSV,
      start,
      end,
      search,
      searchClient,
      searchDebit,
      searchAdjustment,
    } = req.query;

    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    if (endDate) endDate.setHours(23, 59, 59, 999);

    if (!p_id && !_id) {
      return res
        .status(400)
        .json({ error: "Either Project ID (p_id) or Mongo _id is required." });
    }

    const pickFields = {
      name: 1,
      p_group: 1,
      project_kwp: 1,
      customer: 1,
      code: 1,
      billing_type: 1,
      billing_address: 1,
      site_address: 1,
      p_id: 1,
    };

    const isHex24 = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);

    let projectDoc = null;

    if (_id && isHex24(_id)) {
      projectDoc = await ProjectModel.findById(_id, pickFields).lean();
    }

    if (!projectDoc && p_id) {
      const pidVal = isNaN(p_id) ? p_id : Number(p_id);
      projectDoc = await ProjectModel.findOne(
        { p_id: pidVal },
        pickFields
      ).lean();
    }

    if (!projectDoc) {
      return res.status(404).json({ error: "Project not found." });
    }

    const projectId = projectDoc.p_id;
    const projectCode = projectDoc.code;
    const projectOid = projectDoc._id;

    // ---------- Project (simple: reuse the doc we already loaded) ----------
    const formatAddress = (address) => {
      if (typeof address === "object" && address !== null) {
        const village = (address.village_name || "")
          .replace(/(^"|"$)/g, "")
          .trim();
        const district = (address.district_name || "")
          .replace(/(^"|"$)/g, "")
          .trim();
        if (
          (!village || village.toUpperCase() === "NA") &&
          (!district || district.toUpperCase() === "NA")
        ) {
          return "-";
        }
        return `${village}, ${district}`;
      }
      if (typeof address === "string") {
        const cleaned = address.trim().replace(/(^"|"$)/g, "");
        return cleaned || "-";
      }
      return "-";
    };

    const project = {
      name: projectDoc.name,
      p_group: projectDoc.p_group,
      project_kwp: projectDoc.project_kwp,
      customer: projectDoc.customer,
      code: projectDoc.code,
      billing_type: projectDoc.billing_type,
      billing_address: projectDoc.billing_address,
      site_address: projectDoc.site_address,
    };

    project.billing_address_formatted = formatAddress(project.billing_address);
    project.site_address_formatted = formatAddress(project.site_address);

    // ---------- Credit ----------
    const creditMatch = {
      p_id: projectId,
      ...(start || end ? { cr_date: {} } : {}),
    };
    if (start) creditMatch.cr_date.$gte = new Date(start);
    if (end) creditMatch.cr_date.$lte = new Date(end);

    const [creditData] = await CreditModel.aggregate([
      { $match: creditMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                cr_date: 1,
                cr_mode: 1,
                cr_amount: 1,
                createdAt: 1,
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalCredited: { $sum: asDouble("$cr_amount") },
              },
            },
          ],
        },
      },
    ]);
    const creditHistory = creditData?.history || [];
    const totalCredited = creditData?.summary?.[0]?.totalCredited || 0;

    // ---------- Debit ----------
    const debitMatch = { p_id: projectId };
    if (searchDebit) {
      const regex = new RegExp(searchDebit, "i");
      debitMatch.$or = [
        { paid_for: regex },
        { vendor: regex },
        { po_number: regex },
      ];
    }
    if (startDate || endDate) {
      debitMatch.dbt_date = {};
      if (startDate) debitMatch.dbt_date.$gte = new Date(startDate);
      if (endDate) debitMatch.dbt_date.$lte = new Date(endDate);
    }

    const [debitData] = await DebitModel.aggregate([
      { $match: debitMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                amount_paid: 1,
                paid_for: 1,
                po_number: 1,
                utr: 1,
                updatedAt: 1,
                createdAt: 1,
                vendor: 1,
                dbt_date: 1,
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalDebited: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
        },
      },
    ]);
    const debitHistory = debitData?.history || [];
    const totalDebited = debitData?.summary?.[0]?.totalDebited || 0;

    // ---------- Adjustment ----------
    const adjustmentMatch = { p_id: projectId };
    if (searchAdjustment)
      adjustmentMatch.remark = new RegExp(searchAdjustment, "i");
    if (startDate || endDate) {
      adjustmentMatch.createdAt = {};
      if (startDate) adjustmentMatch.createdAt.$gte = startDate;
      if (endDate) adjustmentMatch.createdAt.$lte = endDate;
    }

    const [adjustmentData] = await AdjustmentModel.aggregate([
      { $match: adjustmentMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                adj_type: 1,
                adj_amount: 1,
                adj_date: 1,
                comment: 1,
                pay_type: 1,
                po_number: 1,
                updatedAt: 1,
                createdAt: 1,
                paid_for: 1,
                description: "$comment",
                adj_amount_numeric: { $abs: asDouble("$adj_amount") },
                debit_adjustment: {
                  $cond: [
                    { $eq: ["$adj_type", "Subtract"] },
                    { $abs: asDouble("$adj_amount") },
                    0,
                  ],
                },
                credit_adjustment: {
                  $cond: [
                    { $eq: ["$adj_type", "Add"] },
                    { $abs: asDouble("$adj_amount") },
                    0,
                  ],
                },
              },
            },
          ],
          summary: [
            {
              $project: {
                adj_type: 1,
                adj_amount_numeric: { $abs: asDouble("$adj_amount") },
              },
            },
            {
              $group: {
                _id: null,
                totalCreditAdjustment: {
                  $sum: {
                    $cond: [
                      { $eq: ["$adj_type", "Add"] },
                      "$adj_amount_numeric",
                      0,
                    ],
                  },
                },
                totalDebitAdjustment: {
                  $sum: {
                    $cond: [
                      { $eq: ["$adj_type", "Subtract"] },
                      "$adj_amount_numeric",
                      0,
                    ],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                totalCreditAdjustment: 1,
                totalDebitAdjustment: 1,
              },
            },
          ],
        },
      },
    ]);

    const adjustmentHistory = adjustmentData?.history || [];
    const totalCreditAdjustment =
      adjustmentData?.summary?.[0]?.totalCreditAdjustment || 0;
    const totalDebitAdjustment =
      adjustmentData?.summary?.[0]?.totalDebitAdjustment || 0;

    // ---------- Client History (POs) ----------
    const searchRegex = searchClient ? new RegExp(searchClient, "i") : null;

    const clientHistoryResult = await ProjectModel.aggregate([
      { $match: { _id: projectOid } },
      { $project: { _id: 1, code: 1 } },
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$project_id", "$$projectId"] },
                    { $in: ["$isSales", [false, "false", 0, "0", null]] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                po_number: 1,
                vendor: 1,
                item: 1,
                po_value: asDouble("$po_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),
                createdAt: 1,
                po_numberStr: { $toString: "$po_number" },
                // CHANGED: surface total_billed from PO
                total_billed: { $toDouble: { $ifNull: ["$total_billed", 0] } }, // CHANGED
              },
            },
            // keep approved payments
            {
              $lookup: {
                from: "payrequests",
                let: { po_numberStr: "$po_numberStr" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: [
                              { $toString: "$po_number" },
                              "$$po_numberStr",
                            ],
                          },
                          { $eq: ["$approved", "Approved"] },
                          {
                            $or: [
                              { $eq: ["$acc_match", "matched"] },
                              {
                                $eq: [
                                  "$approval_status.stage",
                                  "Initial Account",
                                ],
                              },
                            ],
                          },
                          { $ne: ["$utr", ""] },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalPaid: { $sum: asDouble("$amount_paid") },
                    },
                  },
                ],
                as: "approved_payment",
              },
            },
          ],
          as: "purchase_orders",
        },
      },
      {
        $unwind: {
          path: "$purchase_orders",
          preserveNullAndEmptyArrays: false,
        },
      },
      { $match: { "purchase_orders._id": { $exists: true } } },
      { $sort: { "purchase_orders.createdAt": -1 } },
      {
        $addFields: {
          poItems: {
            $cond: [
              { $eq: [{ $type: "$purchase_orders.item" }, "array"] },
              "$purchase_orders.item",
              [],
            ],
          },
        },
      },
      {
        $addFields: {
          productNames: {
            $filter: {
              input: {
                $map: {
                  input: "$poItems",
                  as: "it",
                  in: {
                    $trim: {
                      input: {
                        $ifNull: [
                          "$$it.product_name",
                          { $ifNull: ["$$it.name", ""] },
                        ],
                      },
                    },
                  },
                },
              },
              as: "pn",
              cond: { $ne: ["$$pn", ""] },
            },
          },
        },
      },
      {
        $addFields: {
          item_name: {
            $cond: [
              { $gt: [{ $size: "$productNames" }, 0] },
              {
                $reduce: {
                  input: "$productNames",
                  initialValue: "",
                  in: {
                    $concat: [
                      {
                        $cond: [
                          { $eq: ["$$value", ""] },
                          "",
                          { $concat: ["$$value", ", "] },
                        ],
                      },
                      "$$this",
                    ],
                  },
                },
              },
              {
                $cond: [
                  { $eq: [{ $type: "$purchase_orders.item" }, "string"] },
                  "$purchase_orders.item",
                  "-",
                ],
              },
            ],
          },
        },
      },
      ...(searchRegex
        ? [
            {
              $match: {
                $or: [
                  { "purchase_orders.vendor": searchRegex },
                  { "purchase_orders.po_number": searchRegex },
                  { code: searchRegex },
                  { resolvedCatNames: { $elemMatch: { $regex: searchRegex } } },
                ],
              },
            },
          ]
        : []),
      {
        $project: {
          _id: "$purchase_orders._id",
          project_code: "$code",
          po_number: "$purchase_orders.po_number",
          vendor: "$purchase_orders.vendor",
          item_name: 1,
          po_value: asDouble("$purchase_orders.po_value"),
          advance_paid: {
            $cond: [
              {
                $gt: [
                  {
                    $size: {
                      $ifNull: ["$purchase_orders.approved_payment", []],
                    },
                  },
                  0,
                ],
              },
              {
                $arrayElemAt: [
                  {
                    $ifNull: [
                      "$purchase_orders.approved_payment.totalPaid",
                      [0],
                    ],
                  },
                  0,
                ],
              },
              0,
            ],
          },
          // CHANGED: use PO.total_billed directly
          total_billed_value: {
            $toDouble: { $ifNull: ["$purchase_orders.total_billed", 0] },
          }, // CHANGED
          remaining_amount: {
            $subtract: [
              asDouble("$purchase_orders.po_value"),
              {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $ifNull: ["$purchase_orders.approved_payment", []],
                        },
                      },
                      0,
                    ],
                  },
                  {
                    $arrayElemAt: [
                      {
                        $ifNull: [
                          "$purchase_orders.approved_payment.totalPaid",
                          [0],
                        ],
                      },
                      0,
                    ],
                  },
                  0,
                ],
              },
            ],
          },
          po_remaining_amount: {
            $round: [
              {
                $subtract: [
                  { $toDouble: "$purchase_orders.po_value" },
                  {
                    $toDouble: {
                      $ifNull: ["$purchase_orders.total_billed", 0],
                    },
                  }, // CHANGED
                ],
              },
              0,
            ],
          },
          po_basic: asDouble("$purchase_orders.po_basic"),
          gst: asDouble("$purchase_orders.gst"),
          project_id: "$purchase_orders.project_id",
        },
      },
    ]);

    const clientMeta = (clientHistoryResult || [])
      .filter((r) => r && r._id)
      .reduce(
        (acc, curr) => {
          acc.total_advance_paid += Number(curr.advance_paid || 0);
          acc.remaining_amount += Number(curr.remaining_amount || 0);
          acc.total_remaining_amount += Number(curr.remaining_amount || 0);
          acc.total_po_remaining_amount += Number(
            curr.po_remaining_amount || 0
          );
          acc.total_billed_value += Number(curr.total_billed_value || 0);
          acc.total_po_value += Number(curr.po_value || 0);
          acc.total_po_basic += Number(curr.po_basic || 0);
          return acc;
        },
        {
          total_advance_paid: 0,
          remaining_amount: 0,
          total_remaining_amount: 0,
          total_po_remaining_amount: 0,
          total_billed_value: 0,
          total_po_value: 0,
          total_po_basic: 0,
        }
      );

    // ---------- Sales History ----------
    const salesHistoryResult = await ProjectModel.aggregate([
      { $match: { _id: projectOid } },
      { $project: { _id: 1 } },
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$project_id", "$$projectId"] },
                    { $in: ["$isSales", [true, "true", 1, "1"]] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $addFields: { po_numberStr: { $toString: "$po_number" } } },
            {
              $addFields: {
                last_sales_detail: {
                  $let: {
                    vars: {
                      tail: {
                        $slice: [{ $ifNull: ["$sales_Details", []] }, -1],
                      },
                    },
                    in: {
                      $cond: [
                        { $gt: [{ $size: "$$tail" }, 0] },
                        { $arrayElemAt: ["$$tail", 0] },
                        null,
                      ],
                    },
                  },
                },
              },
            },
            // CHANGED: ensure total_billed field present
            {
              $addFields: {
                total_billed: { $toDouble: { $ifNull: ["$total_billed", 0] } },
              },
            }, // CHANGED
            {
              $lookup: {
                from: "payrequests",
                let: { poNum: "$po_numberStr" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
                          { $eq: ["$approved", "Approved"] },
                          {
                            $or: [
                              { $eq: ["$acc_match", "matched"] },
                              {
                                $eq: [
                                  "$approval_status.stage",
                                  "Initial Account",
                                ],
                              },
                            ],
                          },
                          { $ne: ["$utr", ""] },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalPaid: { $sum: asDouble("$amount_paid") },
                    },
                  },
                ],
                as: "approved_payment",
              },
            },
            // CHANGED: remove biildetails lookup entirely
            {
              $project: {
                _id: 1,
                po_number: 1,
                vendor: 1,
                item: 1,
                po_value: asDouble("$po_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),
                createdAt: 1,
                advance_paid: {
                  $cond: [
                    {
                      $gt: [
                        { $size: { $ifNull: ["$approved_payment", []] } },
                        0,
                      ],
                    },
                    {
                      $arrayElemAt: [
                        { $ifNull: ["$approved_payment.totalPaid", [0]] },
                        0,
                      ],
                    },
                    0,
                  ],
                },
                // CHANGED: total_billed direct
                total_billed_value: {
                  $toDouble: { $ifNull: ["$total_billed", 0] },
                }, // CHANGED
                remaining_amount: {
                  $subtract: [
                    asDouble("$po_value"),
                    {
                      $cond: [
                        {
                          $gt: [
                            { $size: { $ifNull: ["$approved_payment", []] } },
                            0,
                          ],
                        },
                        {
                          $arrayElemAt: [
                            { $ifNull: ["$approved_payment.totalPaid", [0]] },
                            0,
                          ],
                        },
                        0,
                      ],
                    },
                  ],
                },
                total_sales_value: 1,
                po_remaining_amount: {
                  $round: [
                    {
                      $subtract: [
                        asDouble("$po_value"),
                        { $toDouble: { $ifNull: ["$total_billed", 0] } }, // CHANGED
                      ],
                    },
                    0,
                  ],
                },
                remarks: "$last_sales_detail.remarks",
                converted_at: "$last_sales_detail.converted_at",
                user_id: "$last_sales_detail.user_id",
                user_name: 1,
                basic_sales: "$last_sales_detail.basic_sales",
                gst_on_sales: "$last_sales_detail.gst_on_sales",
                attachments: {
                  $map: {
                    input: { $ifNull: ["$last_sales_detail.attachments", []] },
                    as: "a",
                    in: {
                      url: { $ifNull: ["$$a.attachment_url", "$$a.url"] },
                      name: { $ifNull: ["$$a.attachment_name", "$$a.name"] },
                    },
                  },
                },
              },
            },
            {
              $addFields: {
                userIdObj: {
                  $cond: [
                    {
                      $and: [
                        { $eq: [{ $type: "$user_id" }, "string"] },
                        { $eq: [{ $strLenCP: "$user_id" }, 24] },
                        {
                          $regexMatch: {
                            input: "$user_id",
                            regex: "^[0-9a-fA-F]{24}$",
                          },
                        },
                      ],
                    },
                    { $toObjectId: "$user_id" },
                    {
                      $cond: [
                        { $eq: [{ $type: "$user_id" }, "objectId"] },
                        "$user_id",
                        null,
                      ],
                    },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "userIdObj",
                foreignField: "_id",
                as: "user_doc",
              },
            },
            {
              $addFields: {
                user_name: {
                  $ifNull: [{ $arrayElemAt: ["$user_doc.name", 0] }, null],
                },
              },
            },
            { $project: { user_doc: 0, userIdObj: 0 } },
          ],
          as: "sales_orders",
        },
      },
      { $unwind: { path: "$sales_orders", preserveNullAndEmptyArrays: false } },
      { $replaceRoot: { newRoot: "$sales_orders" } },
    ]);

    const salesMeta = salesHistoryResult.reduce(
      (acc, row) => {
        const po = Number(row.po_value || 0);
        const adv = Number(row.advance_paid || 0);
        const rem = Number(row.remaining_amount || po - adv);
        const total_sales_value = Number(row.total_sales_value || 0);
        const po_rem = Number(row.po_remaining_amount || 0);
        const basic = Number(row.po_basic || 0);
        const gst = Number(row.gst || 0);
        const billed = Number(row.total_billed_value || 0);

        acc.total_advance_paid += adv;
        acc.total_remaining_amount += rem;
        acc.total_sales_value += total_sales_value;
        acc.total_po_remaining_amount += po_rem;
        acc.total_billed_value += billed;
        acc.total_po_basic += basic;
        acc.total_gst += gst;

        acc.count += 1;
        acc.attachments += Array.isArray(row.attachments)
          ? row.attachments.length
          : 0;
        return acc;
      },
      {
        total_sales_value: 0,
        total_advance_paid: 0,
        total_remaining_amount: 0,
        total_po_remaining_amount: 0,
        total_billed_value: 0,
        total_po_basic: 0,
        total_gst: 0,
        attachments: 0,
        count: 0,
      }
    );

    // ---------- Balance Summary ----------
    const [balanceSummary = {}] = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      {
        $lookup: {
          from: "addmoneys",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCredit: { $sum: asDouble("$cr_amount") },
              },
            },
          ],
          as: "creditData",
        },
      },
      {
        $lookup: {
          from: "subtract moneys",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$p_id" },
                        { $toString: "$$projectId" },
                      ],
                    },
                    { $eq: ["$paid_for", "Customer Adjustment"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                total_return: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
          as: "returnData",
        },
      },
      {
        $lookup: {
          from: "payrequests",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$p_id" },
                        { $toString: "$$projectId" },
                      ],
                    },
                    { $eq: ["$acc_match", "matched"] },
                    { $eq: ["$approved", "Approved"] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalAdvancePaidToVendors: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
          as: "advancePaymentData",
        },
      },
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } },
            {
              $project: {
                _id: 1,
                isSales: 1,
                po_value: asDouble("$po_value"),
                total_sales_value: asDouble("$total_sales_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),
                total_billed: { $toDouble: { $ifNull: ["$total_billed", 0] } },
                po_number: 1,
              },
            },
          ],
          as: "purchase_orders",
        },
      },
      {
        $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "payrequests",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: "$po_number" }, "$$po_numberStr"] },
                    { $eq: ["$approved", "Approved"] },
                    { $eq: ["$acc_match", "matched"] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalPaid: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
          as: "po_advance_payments",
        },
      },
      {
        $addFields: {
          "purchase_orders.total_billed_value": {
            $toDouble: { $ifNull: ["$purchase_orders.total_billed", 0] },
          },
          "purchase_orders.advance_paid": {
            $cond: [
              {
                $gt: [{ $size: { $ifNull: ["$po_advance_payments", []] } }, 0],
              },
              {
                $arrayElemAt: [
                  { $ifNull: ["$po_advance_payments.totalPaid", [0]] },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "adjustmentrequests",
          let: { projectId: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$projectId"] } } },
            {
              $project: {
                adj_amount: 1,
                adj_type: 1,
                credit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Add"] },
                    asDouble("$adj_amount"),
                    0,
                  ],
                },
                debit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Subtract"] },
                    asDouble("$adj_amount"),
                    0,
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCreditAdjustment: { $sum: "$credit_adj" },
                totalDebitAdjustment: { $sum: "$debit_adj" },
              },
            },
          ],
          as: "adjustmentData",
        },
      },
      {
        $group: {
          _id: "$p_id",
          billing_type: { $first: "$billing_type" },
          totalCredit: {
            $first: {
              $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0],
            },
          },
          total_return: {
            $first: {
              $ifNull: [{ $arrayElemAt: ["$returnData.total_return", 0] }, 0],
            },
          },
          totalAdvancePaidToVendors: {
            $first: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    "$advancePaymentData.totalAdvancePaidToVendors",
                    0,
                  ],
                },
                0,
              ],
            },
          },
          total_po_with_gst: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
                  ],
                },
                asDouble("$purchase_orders.po_value"),
                0,
              ],
            },
          },
          total_sales_value: {
            $sum: {
              $cond: [
                { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
                asDouble("$purchase_orders.total_sales_value"),
                0,
              ],
            },
          },
          total_advance_paid: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
                  ],
                },
                asDouble("$purchase_orders.advance_paid"),
                0,
              ],
            },
          },
          total_billed_value: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
                  ],
                },
                asDouble("$purchase_orders.total_billed"),
                0,
              ],
            },
          },
          total_po_basic: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$purchase_orders.isSales",
                        [false, "false", 0, "0", null],
                      ],
                    },
                    { $ne: ["$purchase_orders.po_basic", null] },
                    { $ne: ["$purchase_orders.po_basic", ""] },
                  ],
                },
                asDouble("$purchase_orders.po_basic"),
                0,
              ],
            },
          },
          gst_as_po_basic: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$purchase_orders.isSales",
                        [false, "false", 0, "0", null],
                      ],
                    },
                    { $ne: ["$purchase_orders.gst", null] },
                    { $ne: ["$purchase_orders.gst", ""] },
                  ],
                },
                asDouble("$purchase_orders.gst"),
                0,
              ],
            },
          },

          totalCreditAdjustment: {
            $first: {
              $ifNull: [
                { $arrayElemAt: ["$adjustmentData.totalCreditAdjustment", 0] },
                0,
              ],
            },
          },
          totalDebitAdjustment: {
            $first: {
              $ifNull: [
                { $arrayElemAt: ["$adjustmentData.totalDebitAdjustment", 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          expected_po_value: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$billing_type", "Composite"] },
                  then: { $multiply: ["$total_advance_paid", 1.138] },
                },
                {
                  case: { $eq: ["$billing_type", "Individual"] },
                  then: { $multiply: ["$total_advance_paid", 1.18] },
                },
              ],
              default: 0,
            },
          },
        },
      },

      {
        $addFields: {
          total_po_remaining_amount: {
            $round: [
              {
                $subtract: [
                  { $add: ["$total_po_basic", "$gst_as_po_basic"] },
                  "$total_billed_value",
                ],
              },
              0,
            ],
          },
        },
      },

      {
        $addFields: {
          extraGST: {
            $round: [
              {
                $cond: [
                  { $gt: ["$total_po_basic", 0] },
                  { $subtract: ["$total_po_with_gst", "$total_po_basic"] },
                  0,
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          balance_payable_to_vendors: {
            $subtract: [
              { $subtract: ["$total_po_with_gst", "$total_billed_value"] },
              { $subtract: ["$total_advance_paid", "$total_billed_value"] },
            ],
          },
        },
      },
      {
        $addFields: {
          tcs_as_applicable: {
            $cond: [
              {
                $gt: [
                  { $subtract: ["$totalCredit", "$total_return"] },
                  5000000,
                ],
              },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $subtract: [
                          { $subtract: ["$totalCredit", "$total_return"] },
                          5000000,
                        ],
                      },
                      0.001,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          total_adjustment: {
            $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"],
          },
        },
      },
      {
        $addFields: {
          balance_with_slnko: {
            $subtract: [
              {
                $subtract: [
                  {
                    $subtract: [
                      { $ifNull: ["$totalCredit", 0] },
                      { $ifNull: ["$total_return", 0] },
                    ],
                  },
                  { $ifNull: ["$total_advance_paid", 0] },
                ],
              },
              { $ifNull: ["$total_adjustment", 0] },
            ],
          },
        },
      },
      {
        $addFields: {
          gst_with_type_percentage: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$billing_type", "Composite"] },
                  then: { $round: [{ $multiply: ["$total_po_basic", 0.138] }] },
                },
                {
                  case: { $eq: ["$billing_type", "Individual"] },
                  then: { $round: [{ $multiply: ["$total_po_basic", 0.18] }] },
                },
              ],
              default: 0,
            },
          },
        },
      },
      {
        $addFields: {
          gst_difference: {
            $cond: [
              { $gt: ["$gst_with_type_percentage", "$gst_as_po_basic"] },
              { $subtract: ["$gst_with_type_percentage", "$gst_as_po_basic"] },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          balance_required: {
            $round: [
              {
                $subtract: [
                  { $ifNull: ["$balance_with_slnko", 0] },
                  {
                    $add: [
                      { $ifNull: ["$balance_payable_to_vendors", 0] },
                      { $ifNull: ["$tcs_as_applicable", 0] },
                    ],
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
          total_unbilled_sales: {
            $round: [
              {
                $subtract: [
                  { $ifNull: ["$total_billed_value", 0] },
                  { $ifNull: ["$total_sales_value", 0] },
                ],
              },
              2,
            ],
          },
        },
      },
      {
        $addFields: {
          remaining_amount: {
            $round: [
              {
                $subtract: [
                  { $add: ["$total_po_basic", "$gst_as_po_basic"] },
                  { $ifNull: ["$total_advance_paid", 0] },
                ],
              },
              0,
            ],
          },
        },
      },
      {
  $addFields: {
    exact_remaining_pay_to_vendors: {
      $cond: {
        if: { $gt: ["$total_billed_value", "$total_advance_paid"] },
        then: {
          $round: [
            {
              $subtract: [
                { $ifNull: ["$total_po_with_gst", 0] },
                { $ifNull: ["$total_billed_value", 0] }
              ]
            },
            2
          ]
        },
        else: { $ifNull: ["$total_advance_paid", 0] }
      }
    }
  }
},

      
      {
        $project: {
          _id: 0,
          billing_type: 1,
          total_received: "$totalCredit",
          total_return: 1,
          netBalance: { $subtract: ["$totalCredit", "$total_return"] },
          total_po_basic: 1,
          total_advance_paid: 1,
          total_billed_value: 1,
          extraGST: 1,
          balance_with_slnko: 1,
          balance_payable_to_vendors: 1,
          tcs_as_applicable: 1,
          total_adjustment: 1,
          net_advanced_paid: {
            $subtract: ["$total_advance_paid", "$total_billed_value"],
          },
          gst_as_po_basic: 1,
          total_po_with_gst: 1,
          gst_with_type_percentage: 1,
          gst_difference: 1,
          balance_required: 1,
          total_sales_value: 1,
          total_po_remaining_amount: 1, // total_po_gst-total_billed
          total_unbilled_sales: 1, // total_billed - total_sales_values
          remaining_amount: 1, // total_po_with_gst - total_advance_paid
          advance_left_after_billed: {
            $round: [
              {
                $subtract: [
                  { $ifNull: ["$total_advance_paid", 0] },
                  {
                    $add: [
                      { $ifNull: ["$total_sales_value", 0] },
                      { $ifNull: ["$total_unbilled_sales", 0] },
                    ],
                  },
                ],
              },
              2,
            ],
          }, // total_advance_paid - (total_sales_value + total_unbilled_sales)

          exact_remaining_pay_to_vendors: 1,
        },
      },
    ]);

    const responseData = {
      projectDetails: {
        customer_name: project.customer,
        p_group: project.p_group || "N/A",
        project_kwp: project.project_kwp,
        name: project.name,
        code: project.code,
        billing_type: project.billing_type,
        billing_address: project.billing_address_formatted,
        site_address: project.site_address_formatted,
      },
      credit: { history: creditHistory, total: totalCredited },
      debit: { history: debitHistory, total: totalDebited },
      clientHistory: { data: clientHistoryResult, meta: clientMeta },
      salesHistory: { data: salesHistoryResult, meta: salesMeta },
      adjustment: {
        history: adjustmentHistory,
        totalCredit: totalCreditAdjustment,
        totalDebit: totalDebitAdjustment,
      },
      summary: {
        totalCredited,
        totalDebited,
        netBalance: totalCredited - totalDebited,
      },
      balanceSummary,
    };

    // CSV export path unchanged
    if (exportToCSV === "csv") {
      const EOL = "\n";
      const BOM = "\uFEFF";
      const csvEsc = (v) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const formatISO = (d) => {
        const dt = d ? new Date(d) : null;
        return dt && !isNaN(dt) ? dt.toISOString().slice(0, 10) : "";
      };
      const INR = (n) =>
        `₹ ${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
      const pushSection = (title, header, rows, parts) => {
        parts.push(title, EOL);
        if (header && header.length)
          parts.push(header.map(csvEsc).join(","), EOL);
        rows.forEach((r) => parts.push(r.map(csvEsc).join(","), EOL));
        parts.push(EOL);
      };
      const parts = [];

      pushSection(
        "Project Details",
        ["Field", "Value"],
        Object.entries(responseData.projectDetails || {}),
        parts
      );

      if ((creditHistory || []).length) {
        pushSection(
          "Credit History",
          ["S.No.", "Credit Date", "Credit Mode", "Credited Amount"],
          creditHistory.map((r, i) => [
            i + 1,
            formatISO(r.cr_date || r.createdAt),
            r.cr_mode || "-",
            Math.round(r.cr_amount ?? 0),
          ]),
          parts
        );
      }

      if ((debitHistory || []).length) {
        pushSection(
          "Debit History",
          [
            "S.No.",
            "Debit Date",
            "PO Number",
            "Paid For",
            "Paid To",
            "Amount",
            "UTR",
          ],
          debitHistory.map((r, i) => [
            i + 1,
            formatISO(r.dbt_date || r.createdAt),
            r.po_number || "-",
            r.paid_for || "-",
            r.vendor || "-",
            Math.round(r.amount_paid ?? 0),
            r.utr || "-",
          ]),
          parts
        );
      }

      if ((adjustmentHistory || []).length) {
        pushSection(
          "Adjustment History",
          [
            "S.No.",
            "Adjust Date",
            "Adjustment Type",
            "Reason",
            "PO Number",
            "Paid For",
            "Description",
            "Credit Adjustment",
            "Debit Adjustment",
          ],
          adjustmentHistory.map((r, i) => [
            i + 1,
            formatISO(r.adj_date || r.createdAt),
            r.pay_type || "-",
            r.description || "-",
            r.po_number || "-",
            r.paid_for || "-",
            r.comment || "-",
            r.adj_type === "Add" ? Math.round(r.adj_amount ?? 0) : "",
            r.adj_type === "Subtract" ? Math.round(r.adj_amount ?? 0) : "",
          ]),
          parts
        );
      }

      const clientRows = clientHistoryResult || [];
      if (clientRows.length) {
        pushSection(
          "Client History",
          [
            "S.No.",
            "PO Number",
            "Vendor",
            "Item Name",
            "PO Value",
            "Advance Paid",
            "Remaining Amount",
            "PO Remaining (Unbilled)",
            "Total Billed Value",
          ],
          clientRows.map((row, i) => [
            i + 1,
            row.po_number || "-",
            row.vendor || "-",
            row.item_name || "-",
            Math.round(row.po_value ?? 0),
            Math.round(row.advance_paid ?? 0),
            Math.round(row.remaining_amount ?? 0),
            Math.round(row.po_remaining_amount ?? 0),
            Math.round(row.total_billed_value ?? 0),
          ]),
          parts
        );
      }

      const salesRows =
        responseData?.salesHistory?.data ?? salesHistoryResult ?? [];
      if (salesRows.length) {
        pushSection(
          "Sales History",
          [
            "S.No.",
            "PO Number",
            "Vendor",
            "Item",
            "Total Sales",
            "Converted At",
            "Remarks",
            "Attachment Names",
            "Attachment URLs",
          ],
          salesRows.map((row, i) => {
            const itemLabel = Array.isArray(row.item)
              ? row.item
                  .map(
                    (it) =>
                      it?.product_name ||
                      it?.category?.name ||
                      it?.category ||
                      it?.name ||
                      ""
                  )
                  .filter(Boolean)
                  .join(", ") || "-"
              : typeof row.item === "string"
                ? row.item
                : row.item_name || "-";

            const atts = Array.isArray(row.attachments) ? row.attachments : [];
            const attNames = atts
              .map((a) => a?.name || a?.attachment_name || "")
              .filter(Boolean)
              .join(" | ");
            const attUrls = atts
              .map((a) => a?.url || a?.attachment_url || "")
              .filter(Boolean)
              .join(" | ");

            return [
              i + 1,
              row.po_number || "-",
              row.vendor || "-",
              itemLabel,
              Math.round(row.po_value ?? 0),
              formatISO(row.converted_at),
              row.remarks || "",
              attNames,
              attUrls,
            ];
          }),
          parts
        );
      }

      const bs = balanceSummary || {};
      const bt = bs.billing_type;
      const gstLabel =
        bt === "Composite"
          ? "GST (13.8%)"
          : bt === "Individual"
            ? "GST (18%)"
            : "GST (Type - N/A)";

      const bsRows = [
        ["1", "Total Received", INR(bs.total_received)],
        ["2", "Total Return", INR(bs.total_return)],
        ["3", "Net Balance ([1]-[2])", INR(bs.netBalance)],
        ["4", "Total Advance Paid to Vendors", INR(bs.total_advance_paid)],
        ["4A", "Total Adjustment (Debit-Credit)", INR(bs.total_adjustment)],
        ["4B", "Total Advances Remaining", INR(bs.remaining_amount)],
        ["5", "Balance With Slnko ([3]-[4]-[4A])", INR(bs.balance_with_slnko)],
        ["6", "Total PO Basic Value", INR(bs.total_po_basic)],
        ["7", "GST Value as per PO", INR(bs.gst_as_po_basic)],
        ["8", "Total PO with GST", INR(bs.total_po_with_gst)],
        ["8A", "Total Sales with GST", INR(bs.total_sales_value)],
        [
          "8B",
          "Total Unbilled Sales ([10]-[8A])",
          INR(bs.total_unbilled_sales),
        ],
        ["9", gstLabel, INR(bs.gst_with_type_percentage)],
        ["10", "Total Billed Value", INR(bs.total_billed_value)],
        ["11", "Net Advance Paid ([4]-[10])", INR(bs.net_advanced_paid)],
        [
          "12",
          "Balance Payable to Vendors ([8]-[10]-[11])",
          INR(bs.balance_payable_to_vendors),
        ],
        ["13", "TCS as Applicable", INR(bs.tcs_as_applicable)],
        ["14", "Extra GST Recoverable from Client ([8]-[6])", INR(bs.extraGST)],
        ["15", "Balance Required ([5]-[12]-[13])", INR(bs.balance_required)],
      ];

      pushSection(
        "Balance Summary",
        ["S.No.", "Description", "Value"],
        bsRows,
        parts
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="payment_summary_${(project && project.code) || projectId}.csv"`
      );
      return res.send(BOM + parts.join(""));
    }

    // --- JSON response ---
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const postCustomerPaymentSummaryPdf = async (req, res) => {
  try {
    const { p_id } = req.body || {};
    if (!p_id)
      return res
        .status(400)
        .json({ message: "Project ID (p_id) is required." });

    const projectId = isNaN(p_id) ? p_id : Number(p_id);

    // ---------- Project ----------
    const [project] = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      {
        $project: {
          _id: 0,
          name: 1,
          p_group: 1,
          project_kwp: 1,
          customer: 1,
          code: 1,
          billing_type: 1,
          billing_address: 1,
          site_address: 1,
        },
      },
      { $limit: 1 },
    ]);
    if (!project)
      return res.status(404).json({ message: "Project not found." });

    const formatAddress = (address) => {
      if (address && typeof address === "object") {
        const village = (address.village_name || "")
          .replace(/(^"|"$)/g, "")
          .trim();
        const district = (address.district_name || "")
          .replace(/(^"|"$)/g, "")
          .trim();
        if (
          (!village || village.toUpperCase() === "NA") &&
          (!district || district.toUpperCase() === "NA")
        )
          return "-";
        return `${village}, ${district}`;
      }
      if (typeof address === "string") {
        const cleaned = address.trim().replace(/(^"|"$)/g, "");
        return cleaned || "-";
      }
      return "-";
    };

    const projectDetails = {
      customer_name: project.customer,
      p_group: project.p_group || "N/A",
      project_kwp: project.project_kwp,
      name: project.name,
      code: project.code,
      billing_type: project.billing_type,
      billing_address: formatAddress(project.billing_address),
      site_address: formatAddress(project.site_address),
    };

    // ---------- Credit (no date filter) ----------
    const creditMatch = { p_id: projectId };
    const [creditData] = await CreditModel.aggregate([
      { $match: creditMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                cr_date: 1,
                cr_mode: 1,
                cr_amount: 1,
                createdAt: 1,
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalCredited: { $sum: asDouble("$cr_amount") },
              },
            },
          ],
        },
      },
    ]);
    const creditHistory = creditData?.history || [];
    const totalCredited = +(creditData?.summary?.[0]?.totalCredited || 0);

    // ---------- Debit (no date filter) ----------
    const debitMatch = { p_id: projectId };
    const [debitData] = await DebitModel.aggregate([
      { $match: debitMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                amount_paid: 1,
                paid_for: 1,
                po_number: 1,
                utr: 1,
                createdAt: 1,
                vendor: 1,
                dbt_date: 1,
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalDebited: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
        },
      },
    ]);
    const debitHistory = debitData?.history || [];
    const totalDebited = +(debitData?.summary?.[0]?.totalDebited || 0);

    // ---------- Adjustments (no date filter) ----------
    const adjustmentMatch = { p_id: projectId };
    const [adjustmentData] = await AdjustmentModel.aggregate([
      { $match: adjustmentMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                adj_type: 1,
                adj_amount: 1,
                adj_date: 1,
                comment: 1,
                pay_type: 1,
                po_number: 1,
                createdAt: 1,
                paid_for: 1,
                description: "$comment",
              },
            },
          ],
          summary: [
            {
              $project: {
                adj_type: 1,
                adj_amount_numeric: { $abs: asDouble("$adj_amount") },
              },
            },
            {
              $group: {
                _id: null,
                totalCreditAdjustment: {
                  $sum: {
                    $cond: [
                      { $eq: ["$adj_type", "Add"] },
                      "$adj_amount_numeric",
                      0,
                    ],
                  },
                },
                totalDebitAdjustment: {
                  $sum: {
                    $cond: [
                      { $eq: ["$adj_type", "Subtract"] },
                      "$adj_amount_numeric",
                      0,
                    ],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                totalCreditAdjustment: 1,
                totalDebitAdjustment: 1,
              },
            },
          ],
        },
      },
    ]);
    const adjustmentHistory = adjustmentData?.history || [];

    // ---------- Purchases ----------
    const clientHistoryResult = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      { $project: { _id: 1 } },
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$project_id", "$$projectId"] },
                    { $in: ["$isSales", [false, "false", 0, "0", null]] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                po_number: 1,
                vendor: 1,
                item: 1,
                po_value: asDouble("$po_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),
                createdAt: 1,
              },
            },
            { $addFields: { po_numberStr: { $toString: "$po_number" } } },
            {
              $lookup: {
                from: "payrequests",
                let: { poNum: "$po_numberStr" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
                          { $eq: ["$approved", "Approved"] },
                          { $ne: ["$utr", ""] },
                          {
                            $or: [
                              { $eq: ["$acc_match", "matched"] },
                              {
                                $eq: [
                                  "$approval_status.stage",
                                  "Initial Account",
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalPaid: { $sum: asDouble("$amount_paid") },
                    },
                  },
                ],
                as: "approved_payment",
              },
            },
            {
              $lookup: {
                from: "biildetails",
                let: { poNum: "$po_numberStr" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalBilled: { $sum: asDouble("$bill_value") },
                    },
                  },
                ],
                as: "billed_summary",
              },
            },
            {
              $project: {
                _id: 1,
                po_number: 1,
                project_id: 1,
                vendor: 1,
                item: 1,
                po_value: 1,
                po_basic: 1,
                gst: 1,
                advance_paid: {
                  $ifNull: [
                    { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
                    0,
                  ],
                },
                total_billed_value: {
                  $ifNull: [
                    { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
                    0,
                  ],
                },
              },
            },
            {
              $addFields: {
                remaining_amount: { $subtract: ["$po_value", "$advance_paid"] },
                po_remaining_amount: {
                  $round: [
                    { $subtract: ["$po_value", "$total_billed_value"] },
                    0,
                  ],
                },
              },
            },
          ],
          as: "purchase_orders",
        },
      },
      {
        $unwind: {
          path: "$purchase_orders",
          preserveNullAndEmptyArrays: false,
        },
      },
      { $replaceRoot: { newRoot: "$purchase_orders" } },
    ]);

    // ---------- Sales ----------
    const salesHistoryResult = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      { $project: { _id: 1 } },
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$project_id", "$$projectId"] },
                    { $in: ["$isSales", [true, "true", 1, "1"]] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $addFields: { po_numberStr: { $toString: "$po_number" } } },
            {
              $addFields: {
                last_sales_detail: {
                  $let: {
                    vars: {
                      tail: {
                        $slice: [{ $ifNull: ["$sales_Details", []] }, -1],
                      },
                    },
                    in: {
                      $cond: [
                        { $gt: [{ $size: "$$tail" }, 0] },
                        { $arrayElemAt: ["$$tail", 0] },
                        null,
                      ],
                    },
                  },
                },
              },
            },
            {
              $lookup: {
                from: "payrequests",
                let: { poNum: "$po_numberStr" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
                          { $eq: ["$approved", "Approved"] },
                          { $ne: ["$utr", ""] },
                          {
                            $or: [
                              { $eq: ["$acc_match", "matched"] },
                              {
                                $eq: [
                                  "$approval_status.stage",
                                  "Initial Account",
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalPaid: { $sum: asDouble("$amount_paid") },
                    },
                  },
                ],
                as: "approved_payment",
              },
            },
            {
              $lookup: {
                from: "biildetails",
                let: { poNum: "$po_numberStr" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalBilled: { $sum: asDouble("$bill_value") },
                    },
                  },
                ],
                as: "billed_summary",
              },
            },
            {
              $project: {
                _id: 1,
                po_number: 1,
                vendor: 1,
                item: 1,
                po_value: asDouble("$po_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),
                createdAt: 1,
                advance_paid: {
                  $ifNull: [
                    { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
                    0,
                  ],
                },
                total_billed_value: {
                  $ifNull: [
                    { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
                    0,
                  ],
                },
                remaining_amount: {
                  $subtract: [
                    asDouble("$po_value"),
                    {
                      $ifNull: [
                        { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
                        0,
                      ],
                    },
                  ],
                },
                remarks: "$last_sales_detail.remarks",
                converted_at: "$last_sales_detail.converted_at",
                user_id: "$last_sales_detail.user_id",
                user_name: 1,
                attachments: {
                  $map: {
                    input: { $ifNull: ["$last_sales_detail.attachments", []] },
                    as: "a",
                    in: {
                      url: { $ifNull: ["$$a.attachment_url", "$$a.url"] },
                      name: { $ifNull: ["$$a.attachment_name", "$$a.name"] },
                    },
                  },
                },
              },
            },
          ],
          as: "sales_orders",
        },
      },
      { $unwind: { path: "$sales_orders", preserveNullAndEmptyArrays: false } },
      { $replaceRoot: { newRoot: "$sales_orders" } },
    ]);

    // ---------- Balance Summary (single doc) ----------
    const [balance = {}] = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      {
        $lookup: {
          from: "addmoneys",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCredit: { $sum: asDouble("$cr_amount") },
              },
            },
          ],
          as: "creditData",
        },
      },
      {
        $lookup: {
          from: "subtract moneys",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$p_id" },
                        { $toString: "$$projectId" },
                      ],
                    },
                    { $eq: ["$paid_for", "Customer Adjustment"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                total_return: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
          as: "returnData",
        },
      },
      {
        $lookup: {
          from: "payrequests",
          let: { projectId: "$p_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$p_id" },
                        { $toString: "$$projectId" },
                      ],
                    },
                    { $eq: ["$approved", "Approved"] },
                    { $eq: ["$acc_match", "matched"] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalAdvancePaidToVendors: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
          as: "advancePaymentData",
        },
      },
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } },
          ],
          as: "purchase_orders",
        },
      },
      {
        $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "payrequests",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: "$po_number" }, "$$po_numberStr"] },
                    { $eq: ["$approved", "Approved"] },
                    { $eq: ["$acc_match", "matched"] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalPaid: { $sum: asDouble("$amount_paid") },
              },
            },
          ],
          as: "po_advance_payments",
        },
      },
      {
        $lookup: {
          from: "biildetails",
          let: { poNumber: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: "$po_number" }, "$$poNumber"] },
              },
            },
            {
              $group: {
                _id: null,
                totalBilled: { $sum: asDouble("$bill_value") },
              },
            },
          ],
          as: "billed_summary",
        },
      },
      {
        $addFields: {
          "purchase_orders.total_billed_value": {
            $cond: [
              { $gt: [{ $size: "$billed_summary" }, 0] },
              { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
              0,
            ],
          },
          "purchase_orders.advance_paid": {
            $cond: [
              { $gt: [{ $size: "$po_advance_payments" }, 0] },
              { $arrayElemAt: ["$po_advance_payments.totalPaid", 0] },
              0,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "adjustmentrequests",
          let: { projectId: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$p_id", "$$projectId"] } } },
            {
              $project: {
                adj_amount: 1,
                adj_type: 1,
                credit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Add"] },
                    asDouble("$adj_amount"),
                    0,
                  ],
                },
                debit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Subtract"] },
                    asDouble("$adj_amount"),
                    0,
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCreditAdjustment: { $sum: "$credit_adj" },
                totalDebitAdjustment: { $sum: "$debit_adj" },
              },
            },
          ],
          as: "adjustmentData",
        },
      },
      {
        $group: {
          _id: "$p_id",
          billing_type: { $first: "$billing_type" },
          totalCredit: {
            $first: {
              $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0],
            },
          },
          total_return: {
            $first: {
              $ifNull: [{ $arrayElemAt: ["$returnData.total_return", 0] }, 0],
            },
          },
          total_advance_paid: { $sum: "$purchase_orders.advance_paid" },
          total_billed_value: { $sum: "$purchase_orders.total_billed_value" },
          total_po_basic: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$purchase_orders.po_basic", null] },
                    { $ne: ["$purchase_orders.po_basic", ""] },
                  ],
                },
                asDouble("$purchase_orders.po_basic"),
                0,
              ],
            },
          },
          gst_as_po_basic: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$purchase_orders.gst", null] },
                    { $ne: ["$purchase_orders.gst", ""] },
                  ],
                },
                asDouble("$purchase_orders.gst"),
                0,
              ],
            },
          },
          total_sales_value: {
            $sum: {
              $cond: [
                { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
                asDouble("$purchase_orders.total_sales_value"),
                0,
              ],
            },
          },
          totalCreditAdjustment: {
            $first: {
              $ifNull: [
                { $arrayElemAt: ["$adjustmentData.totalCreditAdjustment", 0] },
                0,
              ],
            },
          },
          totalDebitAdjustment: {
            $first: {
              $ifNull: [
                { $arrayElemAt: ["$adjustmentData.totalDebitAdjustment", 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          total_po_with_gst: { $add: ["$total_po_basic", "$gst_as_po_basic"] },
        },
      },
      {
        $addFields: {
          extraGST: {
            $round: [
              {
                $cond: [
                  { $gt: ["$total_po_basic", 0] },
                  { $subtract: ["$total_po_with_gst", "$total_po_basic"] },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          total_adjustment: {
            $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"],
          },
        },
      },
      {
        $addFields: {
          balance_with_slnko: {
            $subtract: [
              {
                $subtract: [
                  { $subtract: ["$totalCredit", "$total_return"] },
                  "$total_advance_paid",
                ],
              },
              "$total_adjustment",
            ],
          },
        },
      },
      {
        $addFields: {
          gst_with_type_percentage: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$billing_type", "Composite"] },
                  then: { $round: [{ $multiply: ["$total_po_basic", 0.138] }] },
                },
                {
                  case: { $eq: ["$billing_type", "Individual"] },
                  then: { $round: [{ $multiply: ["$total_po_basic", 0.18] }] },
                },
              ],
              default: 0,
            },
          },
        },
      },
      {
        $addFields: {
          balance_payable_to_vendors: {
            $subtract: [
              { $subtract: ["$total_po_with_gst", "$total_billed_value"] },
              { $subtract: ["$total_advance_paid", "$total_billed_value"] },
            ],
          },
        },
      },
      {
        $addFields: {
          tcs_as_applicable: {
            $cond: [
              {
                $gt: [
                  { $subtract: ["$totalCredit", "$total_return"] },
                  5000000,
                ],
              },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $subtract: [
                          { $subtract: ["$totalCredit", "$total_return"] },
                          5000000,
                        ],
                      },
                      0.001,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          net_advanced_paid: {
            $subtract: ["$total_advance_paid", "$total_billed_value"],
          },
        },
      },
      {
        $addFields: {
          balance_required: {
            $round: [
              {
                $subtract: [
                  { $ifNull: ["$balance_with_slnko", 0] },
                  {
                    $add: [
                      { $ifNull: ["$balance_payable_to_vendors", 0] },
                      { $ifNull: ["$tcs_as_applicable", 0] },
                    ],
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
          total_po_remaining_amount: {
            $subtract: ["$total_po_with_gst", "$total_billed_value"],
          },
        },
      },
      {
        $project: {
          _id: 0,
          p_id: "$_id",
          billing_type: 1,
          total_received: "$totalCredit",
          total_return: 1,
          netBalance: { $subtract: ["$totalCredit", "$total_return"] },
          total_po_basic: 1,
          total_advance_paid: 1,
          total_billed_value: 1,
          extraGST: 1,
          balance_with_slnko: 1,
          balance_payable_to_vendors: 1,
          tcs_as_applicable: 1,
          total_adjustment: 1,
          net_advanced_paid: 1,
          gst_as_po_basic: 1,
          total_po_remaining_amount: 1,
          total_po_with_gst: 1,
          gst_with_type_percentage: 1,
          balance_required: 1,
          total_sales_value: 1,
        },
      },
    ]);

    // ---------- shape data for PDF ----------
    const creditHistorys = creditHistory.map((r) => ({
      CreditDate: fmtDate(r.cr_date || r.createdAt),
      mode: r.cr_mode || "",
      amount: inr(r.cr_amount),
    }));

    const DebitHistorys = debitHistory.map((r) => ({
      date: fmtDate(r.dbt_date || r.createdAt),
      po_number: r.po_number || "",
      paid_for: r.paid_for || "",
      paid_to: r.vendor || "",
      amount: inr(r.amount_paid),
      utr: r.utr || "",
    }));

    const purchaseHistorys = clientHistoryResult.map((r) => ({
      po_number: r.po_number || "",
      vendor: r.vendor || "",
      item_name: Array.isArray(r.item)
        ? r.item[0]?.product_name || "-"
        : r.item || "-",
      po_value: inr(r.po_value),
      Advance_paid: inr(r.advance_paid),
      remain_amount: inr(r.remaining_amount),
      po_remaining_amount: inr(r.po_remaining_amount),
      total_billed_value: inr(r.total_billed_value),
    }));

    const saleHistorys = salesHistoryResult.map((r) => ({
      po_number: r.po_number || "",
      converted_at: fmtDate(r.converted_at),
      vendor: r.vendor || "",
      item: Array.isArray(r.item)
        ? r.item
            .map((i) => i.product_name)
            .filter(Boolean)
            .join(", ") || "-"
        : typeof r.item === "string"
          ? r.item
          : r.item_name || "-",
      sale_value: inr(r.po_value),
    }));

    const AdjustmentHistorys = adjustmentHistory.map((r) => ({
      date: fmtDate(r.adj_date || r.createdAt),
      reason: r.pay_type || r.adj_type || "",
      po_number: r.po_number || "",
      paid_for: r.paid_for || "",
      description: r.description || r.comment || "",
      credit_adjust: r.adj_type === "Add" ? inr(r.adj_amount) : 0,
      debit_adjust: r.adj_type === "Subtract" ? inr(r.adj_amount) : 0,
    }));

    const balanceSummary = Object.entries(balance || {})
      .filter(([k]) => k !== "gst_difference")
      .reduce((acc, [k, v]) => {
        acc[k] = typeof v === "number" ? roundMoney(v, digitsByKey[k] ?? 0) : v;
        return acc;
      }, {});

    const apiUrl = `${process.env.PDF_PORT}/customer-summary/cu-summary`;

    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: {
        projectDetails,
        creditHistorys,
        DebitHistorys,
        purchaseHistorys,
        saleHistorys,
        AdjustmentHistorys,
        balanceSummary,
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type":
        axiosResponse.headers["content-type"] || "application/pdf",
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Payment_History.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (err) {
    console.error("Error generating Customer Payment PDF:", err);
    res
      .status(500)
      .json({ message: "Error Generating PDF", error: err.message });
  }
};

module.exports = {
  getCustomerPaymentSummary,
  postCustomerPaymentSummaryPdf,
};
