const CreditModel = require("../../models/addMoneyModells");
const DebitModel = require("../../models/debitMoneyModells");
const AdjustmentModel = require("../../models/adjustmentRequestModells");
const ClientModel = require("../../models/purchaseorder.model");
const ProjectModel = require("../../models/project.model");
const { Parser } = require("json2csv");
const { default: axios } = require("axios");

// ---- Helpers ----
const asDouble = (expr) => ({
  $convert: {
    input: {
      $let: {
        vars: {
          s: {
            $cond: [
              { $eq: [{ $type: expr }, "string"] },
              { $trim: { input: expr } },
              expr,
            ],
          },
        },
        in: {
          $cond: [
            {
              $and: [
                { $eq: [{ $type: "$$s" }, "string"] },
                {
                  $in: [
                    { $toLower: "$$s" },
                    ["", "na", "-", "n/a", "null", "undefined"],
                  ],
                },
              ],
            },
            0,
            {
              $cond: [
                { $eq: [{ $type: "$$s" }, "string"] },
                { $replaceAll: { input: "$$s", find: ",", replacement: "" } },
                "$$s",
              ],
            },
          ],
        },
      },
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

// ---- Controller ----
const getCustomerPaymentSummary = async (req, res) => {
  try {
    const {
      p_id,
      _id,
      export: exportToCSV,
      start,
      end,
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
    const projectOid = projectDoc._id;

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
      billing_address_formatted: formatAddress(projectDoc.billing_address),
      site_address_formatted: formatAddress(projectDoc.site_address),
    };

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
      if (startDate) debitMatch.dbt_date.$gte = startDate;
      if (endDate) debitMatch.dbt_date.$lte = endDate;
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
        { $addFields: { po_numberStr: { $toString: "$po_number" } } },
        {
  $addFields: {
    last_sales_detail: {
      $let: {
        vars: { tail: { $slice: [{ $ifNull: ["$sales_Details", []] }, -1] } },
        in: {
          $cond: [
            { $gt: [{ $size: "$$tail" }, 0] },
            {
              basic_sales: { $toDouble: { $ifNull: [{ $arrayElemAt: ["$$tail.basic_sales", 0] }, 0] } },
              gst_on_sales: { $toDouble: { $ifNull: [{ $arrayElemAt: ["$$tail.gst_on_sales", 0] }, 0] } },
              total_sales_value: {
                $add: [
                  { $toDouble: { $ifNull: [{ $arrayElemAt: ["$$tail.basic_sales", 0] }, 0] } },
                { $toDouble: { $ifNull: [{ $arrayElemAt: ["$$tail.gst_on_sales", 0] }, 0] } },
                ],
              },
            },
            { basic_sales: 0, gst_on_sales: 0, total_sales_value: 0 },
          ],
        },
      },
    },
  },
},

         // --- Approved payments (advance) ---
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

        // --- Lookup biildetails for PO ---
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
              { $project: { item: 1 } },
              { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },
              {
                $addFields: {
                  bill_value_num: {
                    $toDouble: {
                      $replaceAll: {
                        input: { $toString: { $ifNull: ["$item.bill_value", 0] } },
                        find: ",",
                        replacement: "",
                      },
                    },
                  },
                  gst_num: {
                    $toDouble: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: { $toString: { $ifNull: ["$item.gst_percent", 0] } },
                            find: "%",
                            replacement: "",
                          },
                        },
                        find: ",",
                        replacement: "",
                      },
                    },
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  bill_basic_sum: { $sum: "$bill_value_num" },
                  bill_gst_sum: {
                    $sum: {
                      $multiply: [
                        "$bill_value_num",
                        { $divide: ["$gst_num", 100] },
                      ],
                    },
                  },
                },
              },
              { $project: { _id: 0, bill_basic_sum: 1, bill_gst_sum: 1 } },
            ],
            as: "bill_agg",
          },
        },

        // If no matching biildetails found, set bill_basic and bill_gst to 0
        {
          $addFields: {
            bill_basic: {
              $cond: [
                { $gt: [{ $size: "$bill_agg" }, 0] },
                { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
                0, // Default to 0 if no matching po_number
              ],
            },
            bill_gst: {
              $cond: [
                { $gt: [{ $size: "$bill_agg" }, 0] },
                { $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] },
                0, // Default to 0 if no matching po_number
              ],
            },
          },
        },

        // Calculate total_billed_value
        {
          $addFields: {
            total_billed_value: {
              $add: ["$bill_basic", "$bill_gst"],
            },
          },
        },
        

        { $project: { bill_agg: 0 } },
  {
  $addFields: {
    total_sales_value: {
      $toDouble: { $ifNull: ["$last_sales_detail.total_sales_value", 0] },
    },
    total_unbilled_sales: {
      $round: [
        {
          $subtract: [
            { $add: [ asDouble("$bill_basic"), asDouble("$bill_gst") ] },
            { $toDouble: { $ifNull: ["$last_sales_detail.total_sales_value", 0] } },
          ],
        },
        2,
      ],
    },

    // ✅ simple: bill_basic - basic_sales
    remaining_sales_closure: {
      $round: [
        {
          $subtract: [
            { $toDouble: { $ifNull: ["$bill_basic", 0] } },
            { $toDouble: { $ifNull: ["$last_sales_detail.basic_sales", 0] } },
          ],
        },
        2,
      ],
    },
  },
},


      ],
      
      as: "purchase_orders",
    },
  },

  // --- Unwind purchase_orders ---
  { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: false } },
  { $match: { "purchase_orders._id": { $exists: true } } },
  { $sort: { "purchase_orders.createdAt": -1 } },
  // { $match: { "purchase_orders.remaining_sales_closure": { $gt: 0 } } },



  // --- Vendor lookup ---
  {
  $lookup: {
    from: "vendors",
    localField: "purchase_orders.vendor",
    foreignField: "_id",
    as: "_vendor",
  },
},
{
  $addFields: {
    vendor: {
      $ifNull: [{ $arrayElemAt: ["$_vendor.name", 0] }, null],
    },
  },
},


{ $project: { _vendor: 0 } },

        ...(searchRegex
        ? [
            {
              $match: {
                $or: [
                  { "purchase_orders.vendor": searchRegex },
                  { "purchase_orders.po_number": searchRegex },
                  { code: searchRegex },
                ],
              },
            },
          ]
        : []),


  // --- Final projection ---
  {
    $project: {
      _id: "$purchase_orders._id",
      project_code: "$code",
      po_number: "$purchase_orders.po_number",
      vendor: "$vendor",
      po_value: "$purchase_orders.po_value",
      item_name: "$purchase_orders.item_name",
      total_unbilled_sales: "$purchase_orders.total_unbilled_sales",
    total_sales_value: asDouble("$purchase_orders.last_sales_detail.total_sales_value"),

      po_basic: "$purchase_orders.po_basic",
      gst: "$purchase_orders.gst",
      bill_basic: "$purchase_orders.bill_basic", // Bill values calculated
      bill_gst: "$purchase_orders.bill_gst",     // Bill values calculated
      total_billed_value: "$purchase_orders.total_billed_value", // Calculated total_billed_value
      remaining_sales_closure: "$purchase_orders.remaining_sales_closure",


      // Correct handling of advance_paid with missing values
      advance_paid: {
        $cond: [
          {
            $gt: [
              { $size: { $ifNull: ["$purchase_orders.approved_payment", []] } },
              0,
            ],
          },
          {
            $arrayElemAt: [
              { $ifNull: ["$purchase_orders.approved_payment.totalPaid", [0]] },
              0,
            ],
          },
          0, // Default to 0 if no approved payments
        ],
      },

      // Remaining amount calculation
      remaining_amount: {
        $subtract: [
          { $toDouble: { $ifNull: ["$purchase_orders.po_value", 0] } },
          {
            $toDouble: {
              $ifNull: [
                {
                  $arrayElemAt: [
                    { $ifNull: ["$purchase_orders.approved_payment.totalPaid", [0]] },
                    0,
                  ],
                },
                0,
              ],
            },
          },
        ],
      },
    },
  },
]);




    const clientMeta = (clientHistoryResult || [])
      .filter((r) => r && r._id)
      .reduce(
        (acc, curr) => {
          acc.total_advance_paid += Number(curr.advance_paid || 0);

          acc.total_billed_value += Number(curr.total_billed_value || 0);
          acc.total_po_value += Number(curr.po_value || 0);
          acc.total_po_basic += Number(curr.po_basic || 0);
          acc.total_bill_basic += Number(curr.bill_basic || 0);
          acc.total_bill_gst += Number(curr.bill_gst || 0);
          acc.total_unbilled_sales += Number(curr.total_unbilled_sales || 0);
          acc.total_remaining_amount += Number(curr.remaining_amount || 0);
           acc.total_sales_value += Number(curr.total_sales_value || 0);
           acc.total_gst += Number (curr.gst || 0);
           acc.total_remaining_sales_closure += Number (curr.remaining_sales_closure || 0);
        

          return acc;
        },
        {
          total_advance_paid: 0,

          total_billed_value: 0,
          total_po_value: 0,
          total_po_basic: 0,
          total_bill_basic: 0,
          total_bill_gst: 0,
          total_gst:0,
          total_unbilled_sales: 0,
          total_remaining_amount: 0,
          total_sales_value: 0,
          total_remaining_sales_closure :0
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

            // Sales meta
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

            // BillDetails lookup
            // --- BillDetails lookup (sum across all docs & items) ---
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

      // keep only `item` array (some documents might store as `item`)
      { $project: { item: 1 } },

      // unwind all items from the array
      {
        $unwind: {
          path: "$item",
          preserveNullAndEmptyArrays: true,
        },
      },

      // clean and normalize numeric values
      {
        $addFields: {
          bill_value_num: {
            $toDouble: {
              $replaceAll: {
                input: { $toString: { $ifNull: ["$item.bill_value", 0] } },
                find: ",",
                replacement: "",
              },
            },
          },
          gst_num: {
            $toDouble: {
              $replaceAll: {
                input: {
                  $replaceAll: {
                    input: { $toString: { $ifNull: ["$item.gst_percent", 0] } },
                    find: "%",
                    replacement: "",
                  },
                },
                find: ",",
                replacement: "",
              },
            },
          },
        },
      },

      // sum totals per PO
      {
        $group: {
          _id: null,
          bill_basic_sum: { $sum: "$bill_value_num" },
          bill_gst_sum: {
            $sum: {
              $multiply: [
                "$bill_value_num",
                { $divide: ["$gst_num", 100] },
              ],
            },
          },
        },
      },
      { $project: { _id: 0, bill_basic_sum: 1, bill_gst_sum: 1 } },
    ],
    as: "bill_agg",
  },
},

{
  $addFields: {
    bill_basic: {
      $cond: [
        { $gt: [{ $size: "$bill_agg" }, 0] },
        { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
        asDouble("$po_basic"),
      ],
    },
    bill_gst: {
      $cond: [
        { $gt: [{ $size: "$bill_agg" }, 0] },
        { $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] },
        asDouble("$gst"),
      ],
    },
  },
},


            // Approved payments for advance
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

            {
              $project: {
                _id: 1,
                po_number: 1,
                vendor: 1,
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
                total_billed_value: asDouble("$total_billed"),
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
                total_sales_value: asDouble("$total_sales_value"),
                basic_sales: asDouble("$last_sales_detail.basic_sales"),
                gst_on_sales: asDouble("$last_sales_detail.gst_on_sales"),

                remarks: "$last_sales_detail.remarks",
                converted_at: "$last_sales_detail.converted_at",
                user_id: "$last_sales_detail.user_id",
                sales_invoice: "$last_sales_detail.sales_invoice",
                bill_basic: 1,
                bill_gst: 1,
              },
            },
          ],
          as: "sales_orders",
        },
      },
      { $unwind: { path: "$sales_orders", preserveNullAndEmptyArrays: false } },
      { $replaceRoot: { newRoot: "$sales_orders" } },
    ]);

    const salesMeta = salesHistoryResult.reduce(
      (acc, row) => {
        acc.total_advance_paid += Number(row.advance_paid || 0);
        acc.total_sales_value += Number(row.total_sales_value || 0);
        acc.total_basic_sales += Number(row.basic_sales || 0);
        acc.total_gst_on_sales += Number(row.gst_on_sales || 0);

        acc.total_billed_value += Number(row.total_billed_value || 0);
        acc.total_po_basic += Number(row.po_basic || 0);
        acc.total_gst += Number(row.gst || 0);
        acc.total_bill_basic += Number(row.bill_basic || 0);
        acc.total_bill_gst += Number(row.bill_gst || 0);
        acc.count += 1;
        return acc;
      },
      {
        total_sales_value: 0,
        total_basic_sales: 0,
        total_gst_on_sales: 0,
        total_advance_paid: 0,

        total_billed_value: 0,
        total_po_basic: 0,
        total_gst: 0,
        total_bill_basic: 0,
        total_bill_gst: 0,
        
      }
    );

    // ---------- Balance Summary ----------
    const [balanceSummary = {}] = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },

      // CREDIT
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

      // RETURN (Customer Adjustment)
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

      // ALL POs + BillDetails + Approved advances
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } },
            {
              $addFields: {
                po_numberStr: { $toString: "$po_number" },
                lastSales: {
                  $arrayElemAt: [{ $ifNull: ["$sales_Details", []] }, -1],
                },
              },
            },

            // --- Approved advances ---
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
{
  $lookup: {
    from: "biildetails",  // Correct collection name (biildetails)
    let: { poNum: "$po_numberStr" },
    pipeline: [
      {
        $match: {
          $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
        },
      },
      { 
        $unwind: { 
          path: "$item", 
          preserveNullAndEmptyArrays: true 
        } 
      },

      // Ensure item is treated as an array
      {
        $addFields: {
          itemArray: { 
            $cond: [
              { $isArray: "$item" }, // Check if item is an array
              "$item",  // If yes, keep it as is
              []        // If no, make it an empty array
            ]
          }
        }
      },

      // Normalize bill_value and gst_percent
      {
        $addFields: {
          bill_basic: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
              { $toDouble: { $ifNull: ["$item.bill_value", 0] } },  // Ensure bill_value is numeric
              0
            ]
          },
          bill_gst: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
              { 
                $multiply: [
                  { $toDouble: { $ifNull: ["$item.bill_value", 0] } },  // Ensure bill_value is numeric
                  { $divide: [{ $toDouble: { $ifNull: ["$item.gst_percent", 0] } }, 100] } // Convert gst_percent to numeric
                ]
              },
              0
            ]
          }
        }
      },

      // If item array is empty, use direct bill_value
      {
        $addFields: {
          bill_basic: {
            $cond: [
              { $eq: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
              { $toDouble: "$bill_value" },
              "$bill_basic"
            ]
          },
          bill_gst: {
            $cond: [
              { $eq: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
              { 
                $multiply: [
                  { $toDouble: "$bill_value" },  // Ensure bill_value is numeric
                  { $divide: [{ $toDouble: "$gst_percent" }, 100] } // Convert gst_percent to numeric
                ]
              },
              "$bill_gst"
            ]
          }
        }
      },

      // Group by PO number and sum bill_basic + bill_gst
      {
        $group: {
          _id: "$po_number",
          total_billed_value: {
            $sum: { $add: ["$bill_basic", "$bill_gst"] }
          }
        }
      }
    ],
    as: "billAgg",
  }
},

{
  $addFields: {
    total_billed_value: {
      $cond: [
        { $gt: [{ $size: "$billAgg" }, 0] },
        { 
          $toDouble: { 
            $ifNull: [{ $arrayElemAt: ["$billAgg.total_billed_value", 0] }, 0] 
          }
        },
        0
      ]
    }
  }
},




            // --- Per-PO numbers with safe fallbacks ---
           {
  $project: {
    _id: 1,
    isSales: 1,
    po_value: asDouble("$po_value"),
    po_basic: asDouble("$po_basic"),
    gst: asDouble("$gst"),
    total_billed_value:1,

    bill_basic: {
      $cond: [
        { $gt: [{ $size: "$billAgg" }, 0] },
        { $toDouble: { $ifNull: [{ $arrayElemAt: ["$billAgg.bill_basic_sum", 0] }, 0] } },
        asDouble("$po_basic"),
      ],
    },
    bill_gst: {
      $cond: [
        { $gt: [{ $size: "$billAgg" }, 0] },
        { $toDouble: { $ifNull: [{ $arrayElemAt: ["$billAgg.bill_gst_sum", 0] }, 0] } },
        asDouble("$gst"),
      ],
    },

    basic_sales: asDouble("$lastSales.basic_sales"),

  
   total_sales_value: {
  $cond: [
    { $in: ["$isSales", [true, "true", 1, "1"]] },
    {
      $toDouble: {
        $ifNull: [
          "$total_sales_value",                 // <-- primary (root field updated by updateSalesPO)
          { $ifNull: [ { $toDouble: "$lastSales.total_sales_value" }, 0 ] } // fallback
        ]
      }
    },
    0
  ]
},


    advance_paid: {
      $cond: [
        { $gt: [{ $size: { $ifNull: ["$approved_payment", []] } }, 0] },
        { $toDouble: { $ifNull: [{ $arrayElemAt: ["$approved_payment.totalPaid", 0] }, 0] } },
        0,
      ],
    },
  },
}

          ],
          as: "purchase_orders",
        },
      },

      {
        $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
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



      

      // GROUP project-wise
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

          

          // Vendor-side totals
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
          total_po_basic: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
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
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
                  ],
                },
                asDouble("$purchase_orders.gst"),
                0,
              ],
            },
          },

          // Sales-side totals (we keep po_value as “sales value” bucket)
         total_sales_value: {
  $sum: {
    $cond: [
      { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
      { $toDouble: { $ifNull: ["$purchase_orders.total_sales_value", 0] } }, // <-- use per-PO computed field
      0
    ]
  }
},


          // Bill totals
          total_bill_basic_vendor: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
                  ],
                },
                asDouble("$purchase_orders.bill_basic"),
                0,
              ],
            },
          },
          total_bill_gst_vendor: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$purchase_orders.isSales",
                    [false, "false", 0, "0", null],
                  ],
                },
                asDouble("$purchase_orders.bill_gst"),
                0,
              ],
            },
          },
          total_bill_basic_sales: {
            $sum: {
              $cond: [
                { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
                asDouble("$purchase_orders.bill_basic"),
                0,
              ],
            },
          },
          total_bill_gst_sales: {
            $sum: {
              $cond: [
                { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
                asDouble("$purchase_orders.bill_gst"),
                0,
              ],
            },
          },

          // vendor advances
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

          // vendor billed value (if still needed)
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

          // Σ over SALES POs: (po_value - basic_sales)
          total_unbilled_sales: {
            $sum: {
              $cond: [
                { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
                {
                  $subtract: [
                    asDouble("$purchase_orders.po_value"),
                    asDouble("$purchase_orders.total_sales_value"),
                  ],
                },
                0,
              ],
            },
          },
        },
      },

      // Derived
      {
        $addFields: {
          total_bill_basic: {
            $add: ["$total_bill_basic_vendor", "$total_bill_basic_sales"],
          },
          total_bill_gst: {
            $add: ["$total_bill_gst_vendor", "$total_bill_gst_sales"],
          },

          netBalance: { $subtract: ["$totalCredit", "$total_return"] },
               balance_with_slnko: {
      $round: [
        {
          $subtract: [
            {
              $subtract: [
                {
                  $subtract: [
                    {
                      $subtract: [
                        { $ifNull: ["$netBalance", 0] },
                        { $ifNull: ["$total_sales_value", 0] },
                      ],
                    },
                    { $ifNull: ["$total_unbilled_sales", 0] },
                  ],
                },
                { $ifNull: ["$advance_left_after_billed", 0] },
              ],
            },
            { $ifNull: ["$total_adjustment", 0] },
          ],
        },
        2,
      ],
    },

          total_unbilled_sales: {
      $subtract: ["$total_po_with_gst", "$total_sales_value"],
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
          total_adjustment: {
            $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"],
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
      // Final projection
      {
        $project: {
          _id: 0,
          billing_type: 1,
          total_received: "$totalCredit",
          total_return: 1,
          netBalance: 1,

          total_po_basic: 1,
          gst_as_po_basic: 1,
          total_po_with_gst: 1,
gst_as_po_basic: 1,
          total_po_with_gst: 1,
          gst_with_type_percentage: 1,
          gst_difference: 1,
          total_bill_basic_sales: 1,
          total_bill_gst_sales: 1,
          total_bill_basic: 1,
          total_bill_gst: 1,
              extraGST: 1,

total_adjustment:1,
          total_advance_paid: 1,
          total_billed_value: 1,
          total_sales_value: 1,

          total_unbilled_sales: 1,
//           balance_with_slnko: {
//   $round: [
//     {
//       $subtract: [
//         {
//           $subtract: [
//             {
//               $subtract: [
//                 { $ifNull: ["$netBalance", 0] },
//                 { $ifNull: ["$total_sales_value", 0] }
//               ]
//             },
//             { $ifNull: ["$total_unbilled_sales", 0] }
//           ]
//         },
//         {
//           $add: [
//             { $ifNull: ["$advance_left_after_billed", 0] },
//             { $ifNull: ["$total_adjustment", 0] }
//           ]
//         }
//       ],
//     },
//     2
//   ]
// }

          //       advance_left_after_billed: {
          //   $round: [
          //     {
          //       $subtract: [
          //         { $ifNull: ["$total_advance_paid", 0] },
          //         {
          //           $add: [
          //             { $ifNull: ["$total_sales_value", 0] },
          //             { $ifNull: ["$total_unbilled_sales", 0] },
          //           ],
          //         },
          //       ],
          //     },
          //     2,
          //   ],
          // }, 
        },
      },
    ]);

    const remaining_advance_left_after_billed =
  balanceSummary?.total_advance_paid > clientMeta?.total_billed_value
    ? (balanceSummary?.total_advance_paid || 0) -
      (balanceSummary?.total_sales_value || 0) -
      (clientMeta?.total_billed_value || 0)
    : 0;

const exact_remaining_pay_to_vendor =
  clientMeta?.total_billed_value > balanceSummary?.total_advance_paid
    ? (clientMeta?.total_po_with_gst || 0) - (clientMeta?.total_billed_value || 0)
    : (balanceSummary?.total_advance_paid || 0);

    const balance_with_slnko =
  (balanceSummary?.netBalance || 0) -
  (balanceSummary?.total_sales_value || 0) -
  (clientMeta?.total_billed_value || 0) -
  (remaining_advance_left_after_billed || 0) -
  (balanceSummary?.total_adjustment || 0);


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
      ...balanceSummary,
      aggregate_billed_value: clientMeta.total_billed_value || 0,
      remaining_advance_left_after_billed,
  exact_remaining_pay_to_vendor,
  balance_with_slnko

    };

    // CSV export (unchanged except conversions already handled earlier)
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
            "Advance Remaining", 
            "Remaining Amount",
            "Total Billed Value",
          ],
          clientRows.map((row, i) => [
            i + 1,
            row.po_number || "-",
            row.vendor || "-",
            row.item_name || "-",
            Math.round(row.po_value ?? 0),
            Math.round(row.advance_paid ?? 0),
            Math.round(row.advance_remaining ?? 0),
            Math.round(row.remaining_amount ?? 0),
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
              Math.round(row.total_sales_value ?? 0),
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
      const bsRows = [
        ["1", "Total Received", INR(bs.total_received)],
        ["2", "Total Return", INR(bs.total_return)],
        ["3", "Net Balance [(1)-(2)]", INR(bs.netBalance)],
        ["4", "Total Advances Paid to Vendors", INR(bs.total_advance_paid)],
        [
          "4A",
          "Advances left after bills received",
          INR(bs.advance_left_after_billed),
        ],
        ["5", "Adjustment (Debit-Credit)", INR(bs.total_adjustment)],
        ["6", "Balance With Slnko [(3)-(4)-(5)]", INR(bs.balance_with_slnko)],
        ["", "Billing Details", ""],
        ["7", "Invoice issued to customer", INR(bs.total_sales_value)],
        [
          "8",
          "Bills received, yet to be invoiced to customer",
          INR(bs.total_unbilled_sales),
        ],
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
                  then: { $round: [{ $multiply: ["$total_po_basic", 0.89] }] },
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