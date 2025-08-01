const CreditModel = require("../../Modells/addMoneyModells");
const DebitModel = require("../../Modells/debitMoneyModells");
const AdjustmentModel = require("../../Modells/adjustmentRequestModells");
const ClientModel = require("../../Modells/purchaseOrderModells");
const ProjectModel = require("../../Modells/projectModells");
const { Parser } = require("json2csv");
const readCSV = require("../../helpers/readCSV");

const getCustomerPaymentSummary = async (req, res) => {
  try {
    const {
      p_id,
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

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const projectId = isNaN(p_id) ? p_id : Number(p_id);

    const buildDateFilter = (field) => {
      if (!start && !end) return {};
      const dateRange = {};
      if (start) dateRange.$gte = new Date(start);
      if (end) dateRange.$lte = new Date(end);
      return { [field]: dateRange };
    };

    // 1️⃣ Project Details
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
    if (project) {
      project.billing_address_formatted = formatAddress(
        project.billing_address
      );
      project.site_address_formatted = formatAddress(project.site_address);
    }

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    const creditMatch = {
      p_id: projectId,
      ...buildDateFilter("cr_date"),
    };

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
                totalCredited: { $sum: "$cr_amount" },
              },
            },
          ],
        },
      },
    ]);

    const creditHistory = creditData?.history || [];
    const totalCredited = creditData?.summary[0]?.totalCredited || 0;

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
                totalDebited: { $sum: "$amount_paid" },
              },
            },
          ],
        },
      },
    ]);

    const debitHistory = debitData?.history || [];
    const totalDebited = debitData?.summary?.[0]?.totalDebited || 0;

    // 4️⃣ Adjustment Aggregation
    const adjustmentMatch = { p_id: projectId };
    if (searchAdjustment) {
      const regex = new RegExp(searchAdjustment, "i");
      adjustmentMatch.remark = regex;
    }
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
                adj_amount_numeric: {
                  $cond: [
                    { $eq: [{ $type: "$adj_amount" }, "string"] },
                    { $abs: { $toDouble: "$adj_amount" } },
                    { $abs: "$adj_amount" },
                  ],
                },
                debit_adjustment: {
                  $cond: [
                    { $eq: ["$adj_type", "Subtract"] },
                    {
                      $cond: [
                        { $eq: [{ $type: "$adj_amount" }, "string"] },
                        { $abs: { $toDouble: "$adj_amount" } },
                        { $abs: "$adj_amount" },
                      ],
                    },
                    0,
                  ],
                },
                credit_adjustment: {
                  $cond: [
                    { $eq: ["$adj_type", "Add"] },
                    {
                      $cond: [
                        { $eq: [{ $type: "$adj_amount" }, "string"] },
                        { $abs: { $toDouble: "$adj_amount" } },
                        { $abs: "$adj_amount" },
                      ],
                    },
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
                adj_amount_numeric: {
                  $cond: [
                    { $eq: [{ $type: "$adj_amount" }, "string"] },
                    { $abs: { $toDouble: "$adj_amount" } },
                    { $abs: "$adj_amount" },
                  ],
                },
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

    /******Client History Section**********/

    const searchRegex = searchClient ? new RegExp(searchClient, "i") : null;

    const clientHistoryResult = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      { $project: { code: 1, _id: 0 } },

      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "purchase_orders",
        },
      },
      {
        $unwind: {
          path: "$purchase_orders",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          "purchase_orders.createdAt": -1,
        },
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
                totalPaid: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "approved_payment",
        },
      },
      {
        $addFields: {
          advance_paid: {
            $cond: {
              if: { $gt: [{ $size: "$approved_payment" }, 0] },
              then: { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
              else: 0,
            },
          },
        },
      },
      {
        $lookup: {
          from: "biildetails",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$po_number" }, "$$po_numberStr"],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalBilled: { $sum: { $toDouble: "$bill_value" } },
              },
            },
          ],
          as: "billed_summary",
        },
      },
      {
        $addFields: {
          total_billed_value: {
            $cond: {
              if: { $gt: [{ $size: "$billed_summary" }, 0] },
              then: { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
              else: 0,
            },
          },
        },
      },
      {
        $addFields: {
          remaining_amount: {
            $subtract: [
              { $toDouble: "$purchase_orders.po_value" },
              { $toDouble: "$advance_paid" },
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
                  { "purchase_orders.item": searchRegex },
                  { "purchase_orders.po_number": searchRegex },
                  { code: searchRegex },
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
          item_name: "$purchase_orders.item",
          po_value: "$purchase_orders.po_value",
          advance_paid: 1,
          remaining_amount: 1,
          total_billed_value: 1,
          po_basic: "$purchase_orders.po_basic",
          gst: "$purchase_orders.gst",
        },
      },
    ]);

    const fallbackCache = {};

    for (const item of clientHistoryResult) {
      const poNumber = item.po_number?.toString()?.trim().toUpperCase();
      if (!poNumber) continue;

      const missingPOBasic = !item.po_basic || isNaN(item.po_basic);
      const missingGST = !item.gst || isNaN(item.gst);
      const missingPOValue = !item.po_value || isNaN(item.po_value);

      if (missingPOBasic || missingGST || missingPOValue) {
        if (!fallbackCache[poNumber]) {
          fallbackCache[poNumber] = await readCSV(poNumber);
        }

        const fallback = fallbackCache[poNumber];

        if (fallback) {
          if (missingPOBasic) item.po_basic = fallback.po_basic || 0;
          if (missingGST) item.gst = fallback.gst || 0;
          if (missingPOValue) item.po_value = fallback.po_value || 0;
        } else {
          if (missingPOBasic) item.po_basic = 0;
          if (missingGST) item.gst = 0;
          if (missingPOValue) item.po_value = 0;
        }
      }
    }

    const clientMeta = clientHistoryResult.reduce(
      (acc, curr) => {
        acc.total_advance_paid += Number(curr.advance_paid || 0);
        acc.total_remaining_amount += Number(curr.remaining_amount || 0);
        acc.total_billed_value += Number(curr.total_billed_value || 0);
        acc.total_po_value += Number(curr.po_value || 0);
        acc.total_po_basic += Number(curr.po_basic || 0);
        return acc;
      },
      {
        total_advance_paid: 0,
        total_remaining_amount: 0,
        total_billed_value: 0,
        total_po_value: 0,
        total_po_basic: 0,
      }
    );
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
                totalCredit: { $sum: { $toDouble: "$cr_amount" } },
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
                total_return: { $sum: { $toDouble: "$amount_paid" } },
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
                totalAdvancePaidToVendors: {
                  $sum: { $toDouble: "$amount_paid" },
                },
              },
            },
          ],
          as: "advancePaymentData",
        },
      },

      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
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
                totalPaid: { $sum: { $toDouble: "$amount_paid" } },
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
                totalBilled: { $sum: { $toDouble: "$bill_value" } },
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
            {
              $match: {
                $expr: { $eq: ["$p_id", "$$projectId"] },
              },
            },
            {
              $project: {
                adj_amount: 1,
                adj_type: 1,
                credit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Add"] },
                    { $toDouble: "$adj_amount" },
                    0,
                  ],
                },
                debit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Subtract"] },
                    { $toDouble: "$adj_amount" },
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
          total_po_value: { $sum: { $toDouble: "$purchase_orders.po_value" } },
          total_advance_paid: { $sum: "$purchase_orders.advance_paid" },
          total_billed_value: { $sum: "$purchase_orders.total_billed_value" },
          total_po_basic: {
            $sum: {
              $cond: [
                { $ifNull: ["$purchase_orders.po_basic", false] },
                {
                  $convert: {
                    input: { $trim: { input: "$purchase_orders.po_basic" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
          },
          gst_as_po_basic: {
            $sum: {
              $cond: [
                { $ifNull: ["$purchase_orders.gst", false] },
                {
                  $convert: {
                    input: { $trim: { input: "$purchase_orders.gst" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
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
          total_po_with_gst: {
            $add: ["$total_po_basic", "$gst_as_po_basic"],
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
            $cond: {
              if: {
                $gt: [
                  { $subtract: ["$totalCredit", "$total_return"] },
                  5000000,
                ],
              },
              then: {
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
              else: 0,
            },
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
                  then: {
                    $round: [
                      {
                        $multiply: ["$total_po_basic", 0.138],
                      },
                    ],
                  },
                },
                {
                  case: { $eq: ["$billing_type", "Individual"] },
                  then: {
                    $round: [
                      {
                        $multiply: ["$total_po_basic", 0.18],
                      },
                    ],
                  },
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
            $cond: {
              if: { $gt: ["$gst_with_type_percentage", "$gst_as_po_basic"] },
              then: {
                $subtract: ["$gst_with_type_percentage", "$gst_as_po_basic"],
              },
              else: 0,
            },
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
              2, // number of decimal places
            ],
          },
        },
      },

      //client histrory
      // 6️⃣ Client History Aggregation (No filters) -- moved outside the aggregation pipeline

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
          net_advanced_paid: {
            $subtract: ["$total_advance_paid", "$total_billed_value"],
          },
          gst_as_po_basic: 1,
          total_po_with_gst: 1,
          gst_with_type_percentage: 1,
          gst_difference: 1,
          balance_required: 1,
          purchase_orders: 1,
        },
      },
    ]);

    const csvCache = {};
    let correctedTotalPoBasic = 0;
    let correctedGstAsPoBasic = 0;

    if (
      balanceSummary.purchase_orders &&
      Array.isArray(balanceSummary.purchase_orders)
    ) {
      for (const po of balanceSummary.purchase_orders) {
        const poNumber = po.po_number?.toString()?.trim();
        let poBasic = parseFloat(po.po_basic) || 0;
        let gst = parseFloat(po.gst) || 0;

        const missingPOBasic = isNaN(poBasic) || poBasic === 0;
        const missingGST = isNaN(gst) || gst === 0;

        if ((missingPOBasic || missingGST) && poNumber) {
          if (!csvCache[poNumber]) {
            csvCache[poNumber] = await readCSV(poNumber);
          }
          const fallback = csvCache[poNumber];
          if (fallback) {
            if (missingPOBasic) poBasic = fallback.po_basic || 0;
            if (missingGST) gst = fallback.gst || 0;
          }
        }

        correctedTotalPoBasic += poBasic;
        correctedGstAsPoBasic += gst;
      }

      if (correctedTotalPoBasic > balanceSummary.total_po_basic) {
        balanceSummary.total_po_basic = correctedTotalPoBasic;
      }
      if (correctedGstAsPoBasic > balanceSummary.gst_as_po_basic) {
        balanceSummary.gst_as_po_basic = correctedGstAsPoBasic;
      }

      balanceSummary.total_po_with_gst =
        balanceSummary.total_po_basic + balanceSummary.gst_as_po_basic;
    }

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
      credit: {
        history: creditHistory,
        total: totalCredited,
      },
      debit: {
        history: debitHistory,
        total: totalDebited,
      },
      clientHistory: {
        data: clientHistoryResult,
        meta: clientMeta,
      },
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

    // If export=csv, create custom CSV
    if (exportToCSV === "csv") {
      let csvContent = "";

      // ➤ 1. Project Details Section
      csvContent += "Project Details\n";
      Object.entries(responseData.projectDetails).forEach(([key, value]) => {
        csvContent += `${key},${value}\n`;
      });
      csvContent += "\n";

      // ➤ 2. Credit History Section
      if (creditHistory.length) {
        csvContent += "Credit History\n";
        csvContent += Object.keys(creditHistory[0]).join(",") + "\n";
        creditHistory.forEach((item) => {
          csvContent += Object.values(item).join(",") + "\n";
        });
        csvContent += "\n";
      }

      // ➤ 3. Debit History Section
      if (debitHistory.length) {
        csvContent += "Debit History\n";
        csvContent += Object.keys(debitHistory[0]).join(",") + "\n";
        debitHistory.forEach((item) => {
          csvContent += Object.values(item).join(",") + "\n";
        });
        csvContent += "\n";
      }

      // ➤ 4. Adjustment History Section
      if (adjustmentHistory.length) {
        csvContent += "Adjustment History\n";
        csvContent += Object.keys(adjustmentHistory[0]).join(",") + "\n";
        adjustmentHistory.forEach((item) => {
          csvContent += Object.values(item).join(",") + "\n";
        });
        csvContent += "\n";
      }

      // ➤ 5. Client History Section
      if (clientHistoryResult.length) {
        csvContent += "Client History\n";
        csvContent += Object.keys(clientHistoryResult[0]).join(",") + "\n";
        clientHistoryResult.forEach((item) => {
          csvContent += Object.values(item).join(",") + "\n";
        });
        csvContent += "\n";
      }

      // ➤ 6. Balance Summary
      csvContent += "Balance Summary\n";
      Object.entries(balanceSummary).forEach(([key, value]) => {
        csvContent += `${key},${value}\n`;
      });

      // Set headers and send
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="payment_summary_${project.code || projectId}.csv"`
      );
      return res.send(csvContent);
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Client History
const clientHistory = async (req, res) => {
  try {
    const { p_id, vendor } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const cleanPId = isNaN(p_id) ? p_id : Number(p_id);

    const result = await ProjectModel.aggregate([
      { $match: { p_id: cleanPId } },
      { $project: { code: 1, _id: 0 } },

      // Lookup Purchase Orders using code
      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "purchase_orders",
        },
      },
      {
        $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
      },
      // 🔍 Apply vendor filter if vendor is provided
      ...(vendor
        ? [
            {
              $match: {
                "purchase_orders.vendor": {
                  $regex: vendor,
                  $options: "i", // case-insensitive
                },
              },
            },
          ]
        : []),

      // Lookup Approved and Matched Payments with UTR
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
                totalPaid: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "approved_payment",
        },
      },
      // Add advance_paid field
      {
        $addFields: {
          advance_paid: {
            $cond: {
              if: { $gt: [{ $size: "$approved_payment" }, 0] },
              then: { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
              else: 0,
            },
          },
        },
      },
      {
        $lookup: {
          from: "biildetails",
          let: { po_numberStr: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: "$po_number" }, "$$po_numberStr"],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalBilled: { $sum: { $toDouble: "$bill_value" } },
              },
            },
          ],
          as: "billed_summary",
        },
      },

      {
        $addFields: {
          total_billed_value: {
            $cond: {
              if: { $gt: [{ $size: "$billed_summary" }, 0] },
              then: { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
              else: 0,
            },
          },
        },
      },

      {
        $addFields: {
          remaining_amount: {
            $subtract: [
              { $toDouble: "$purchase_orders.po_value" },
              { $toDouble: "$advance_paid" },
            ],
          },
        },
      },

      // Final projection for frontend
      {
        $project: {
          _id: 0,
          project_code: "$code",
          po_number: "$purchase_orders.po_number",
          vendor: "$purchase_orders.vendor",
          item_name: "$purchase_orders.item",
          po_value: "$purchase_orders.po_value",
          advance_paid: 1,
          remaining_amount: 1,
          total_billed_value: 1,
        },
      },
    ]);

    const meta = result.reduce(
      (acc, curr) => {
        acc.total_advance_paid += Number(curr.advance_paid || 0);
        acc.total_remaining_amount += Number(curr.remaining_amount || 0);
        acc.total_billed_value += Number(curr.total_billed_value || 0);
        acc.total_po_value += Number(curr.po_value || 0);
        return acc;
      },
      {
        total_advance_paid: 0,
        total_remaining_amount: 0,
        total_billed_value: 0,
        total_po_value: 0,
      }
    );

    if (!result.length) {
      return res
        .status(404)
        .json({ error: "No project found with this p_id." });
    }

    return res.status(200).json({ data: result, meta });
  } catch (error) {
    console.error("Error fetching client history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const totalBalanceSummary = async (req, res) => {
  try {
    const { p_id } = req.query;
    if (!p_id)
      return res.status(400).json({ error: "Project ID (p_id) is required." });

    const cleanPId = isNaN(p_id) ? p_id : Number(p_id);

    const result = await ProjectModel.aggregate([
      // Match project by p_id
      { $match: { p_id: cleanPId } },

      // Total Credits (Add Money)
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
                totalCredit: { $sum: { $toDouble: "$cr_amount" } },
              },
            },
          ],
          as: "creditData",
        },
      },

      // Total Returns (Customer Adjustment)
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
                total_return: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "returnData",
        },
      },

      // Total Advances Paid to Vendors
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
                totalAdvancePaidToVendors: {
                  $sum: { $toDouble: "$amount_paid" },
                },
              },
            },
          ],
          as: "advancePaymentData",
        },
      },

      // Get Purchase Orders
      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "purchase_orders",
        },
      },
      {
        $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
      },

      // Advance Payments per PO
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
                totalPaid: { $sum: { $toDouble: "$amount_paid" } },
              },
            },
          ],
          as: "po_advance_payments",
        },
      },

      // Billed Summary per PO
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
                totalBilled: { $sum: { $toDouble: "$bill_value" } },
              },
            },
          ],
          as: "billed_summary",
        },
      },

      // Add advance and billed values to purchase_orders
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

      // Adjustments
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
                    { $toDouble: "$adj_amount" },
                    0,
                  ],
                },
                debit_adj: {
                  $cond: [
                    { $eq: ["$adj_type", "Subtract"] },
                    { $toDouble: "$adj_amount" },
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

      // Group results by project
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
          total_po_value: { $sum: { $toDouble: "$purchase_orders.po_value" } },
          total_advance_paid: { $sum: "$purchase_orders.advance_paid" },
          total_billed_value: { $sum: "$purchase_orders.total_billed_value" },
          total_po_basic: {
            $sum: {
              $cond: [
                { $ifNull: ["$purchase_orders.po_basic", false] },
                {
                  $convert: {
                    input: { $trim: { input: "$purchase_orders.po_basic" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
          },
          gst_as_po_basic: {
            $sum: {
              $cond: [
                { $ifNull: ["$purchase_orders.gst", false] },
                {
                  $convert: {
                    input: { $trim: { input: "$purchase_orders.gst" } },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
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

      // Derived fields
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
          total_po_with_gst: {
            $round: [{ $add: ["$total_po_basic", "$gst_as_po_basic"] }, 2],
          },
          extraGST: {
            $round: [
              {
                $cond: [
                  { $gt: ["$total_po_basic", 0] },
                  { $subtract: ["$total_po_with_gst", "$total_po_basic"] },
                  0,
                ],
              },
              2,
            ],
          },

          tcs_as_applicable: {
            $cond: {
              if: {
                $gt: [
                  { $subtract: ["$totalCredit", "$total_return"] },
                  5000000,
                ],
              },
              then: {
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
              else: 0,
            },
          },
          total_adjustment: {
            $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"],
          },

          gst_with_type_percentage: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$billing_type", "Composite"] },
                  then: {
                    $round: [{ $multiply: ["$total_po_basic", 0.138] }, 2],
                  },
                },
                {
                  case: { $eq: ["$billing_type", "Individual"] },
                  then: {
                    $round: [{ $multiply: ["$total_po_basic", 0.18] }, 2],
                  },
                },
              ],
              default: 0,
            },
          },
          gst_difference: {
            $cond: {
              if: { $gt: ["$gst_with_type_percentage", "$gst_as_po_basic"] },
              then: {
                $subtract: ["$gst_with_type_percentage", "$gst_as_po_basic"],
              },
              else: 0,
            },
          },
        },
      },
      {
        $addFields: {
          net_advanced_paid: {
            $subtract: [
              { $ifNull: ["$total_advance_paid", 0] },
              { $ifNull: ["$total_billed_value", 0] },
            ],
          },
        },
      },

      {
        $addFields: {
          netBalance: {
            $subtract: [
              { $ifNull: ["$totalCredit", 0] },
              { $ifNull: ["$total_return", 0] },
            ],
          },
        },
      },

      {
        $addFields: {
          balance_with_slnko: {
            $subtract: [
              {
                $subtract: [
                  { $ifNull: ["$netBalance", 0] },
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
          balance_payable_to_vendors: {
            $subtract: [
              {
                $subtract: [
                  { $ifNull: ["$total_po_with_gst", 0] },
                  { $ifNull: ["$total_billed_value", 0] },
                ],
              },
              { $ifNull: ["$net_advanced_paid", 0] },
            ],
          },
        },
      },
      {
        $addFields: {
          balance_required: {
            $subtract: [
              {
                $subtract: [
                  { $ifNull: ["$balance_with_slnko", 0] },
                  { $ifNull: ["$balance_payable_to_vendors", 0] },
                ],
              },
              { $ifNull: ["$tcs_as_applicable", 0] },
            ],
          },
        },
      },

      // Final Output Projection
      {
        $project: {
          _id: 0,
          p_id: "$_id",
          billing_type: 1,
          total_received: "$totalCredit",
          total_return: 1,
          netBalance: 1,
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
          gst_difference: 1,
          balance_required: 1,
        },
      },
    ]);

    return res.status(200).json({ result });
  } catch (error) {
    console.error("Error fetching total balance summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getCreditSummary = async (req, res) => {
  try {
    const { p_id, start_date, end_date } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const projectId = isNaN(p_id) ? p_id : Number(p_id);

    const match = { p_id: projectId };

    // Date range filter
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      match.cr_date = { $gte: start, $lte: end };
    }

    const [creditData] = await CreditModel.aggregate([
      { $match: match }, // ⬅️ this match handles both p_id and date filter
      {
        $facet: {
          history: [
            { $sort: { cr_date: 1 } },
            {
              $project: {
                _id: 0,
                p_id: 1,
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
                totalCredited: { $sum: "$cr_amount" },
              },
            },
          ],
        },
      },
    ]);

    const total = creditData?.summary[0]?.totalCredited || 0;

    return res.status(200).json({
      history: creditData?.history || [],
      total,
    });
  } catch (error) {
    console.error("Credit summary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getDebitSummary = async (req, res) => {
  try {
    const { p_id, start_date, end_date, vendor } = req.query;
    if (!p_id)
      return res.status(400).json({ error: "Project ID (p_id) is required." });

    const projectId = isNaN(p_id) ? p_id : Number(p_id);
    const match = { p_id: projectId };

    if (vendor) {
      match.vendor = { $regex: vendor, $options: "i" };
    }

    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      match.dbt_date = { $gte: start, $lte: end };
    }

    const [debitData] = await DebitModel.aggregate([
      {
        $addFields: {
          dbt_date: { $toDate: "$dbt_date" },
        },
      },
      {
        $match: {
          ...match,
          ...(start_date &&
            end_date && {
              dbt_date: {
                $gte: new Date(start_date),
                $lte: new Date(new Date(end_date).setHours(23, 59, 59, 999)),
              },
            }),
        },
      },
      {
        $facet: {
          history: [
            { $sort: { dbt_date: -1 } },
            {
              $project: {
                _id: 0,
                db_date: 1,
                db_mode: 1,
                amount_paid: 1,
                paid_for: 1,
                po_number: 1,
                utr: 1,
                updatedAt: 1,
                createdAt: 1,
                paid_to: "$vendor",
                debit_date: "$dbt_date",
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalDebited: { $sum: "$amount_paid" },
              },
            },
          ],
        },
      },
    ]);
    res.status(200).json({
      history: debitData?.history || [],
      total: debitData?.summary[0]?.totalDebited || 0,
    });
  } catch (error) {
    console.error("Debit summary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getAdjustmentHistory = async (req, res) => {
  try {
    const { p_id, start_date, end_date, search } = req.query;

    if (!p_id)
      return res.status(400).json({ error: "Project ID (p_id) is required." });

    const projectId = isNaN(p_id) ? p_id : Number(p_id);

    // Match base filter
    const match = { p_id: projectId };

    // Date filter
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      match.createdAt = { $gte: start, $lte: end };
    }

    // Search on paid_for OR po_number
    if (search) {
      match.$or = [
        { paid_for: { $regex: search, $options: "i" } },
        { po_number: { $regex: search, $options: "i" } },
      ];
    }

    const [adjustmentData] = await AdjustmentModel.aggregate([
      { $match: match },
      {
        $project: {
          _id: 0,
          adj_type: 1,
          adj_date: 1,
          comment: 1,
          po_number: 1,
          pay_type: 1,
          updatedAt: 1,
          createdAt: 1,
          paid_for: 1,
          adj_amount: {
            $cond: {
              if: { $eq: [{ $type: "$adj_amount" }, "string"] },
              then: { $toDouble: "$adj_amount" },
              else: "$adj_amount",
            },
          },
          debit_adjustment: {
            $cond: [
              { $eq: ["$adj_type", "Subtract"] },
              {
                $cond: {
                  if: { $eq: [{ $type: "$adj_amount" }, "string"] },
                  then: { $toDouble: "$adj_amount" },
                  else: "$adj_amount",
                },
              },
              0,
            ],
          },
          credit_adjustment: {
            $cond: [
              { $eq: ["$adj_type", "Add"] },
              {
                $cond: {
                  if: { $eq: [{ $type: "$adj_amount" }, "string"] },
                  then: { $toDouble: "$adj_amount" },
                  else: "$adj_amount",
                },
              },
              0,
            ],
          },
          description: "$comment",
        },
      },
      {
        $facet: {
          history: [{ $sort: { createdAt: -1 } }],
          summary: [
            {
              $group: {
                _id: null,
                totalCreditAdjustment: { $sum: "$credit_adjustment" },
                totalDebitAdjustment: { $sum: "$debit_adjustment" },
              },
            },
          ],
        },
      },
    ]);

    const summary = adjustmentData?.summary?.[0] || {};

    res.status(200).json({
      history: adjustmentData?.history || [],
      totalCreditAdjustment: summary.totalCreditAdjustment || 0,
      totalDebitAdjustment: summary.totalDebitAdjustment || 0,
    });
  } catch (error) {
    console.error("Adjustment history error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
module.exports = {
  getCustomerPaymentSummary,
  clientHistory,
  totalBalanceSummary,
  getCreditSummary,
  getDebitSummary,
  getAdjustmentHistory,
};
