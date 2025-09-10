const CreditModel = require("../../models/addMoneyModells");
const DebitModel = require("../../models/debitMoneyModells");
const AdjustmentModel = require("../../models/adjustmentRequestModells");
const ClientModel = require("../../models/purchaseorder.model");
const ProjectModel = require("../../models/project.model");
const { Parser } = require("json2csv");

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

    const formatAddress = (address) => {
      if (typeof address === "object" && address !== null) {
        const village = (address.village_name || "").replace(/(^"|"$)/g, "").trim();
        const district = (address.district_name || "").replace(/(^"|"$)/g, "").trim();
        if ((!village || village.toUpperCase() === "NA") && (!district || district.toUpperCase() === "NA")) {
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
      project.billing_address_formatted = formatAddress(project.billing_address);
      project.site_address_formatted = formatAddress(project.site_address);
    }
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    // ---------- Credit ----------
    const creditMatch = { p_id: projectId, ...buildDateFilter("cr_date") };
    const [creditData] = await CreditModel.aggregate([
      { $match: creditMatch },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            { $project: { _id: 1, cr_date: 1, cr_mode: 1, cr_amount: 1, createdAt: 1 } },
          ],
          summary: [{ $group: { _id: null, totalCredited: { $sum: "$cr_amount" } } }],
        },
      },
    ]);
    const creditHistory = creditData?.history || [];
    const totalCredited = creditData?.summary?.[0]?.totalCredited || 0;

    // ---------- Debit ----------
    const debitMatch = { p_id: projectId };
    if (searchDebit) {
      const regex = new RegExp(searchDebit, "i");
      debitMatch.$or = [{ paid_for: regex }, { vendor: regex }, { po_number: regex }];
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
          summary: [{ $group: { _id: null, totalDebited: { $sum: "$amount_paid" } } }],
        },
      },
    ]);
    const debitHistory = debitData?.history || [];
    const totalDebited = debitData?.summary?.[0]?.totalDebited || 0;

    // ---------- Adjustment ----------
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
                // normalized numerics
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
                    $cond: [{ $eq: ["$adj_type", "Add"] }, "$adj_amount_numeric", 0],
                  },
                },
                totalDebitAdjustment: {
                  $sum: {
                    $cond: [{ $eq: ["$adj_type", "Subtract"] }, "$adj_amount_numeric", 0],
                  },
                },
              },
            },
            { $project: { _id: 0, totalCreditAdjustment: 1, totalDebitAdjustment: 1 } },
          ],
        },
      },
    ]);

    const adjustmentHistory = adjustmentData?.history || [];
    const totalCreditAdjustment = adjustmentData?.summary?.[0]?.totalCreditAdjustment || 0;
    const totalDebitAdjustment = adjustmentData?.summary?.[0]?.totalDebitAdjustment || 0;

    // ---------- Client History (POs) — item_name from PO.items[].category ----------
    const searchRegex = searchClient ? new RegExp(searchClient, "i") : null;

    const clientHistoryResult = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      { $project: { code: 1, _id: 0 } },

      // link purchase orders for this project (code -> p_id on PO)
      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "purchase_orders",
        },
      },
      { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true } },

      // sort newest PO first (helps "advance_paid" calc below)
      { $sort: { "purchase_orders.createdAt": -1 } },

      // normalize PO number to string
      {
        $addFields: {
          po_numberStr: { $toString: "$purchase_orders.po_number" },
        },
      },

      // resolve category names from purchase_orders.item (array) / items / legacy single
      {
        $addFields: {
          poItems: {
            $cond: [
              { $eq: [{ $type: "$purchase_orders.item" }, "array"] },
              "$purchase_orders.item",
              {
                $cond: [
                  { $eq: [{ $type: "$purchase_orders.items" }, "array"] },
                  "$purchase_orders.items",
                  [],
                ],
              },
            ],
          },
        },
      },
      // collect raw category refs: could be ObjectId, string ObjectId-ish, or plain string name
      {
        $addFields: {
          itemCatRawArr: {
            $map: {
              input: "$poItems",
              as: "it",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$it.category" }, "object"] },
                  "$$it.category._id",
                  "$$it.category",
                ],
              },
            },
          },
          // legacy: if PO.item was a single scalar (string/ObjectId)
          legacyItemStr: {
            $cond: [
              { $and: [
                  { $ne: ["$purchase_orders.item", null] },
                  { $eq: [{ $type: "$purchase_orders.item" }, "string"] },
                ]},
              "$purchase_orders.item",
              null
            ],
          },
        },
      },
      // split into objectIds vs plain names
      {
        $addFields: {
          itemCatObjectIdArr: {
            $map: {
              input: "$itemCatRawArr",
              as: "c",
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $type: "$$c" }, "string"] },
                      { $eq: [{ $strLenCP: "$$c" }, 24] },
                      { $regexMatch: { input: "$$c", regex: "^[0-9a-fA-F]{24}$" } },
                    ],
                  },
                  { $toObjectId: "$$c" },
                  {
                    $cond: [
                      { $eq: [{ $type: "$$c" }, "objectId"] },
                      "$$c",
                      null,
                    ],
                  },
                ],
              },
            },
          },
          itemCatNameStrArr: {
            $map: {
              input: "$itemCatRawArr",
              as: "c",
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $type: "$$c" }, "string"] },
                      {
                        $not: [
                          {
                            $and: [
                              { $eq: [{ $strLenCP: "$$c" }, 24] },
                              { $regexMatch: { input: "$$c", regex: "^[0-9a-fA-F]{24}$" } },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  "$$c",
                  null,
                ],
              },
            },
          },
          // if legacyItemStr is a plain name, include it for name matching
          legacyItemName: {
            $cond: [
              {
                $and: [
                  { $ne: ["$legacyItemStr", null] },
                  { $not: [
                      { $and: [
                          { $eq: [{ $strLenCP: "$legacyItemStr" }, 24] },
                          { $regexMatch: { input: "$legacyItemStr", regex: "^[0-9a-fA-F]{24}$" } }
                        ]}
                    ]
                  }
                ]
              },
              "$legacyItemStr",
              null
            ]
          },
          legacyItemObjId: {
            $cond: [
              {
                $and: [
                  { $ne: ["$legacyItemStr", null] },
                  { $eq: [{ $strLenCP: "$legacyItemStr" }, 24] },
                  { $regexMatch: { input: "$legacyItemStr", regex: "^[0-9a-fA-F]{24}$" } },
                ],
              },
              { $toObjectId: "$legacyItemStr" },
              null,
            ],
          },
        },
      },
      // lookup materialcategories by ids
      {
        $lookup: {
          from: "materialcategories",
          let: {
            idList: {
              $setUnion: [
                { $filter: { input: "$itemCatObjectIdArr", as: "x", cond: { $ne: ["$$x", null] } } },
                [{ $ifNull: ["$legacyItemObjId", null] }],
              ],
            },
          },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$idList"] } } },
            { $project: { _id: 1, name: 1 } },
          ],
          as: "mcByIds",
        },
      },
      // lookup materialcategories by plain names
      {
        $lookup: {
          from: "materialcategories",
          let: {
            nameList: {
              $setUnion: [
                { $filter: { input: "$itemCatNameStrArr", as: "x", cond: { $ne: ["$$x", null] } } },
                [{ $ifNull: ["$legacyItemName", null] }],
              ],
            },
          },
          pipeline: [
            { $match: { $expr: { $in: ["$name", "$$nameList"] } } },
            { $project: { _id: 1, name: 1 } },
          ],
          as: "mcByNames",
        },
      },
      {
        $addFields: {
          resolvedCatNames: {
            $setUnion: [
              { $map: { input: "$mcByIds", as: "c", in: "$$c.name" } },
              { $map: { input: "$mcByNames", as: "c", in: "$$c.name" } },
            ],
          },
        },
      },

      // payments for advance_paid
      {
        $lookup: {
          from: "payrequests",
          let: { po_numberStr: "$po_numberStr" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: "$po_number" }, "$$po_numberStr"] },
                    {
                      $or: [
                        {
                          $and: [
                            { $eq: ["$approved", "Approved"] },
                            { $eq: ["$acc_match", "matched"] },
                            { $ne: ["$utr", ""] },
                          ],
                        },
                        {
                          $and: [
                            { $eq: ["$approved", "Approved"] },
                            { $ne: ["$utr", ""] },
                            { $eq: ["$approval_status.stage", "Initial Account"] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            { $group: { _id: null, totalPaid: { $sum: { $toDouble: "$amount_paid" } } } },
          ],
          as: "approved_payment",
        },
      },

      // billed summary for total_billed_value
      {
        $lookup: {
          from: "biildetails",
          let: { po_numberStr: "$po_numberStr" },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: "$po_number" }, "$$po_numberStr"] } } },
            { $group: { _id: null, totalBilled: { $sum: { $toDouble: "$bill_value" } } } },
          ],
          as: "billed_summary",
        },
      },

      // optional search across vendor/item/po_number/code
      ...(searchRegex
        ? [
            {
              $match: {
                $or: [
                  { "purchase_orders.vendor": searchRegex },
                  { "purchase_orders.po_number": searchRegex },
                  { code: searchRegex },
                  // allow matching on resolved category names
                  { resolvedCatNames: { $elemMatch: { $regex: searchRegex } } },
                ],
              },
            },
          ]
        : []),

      // final projection: item_name is a **string** built from resolvedCatNames (comma-separated)
      {
        $project: {
          _id: "$purchase_orders._id",
          project_code: "$code",
          po_number: "$purchase_orders.po_number",
          vendor: "$purchase_orders.vendor",

          // *** HERE: item_name as category list (string) with safe fallbacks ***
          item_name: {
            $cond: [
              { $gt: [{ $size: "$resolvedCatNames" }, 0] },
              {
                $reduce: {
                  input: "$resolvedCatNames",
                  initialValue: "",
                  in: {
                    $concat: [
                      { $cond: [{ $eq: ["$$value", ""] }, "", { $concat: ["$$value", ", "] }] },
                      "$$this",
                    ],
                  },
                },
              },
              {
                $cond: [
                  { $eq: [{ $type: "$purchase_orders.item" }, "string"] },
                  "$purchase_orders.item",
                  "-"
                ],
              },
            ],
          },

          po_value: "$purchase_orders.po_value",
          advance_paid: {
            $cond: [
              { $gt: [{ $size: "$approved_payment" }, 0] },
              { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
              0,
            ],
          },
          total_billed_value: {
            $cond: [
              { $gt: [{ $size: "$billed_summary" }, 0] },
              { $arrayElemAt: ["$billed_summary.totalBilled", 0] },
              0,
            ],
          },
          remaining_amount: {
            $subtract: [
              { $toDouble: "$purchase_orders.po_value" },
              {
                $cond: [
                  { $gt: [{ $size: "$approved_payment" }, 0] },
                  { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
                  0,
                ],
              },
            ],
          },
          po_basic: "$purchase_orders.po_basic",
          gst: "$purchase_orders.gst",
        },
      },
    ]);

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

    // ---------- Balance Summary (unchanged from your version) ----------
    const [balanceSummary = {}] = await ProjectModel.aggregate([
      { $match: { p_id: projectId } },
      {
        $lookup: {
          from: "addmoneys",
          let: { projectId: "$p_id" },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }] } } },
            { $group: { _id: null, totalCredit: { $sum: { $toDouble: "$cr_amount" } } } },
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
                    { $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }] },
                    { $eq: ["$paid_for", "Customer Adjustment"] },
                  ],
                },
              },
            },
            { $group: { _id: null, total_return: { $sum: { $toDouble: "$amount_paid" } } } },
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
                    { $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }] },
                    { $eq: ["$acc_match", "matched"] },
                    { $eq: ["$approved", "Approved"] },
                    { $ne: ["$utr", ""] },
                  ],
                },
              },
            },
            { $group: { _id: null, totalAdvancePaidToVendors: { $sum: { $toDouble: "$amount_paid" } } } },
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
      { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true } },
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
            { $group: { _id: null, totalPaid: { $sum: { $toDouble: "$amount_paid" } } } },
          ],
          as: "po_advance_payments",
        },
      },
      {
        $lookup: {
          from: "biildetails",
          let: { poNumber: { $toString: "$purchase_orders.po_number" } },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: "$po_number" }, "$$poNumber"] } } },
            { $group: { _id: null, totalBilled: { $sum: { $toDouble: "$bill_value" } } } },
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
                credit_adj: { $cond: [{ $eq: ["$adj_type", "Add"] }, { $toDouble: "$adj_amount" }, 0] },
                debit_adj: { $cond: [{ $eq: ["$adj_type", "Subtract"] }, { $toDouble: "$adj_amount" }, 0] },
              },
            },
            { $group: { _id: null, totalCreditAdjustment: { $sum: "$credit_adj" }, totalDebitAdjustment: { $sum: "$debit_adj" } } },
          ],
          as: "adjustmentData",
        },
      },
      {
        $group: {
          _id: "$p_id",
          billing_type: { $first: "$billing_type" },
          totalCredit: { $first: { $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0] } },
          total_return: { $first: { $ifNull: [{ $arrayElemAt: ["$returnData.total_return", 0] }, 0] } },
          totalAdvancePaidToVendors: { $first: { $ifNull: [{ $arrayElemAt: ["$advancePaymentData.totalAdvancePaidToVendors", 0] }, 0] } },
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
          totalCreditAdjustment: { $first: { $ifNull: [{ $arrayElemAt: ["$adjustmentData.totalCreditAdjustment", 0] }, 0] } },
          totalDebitAdjustment: { $first: { $ifNull: [{ $arrayElemAt: ["$adjustmentData.totalDebitAdjustment", 0] }, 0] } },
        },
      },
      {
        $addFields: {
          expected_po_value: {
            $switch: {
              branches: [
                { case: { $eq: ["$billing_type", "Composite"] }, then: { $multiply: ["$total_advance_paid", 1.138] } },
                { case: { $eq: ["$billing_type", "Individual"] }, then: { $multiply: ["$total_advance_paid", 1.18] } },
              ],
              default: 0,
            },
          },
        },
      },
      { $addFields: { total_po_with_gst: { $add: ["$total_po_basic", "$gst_as_po_basic"] } } },
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
              { $gt: [{ $subtract: ["$totalCredit", "$total_return"] }, 5000000] },
              { $round: [{ $multiply: [{ $subtract: [{ $subtract: ["$totalCredit", "$total_return"] }, 5000000] }, 0.001] }, 2] },
              0,
            ],
          },
        },
      },
      { $addFields: { total_adjustment: { $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"] } } },
      {
        $addFields: {
          balance_with_slnko: {
            $subtract: [
              { $subtract: [{ $subtract: [{ $ifNull: ["$totalCredit", 0] }, { $ifNull: ["$total_return", 0] }] }, { $ifNull: ["$total_advance_paid", 0] }] },
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
                { case: { $eq: ["$billing_type", "Composite"] }, then: { $round: [{ $multiply: ["$total_po_basic", 0.138] }] } },
                { case: { $eq: ["$billing_type", "Individual"] }, then: { $round: [{ $multiply: ["$total_po_basic", 0.18] }] } },
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
                  { $add: [{ $ifNull: ["$balance_payable_to_vendors", 0] }, { $ifNull: ["$tcs_as_applicable", 0] }] },
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
          net_advanced_paid: { $subtract: ["$total_advance_paid", "$total_billed_value"] },
          gst_as_po_basic: 1,
          total_po_with_gst: 1,
          gst_with_type_percentage: 1,
          gst_difference: 1,
          balance_required: 1,
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

    // ---------- CSV export ----------
    if (exportToCSV === "csv") {
      let csvContent = "";

      csvContent += "Project Details\n";
      Object.entries(responseData.projectDetails).forEach(([k, v]) => (csvContent += `${k},${v}\n`));
      csvContent += "\n";

      if (creditHistory.length) {
        csvContent += "Credit History\n";
        csvContent += Object.keys(creditHistory[0]).join(",") + "\n";
        creditHistory.forEach((it) => (csvContent += Object.values(it).join(",") + "\n"));
        csvContent += "\n";
      }

      if (debitHistory.length) {
        csvContent += "Debit History\n";
        csvContent += Object.keys(debitHistory[0]).join(",") + "\n";
        debitHistory.forEach((it) => (csvContent += Object.values(it).join(",") + "\n"));
        csvContent += "\n";
      }

      if (adjustmentHistory.length) {
        csvContent += "Adjustment History\n";
        csvContent += Object.keys(adjustmentHistory[0]).join(",") + "\n";
        adjustmentHistory.forEach((it) => (csvContent += Object.values(it).join(",") + "\n"));
        csvContent += "\n";
      }

      if (clientHistoryResult.length) {
        csvContent += "Client History\n";
        csvContent += Object.keys(clientHistoryResult[0]).join(",") + "\n";
        clientHistoryResult.forEach((it) => (csvContent += Object.values(it).join(",") + "\n"));
        csvContent += "\n";
      }

      csvContent += "Balance Summary\n";
      Object.entries(balanceSummary).forEach(([k, v]) => (csvContent += `${k},${v}\n`));

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


module.exports = {
  getCustomerPaymentSummary,
};
