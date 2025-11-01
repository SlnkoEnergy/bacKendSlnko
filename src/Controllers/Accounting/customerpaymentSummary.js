const CreditModel = require("../../models/addMoneyModells");
const DebitModel = require("../../models/debitMoneyModells");
const AdjustmentModel = require("../../models/adjustmentRequestModells");
const ProjectModel = require("../../models/project.model");
const { default: axios } = require("axios");

// ---- helpers (keep these at top of file) ----
const asDouble = (v) => ({ $toDouble: { $ifNull: [v, 0] } });

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

const toStr = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    const cand = v.name ?? v.label ?? v.value ?? v.text ?? v.title ?? "";
    return typeof cand === "string" || typeof cand === "number"
      ? String(cand)
      : "";
  }
  return "";
};

const cleanToken = (s) =>
  toStr(s)
    .replace(/(^"|"$)/g, "")
    .trim();

const isNA = (s) => {
  const t = cleanToken(s).toUpperCase();
  return !t || t === "NA" || t === "N/A" || t === "-";
};

const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");



const getCustomerPaymentSummary = async (req, res) => {
  try {
    const tab = (req.query.tab || "").toLowerCase();

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
      try {
        if (Array.isArray(address)) {
          const first = address.find(Boolean) ?? "";
          address = first;
        }

        if (address && typeof address === "object") {
          const line1 = cleanToken(
            address.address_line1 ?? address.line1 ?? address.address
          );
          const village = cleanToken(
            address.village_name ?? address.village ?? address.villageName
          );
          const district = cleanToken(
            address.district_name ?? address.district ?? address.districtName
          );
          const city = cleanToken(
            address.city ?? address.town ?? address.tehsil
          );
          const state = cleanToken(
            address.state ?? address.state_name ?? address.stateName
          );
          const pincode = cleanToken(
            address.pincode ?? address.pin ?? address.zip
          );

          const parts = [line1, village, district, city, state, pincode].filter(
            (p) => !isNA(p)
          );
          return parts.length ? parts.join(", ") : "-";
        }

        if (typeof address === "string" || typeof address === "number") {
          const s = cleanToken(address);
          return s && !isNA(s) ? s : "-";
        }

        return "-";
      } catch {
        return "-";
      }
    };

    const project = {
      name: projectDoc.name,
      p_group: projectDoc.p_group,
      project_kwp: projectDoc.project_kwp,
      customer: projectDoc.customer,
      code: projectDoc.code,
      billing_type: projectDoc.billing_type,
      billing_address_formatted: formatAddress(
        projectDoc.billing_address ?? ""
      ),
      site_address_formatted: formatAddress(projectDoc.site_address ?? ""),
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
    const hasSearch = !!(searchDebit && searchDebit.trim());
    const searchEsc = hasSearch ? escapeRegex(searchDebit.trim()) : null;
    const isDigits = hasSearch && /^\d+$/.test(searchDebit.trim());

    const baseMatch = { p_id: projectId };
    if (startDate || endDate) {
      baseMatch.dbt_date = {};
      if (startDate) baseMatch.dbt_date.$gte = startDate;
      if (endDate) baseMatch.dbt_date.$lte = endDate;
    }

    const [debitData] = await DebitModel.aggregate([
      { $match: baseMatch },
      {
        $addFields: {
          po_numberStr: { $toString: { $ifNull: ["$po_number", ""] } },
          vendorStr: { $toString: { $ifNull: ["$vendor", ""] } },
          paid_forStr: { $toString: { $ifNull: ["$paid_for", ""] } },
        },
      },

      ...(hasSearch
        ? [
            {
              $match: {
                $or: [
                  { po_numberStr: { $regex: searchEsc, $options: "i" } },
                  ...(isDigits
                    ? [{ po_number: Number(searchDebit.trim()) }]
                    : []),
                  { vendorStr: { $regex: searchEsc, $options: "i" } },
                  { paid_forStr: { $regex: searchEsc, $options: "i" } },
                ],
              },
            },
          ]
        : []),

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

    // ---------- Purchase (client) history ----------
    const qRaw = (req.query?.searchClient ?? req.query?.search ?? "").trim();
    const searchPattern = qRaw ? escapeRegex(qRaw) : null;
    const isNumericSearch = /^\d+$/.test(qRaw);

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

            ...(isNumericSearch
              ? [
                  {
                    $match: {
                      $or: [
                        { po_number: Number(qRaw) },
                        {
                          po_numberStr: {
                            $regex: searchPattern,
                            $options: "i",
                          },
                        },
                      ],
                    },
                  },
                ]
              : []),

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
                        {
                          basic_sales: asDouble({
                            $arrayElemAt: ["$$tail.basic_sales", 0],
                          }),
                          gst_on_sales: asDouble({
                            $arrayElemAt: ["$$tail.gst_on_sales", 0],
                          }),
                          total_sales_value: {
                            $add: [
                              asDouble({
                                $arrayElemAt: ["$$tail.basic_sales", 0],
                              }),
                              asDouble({
                                $arrayElemAt: ["$$tail.gst_on_sales", 0],
                              }),
                            ],
                          },
                        },
                        {
                          basic_sales: 0,
                          gst_on_sales: 0,
                          total_sales_value: 0,
                        },
                      ],
                    },
                  },
                },
              },
            },

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
                  {
                    $unwind: {
                      path: "$item",
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $addFields: {
                      bill_value_num: asDouble({
                        $replaceAll: {
                          input: {
                            $replaceAll: {
                              input: {
                                $toString: {
                                  $ifNull: ["$item.bill_value", "0"],
                                },
                              },
                              find: ",",
                              replacement: "",
                            },
                          },
                          find: " ",
                          replacement: "",
                        },
                      }),
                      gst_num: asDouble({
                        $replaceAll: {
                          input: {
                            $replaceAll: {
                              input: {
                                $replaceAll: {
                                  input: {
                                    $toString: {
                                      $ifNull: ["$item.gst_percent", "0"],
                                    },
                                  },
                                  find: "%",
                                  replacement: "",
                                },
                              },
                              find: ",",
                              replacement: "",
                            },
                          },
                          find: " ",
                          replacement: "",
                        },
                      }),
                      qty_num: asDouble({
                        $replaceAll: {
                          input: {
                            $toString: { $ifNull: ["$item.quantity", "0"] },
                          },
                          find: ",",
                          replacement: "",
                        },
                      }),
                    },
                  },
                  {
                    $addFields: {
                      line_basic: {
                        $multiply: ["$qty_num", "$bill_value_num"],
                      },
                      line_gst: {
                        $multiply: [
                          { $multiply: ["$qty_num", "$bill_value_num"] },
                          { $divide: ["$gst_num", 100] },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      bill_basic_sum: { $sum: "$line_basic" },
                      bill_gst_sum: { $sum: "$line_gst" },
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
                  $ifNull: [
                    { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
                    0,
                  ],
                },
                bill_gst: {
                  $ifNull: [{ $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] }, 0],
                },
              },
            },
            {
              $addFields: {
                total_billed_value: { $add: ["$bill_basic", "$bill_gst"] },
              },
            },
            { $project: { bill_agg: 0 } },

            // Derived totals
            {
              $addFields: {
                total_sales_value: asDouble(
                  "$last_sales_detail.total_sales_value"
                ),
                total_unbilled_sales: {
                  $round: [
                    {
                      $subtract: [
                        {
                          $add: [
                            asDouble("$bill_basic"),
                            asDouble("$bill_gst"),
                          ],
                        },
                        asDouble("$last_sales_detail.total_sales_value"),
                      ],
                    },
                    2,
                  ],
                },
                remaining_sales_closure: {
                  $round: [
                    {
                      $subtract: [
                        asDouble("$bill_basic"),
                        asDouble("$last_sales_detail.basic_sales"),
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
          item_name: {
            $let: {
              vars: {
                arr: {
                  $cond: [
                    { $eq: [{ $type: "$purchase_orders.item" }, "array"] },
                    "$purchase_orders.item",
                    [],
                  ],
                },
                str: {
                  $cond: [
                    { $eq: [{ $type: "$purchase_orders.item" }, "string"] },
                    {
                      $trim: {
                        input: { $ifNull: ["$purchase_orders.item", ""] },
                      },
                    },
                    "",
                  ],
                },
              },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$arr" }, 0] },
                  {
                    $reduce: {
                      input: {
                        $setUnion: [
                          {
                            $filter: {
                              input: {
                                $map: {
                                  input: "$$arr",
                                  as: "it",
                                  in: {
                                    $let: {
                                      vars: { t: { $type: "$$it" } },
                                      in: {
                                        $cond: [
                                          { $eq: ["$$t", "object"] },
                                          {
                                            $trim: {
                                              input: {
                                                $ifNull: [
                                                  "$$it.product_name",
                                                  {
                                                    $ifNull: ["$$it.name", ""],
                                                  },
                                                ],
                                              },
                                            },
                                          },
                                          {
                                            $cond: [
                                              { $eq: ["$$t", "string"] },
                                              { $trim: { input: "$$it" } },
                                              "",
                                            ],
                                          },
                                        ],
                                      },
                                    },
                                  },
                                },
                              },
                              as: "n",
                              cond: { $ne: ["$$n", ""] },
                            },
                          },
                          [],
                        ],
                      },
                      initialValue: "",
                      in: {
                        $cond: [
                          { $eq: ["$$value", ""] },
                          "$$this",
                          { $concat: ["$$value", ", ", "$$this"] },
                        ],
                      },
                    },
                  },
                  { $cond: [{ $ne: ["$$str", ""] }, "$$str", "-"] },
                ],
              },
            },
          },
        },
      },

      // Vendor lookup with guards
      {
        $lookup: {
          from: "vendors",
          let: { vId: "$purchase_orders.vendor" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    "$_id",
                    {
                      $cond: [
                        { $eq: [{ $type: "$$vId" }, "objectId"] },
                        "$$vId",
                        {
                          $cond: [
                            {
                              $and: [
                                { $eq: [{ $type: "$$vId" }, "string"] },
                                {
                                  $regexMatch: {
                                    input: "$$vId",
                                    regex: /^[0-9a-fA-F]{24}$/,
                                  },
                                },
                              ],
                            },
                            { $toObjectId: "$$vId" },
                            null,
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                displayName: {
                  $ifNull: [
                    "$name",
                    {
                      $ifNull: [
                        "$vendor_name",
                        { $ifNull: ["$company_name", ""] },
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "_vendor",
        },
      },
      {
        $addFields: {
          vendorName: {
            $let: {
              vars: { v: { $ifNull: ["$_vendor", []] } },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$v" }, 0] },
                  { $ifNull: [{ $arrayElemAt: ["$$v.displayName", 0] }, ""] },
                  "",
                ],
              },
            },
          },
        },
      },

      ...(searchPattern
        ? [
            {
              $match: {
                $expr: {
                  $or: [
                    {
                      $regexMatch: {
                        input: "$vendorName",
                        regex: searchPattern,
                        options: "i",
                      },
                    },
                    {
                      $regexMatch: {
                        input: "$item_name",
                        regex: searchPattern,
                        options: "i",
                      },
                    },
                    {
                      $regexMatch: {
                        input: "$code",
                        regex: searchPattern,
                        options: "i",
                      },
                    },
                    {
                      $regexMatch: {
                        input: { $toString: "$purchase_orders.po_number" },
                        regex: searchPattern,
                        options: "i",
                      },
                    },
                  ],
                },
              },
            },
          ]
        : []),

      // Final projection (with array-safe approved_payment extraction)
      {
        $project: {
          _id: "$purchase_orders._id",
          project_code: "$code",
          po_number: "$purchase_orders.po_number",
          vendor: "$vendorName",
          po_value: "$purchase_orders.po_value",
          item_name: "$item_name",
          total_unbilled_sales: "$purchase_orders.total_unbilled_sales",
          total_sales_value: asDouble(
            "$purchase_orders.last_sales_detail.total_sales_value"
          ),
          po_basic: "$purchase_orders.po_basic",
          gst: "$purchase_orders.gst",
          bill_basic: "$purchase_orders.bill_basic",
          bill_gst: "$purchase_orders.bill_gst",
          total_billed_value: "$purchase_orders.total_billed_value",
          remaining_sales_closure: "$purchase_orders.remaining_sales_closure",

          advance_paid: {
            $let: {
              vars: {
                ap: { $ifNull: ["$purchase_orders.approved_payment", []] },
              },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$ap" }, 0] },
                  { $ifNull: [{ $arrayElemAt: ["$$ap.totalPaid", 0] }, 0] },
                  0,
                ],
              },
            },
          },

          remaining_amount: {
            $subtract: [
              asDouble("$purchase_orders.po_value"),
              {
                $let: {
                  vars: {
                    ap: { $ifNull: ["$purchase_orders.approved_payment", []] },
                  },
                  in: {
                    $cond: [
                      { $gt: [{ $size: "$$ap" }, 0] },
                      { $ifNull: [{ $arrayElemAt: ["$$ap.totalPaid", 0] }, 0] },
                      0,
                    ],
                  },
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
          acc.total_gst += Number(curr.gst || 0);
          acc.total_remaining_sales_closure += Number(
            curr.remaining_sales_closure || 0
          );
          return acc;
        },
        {
          total_advance_paid: 0,
          total_billed_value: 0,
          total_po_value: 0,
          total_po_basic: 0,
          total_bill_basic: 0,
          total_bill_gst: 0,
          total_gst: 0,
          total_unbilled_sales: 0,
          total_remaining_amount: 0,
          total_sales_value: 0,
          total_remaining_sales_closure: 0,
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

            // Item name
            {
              $addFields: {
                item_name: {
                  $let: {
                    vars: {
                      arr: {
                        $switch: {
                          branches: [
                            {
                              case: { $eq: [{ $type: "$item" }, "array"] },
                              then: "$item",
                            },
                            {
                              case: { $eq: [{ $type: "$item" }, "object"] },
                              then: ["$item"],
                            },
                          ],
                          default: [],
                        },
                      },
                      str: {
                        $cond: [
                          { $eq: [{ $type: "$item" }, "string"] },
                          { $trim: { input: { $ifNull: ["$item", ""] } } },
                          "",
                        ],
                      },
                    },
                    in: {
                      $cond: [
                        { $gt: [{ $size: "$$arr" }, 0] },
                        {
                          $reduce: {
                            input: {
                              $setUnion: [
                                {
                                  $filter: {
                                    input: {
                                      $map: {
                                        input: "$$arr",
                                        as: "it",
                                        in: {
                                          $let: {
                                            vars: { t: { $type: "$$it" } },
                                            in: {
                                              $cond: [
                                                { $eq: ["$$t", "object"] },
                                                {
                                                  $trim: {
                                                    input: {
                                                      $ifNull: [
                                                        "$$it.product_name",
                                                        {
                                                          $ifNull: [
                                                            "$$it.name",
                                                            "",
                                                          ],
                                                        },
                                                      ],
                                                    },
                                                  },
                                                },
                                                {
                                                  $cond: [
                                                    { $eq: ["$$t", "string"] },
                                                    {
                                                      $trim: { input: "$$it" },
                                                    },
                                                    "",
                                                  ],
                                                },
                                              ],
                                            },
                                          },
                                        },
                                      },
                                    },
                                    as: "n",
                                    cond: { $ne: ["$$n", ""] },
                                  },
                                },
                                [],
                              ],
                            },
                            initialValue: "",
                            in: {
                              $cond: [
                                { $eq: ["$$value", ""] },
                                "$$this",
                                { $concat: ["$$value", ", ", "$$this"] },
                              ],
                            },
                          },
                        },
                        { $cond: [{ $ne: ["$$str", ""] }, "$$str", "-"] },
                      ],
                    },
                  },
                },
              },
            },

            // BillDetails aggregation per PO (safe parsing)
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
                  {
                    $unwind: {
                      path: "$item",
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $addFields: {
                      bill_value_num: asDouble({
                        $replaceAll: {
                          input: {
                            $replaceAll: {
                              input: {
                                $toString: {
                                  $ifNull: ["$item.bill_value", "0"],
                                },
                              },
                              find: ",",
                              replacement: "",
                            },
                          },
                          find: " ",
                          replacement: "",
                        },
                      }),
                      gst_num: asDouble({
                        $replaceAll: {
                          input: {
                            $replaceAll: {
                              input: {
                                $replaceAll: {
                                  input: {
                                    $toString: {
                                      $ifNull: ["$item.gst_percent", "0"],
                                    },
                                  },
                                  find: "%",
                                  replacement: "",
                                },
                              },
                              find: ",",
                              replacement: "",
                            },
                          },
                          find: " ",
                          replacement: "",
                        },
                      }),
                      qty_num: asDouble({
                        $replaceAll: {
                          input: {
                            $toString: { $ifNull: ["$item.quantity", "0"] },
                          },
                          find: ",",
                          replacement: "",
                        },
                      }),
                    },
                  },
                  {
                    $addFields: {
                      line_basic: {
                        $multiply: ["$qty_num", "$bill_value_num"],
                      },
                      line_gst: {
                        $multiply: [
                          { $multiply: ["$qty_num", "$bill_value_num"] },
                          { $divide: ["$gst_num", 100] },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      bill_basic_sum: { $sum: "$line_basic" },
                      bill_gst_sum: { $sum: "$line_gst" },
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
                  $ifNull: [
                    { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
                    0,
                  ],
                },
                bill_gst: {
                  $ifNull: [{ $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] }, 0],
                },
              },
            },
            {
              $addFields: {
                total_billed_value: {
                  $add: [asDouble("$bill_basic"), asDouble("$bill_gst")],
                },
              },
            },

            // Approved payments (advance)
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
                from: "users",
                let: { uid: "$last_sales_detail.user_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
                  { $project: { _id: 0, name: 1 } },
                ],
                as: "converted_by_user",
              },
            },
            {
              $addFields: {
                attachments: {
                  $map: {
                    input: { $ifNull: ["$last_sales_detail.attachments", []] },
                    as: "att",
                    in: {
                      attachment_url: {
                        $ifNull: ["$$att.attachment_url", ""],
                      },
                      attachment_name: {
                        $ifNull: ["$$att.attachment_name", ""],
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
                po_value: asDouble("$po_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),
                item_name: "$item_name",
                createdAt: 1,

                advance_paid: {
                  $let: {
                    vars: { ap: { $ifNull: ["$approved_payment", []] } },
                    in: {
                      $cond: [
                        { $gt: [{ $size: "$$ap" }, 0] },
                        {
                          $ifNull: [{ $arrayElemAt: ["$$ap.totalPaid", 0] }, 0],
                        },
                        0,
                      ],
                    },
                  },
                },

                total_billed_value: {
                  $add: [asDouble("$bill_basic"), asDouble("$bill_gst")],
                },

                remaining_amount: {
                  $subtract: [
                    asDouble("$po_value"),
                    {
                      $let: {
                        vars: { ap: { $ifNull: ["$approved_payment", []] } },
                        in: {
                          $cond: [
                            { $gt: [{ $size: "$$ap" }, 0] },
                            {
                              $ifNull: [
                                { $arrayElemAt: ["$$ap.totalPaid", 0] },
                                0,
                              ],
                            },
                            0,
                          ],
                        },
                      },
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
                converted_by: {
                  $ifNull: [
                    { $arrayElemAt: ["$converted_by_user.name", 0] },
                    "",
                  ],
                },
                   gst_rate_percent: asDouble("$last_sales_detail.gst_on_sales"),
    gst_on_sales: {
      $round: [
        {
          $divide: [
            {
              $multiply: [
                asDouble("$last_sales_detail.basic_sales"),
                asDouble("$last_sales_detail.gst_on_sales"),
              ],
            },
            100,
          ],
        },
        2,
      ],
    },

                bill_basic: 1,
                bill_gst: 1,
                attachments: {
                  $filter: {
                    input: "$attachments",
                    as: "a",
                    cond: { $ne: ["$$a.attachment_url", ""] },
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

      // ALL POs + per-PO approved advances etc.
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
            // Approved advances per-PO (kept only if you need later)
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
                isSales: 1,
                po_value: asDouble("$po_value"),
                po_basic: asDouble("$po_basic"),
                gst: asDouble("$gst"),

                basic_sales: asDouble("$lastSales.basic_sales"),
                total_sales_value: {
                  $cond: [
                    { $in: ["$isSales", [true, "true", 1, "1"]] },
                    {
                      $toDouble: {
                        $ifNull: [
                          "$total_sales_value",
                          {
                            $ifNull: [
                              { $toDouble: "$lastSales.total_sales_value" },
                              0,
                            ],
                          },
                        ],
                      },
                    },
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

      {
        $group: {
          _id: "$p_id",
          billing_type: { $first: "$billing_type" },

          totalCredit: {
            $first: {
              $let: {
                vars: { arr: { $ifNull: ["$creditData", []] } },
                in: {
                  $cond: [
                    { $gt: [{ $size: "$$arr" }, 0] },
                    {
                      $ifNull: [{ $arrayElemAt: ["$$arr.totalCredit", 0] }, 0],
                    },
                    0,
                  ],
                },
              },
            },
          },
          total_return: {
            $first: {
              $let: {
                vars: { arr: { $ifNull: ["$returnData", []] } },
                in: {
                  $cond: [
                    { $gt: [{ $size: "$$arr" }, 0] },
                    {
                      $ifNull: [{ $arrayElemAt: ["$$arr.total_return", 0] }, 0],
                    },
                    0,
                  ],
                },
              },
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

          // Sales-side totals
          total_sales_value: {
            $sum: {
              $cond: [
                { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
                {
                  $toDouble: {
                    $ifNull: ["$purchase_orders.total_sales_value", 0],
                  },
                },
                0,
              ],
            },
          },

          totalCreditAdjustment: {
            $first: {
              $let: {
                vars: { arr: { $ifNull: ["$adjustmentData", []] } },
                in: {
                  $cond: [
                    { $gt: [{ $size: "$$arr" }, 0] },
                    {
                      $ifNull: [
                        { $arrayElemAt: ["$$arr.totalCreditAdjustment", 0] },
                        0,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
          totalDebitAdjustment: {
            $first: {
              $let: {
                vars: { arr: { $ifNull: ["$adjustmentData", []] } },
                in: {
                  $cond: [
                    { $gt: [{ $size: "$$arr" }, 0] },
                    {
                      $ifNull: [
                        { $arrayElemAt: ["$$arr.totalDebitAdjustment", 0] },
                        0,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
        },
      },

      // Derived fields
      {
        $addFields: {
          netBalance: { $subtract: ["$totalCredit", "$total_return"] },
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
          gst_with_type_percentage: 1,
          gst_difference: 1,
          extraGST: 1,
          total_adjustment: 1,
          total_sales_value: 1,
        },
      },
    ]);

    // ---------- Derived results ----------
    const total_advance_paid =
      (totalDebited || 0) - (balanceSummary?.total_return || 0);


      // const total_sales_value = salesMeta?.total_sales_value || 0;
    const remaining_advance_left_after_billed =
      total_advance_paid > (clientMeta?.total_billed_value || 0)
        ? (total_advance_paid || 0) -
          (balanceSummary?.total_sales_value || 0) -
          (clientMeta?.total_billed_value || 0)
        : 0;

    const exact_remaining_pay_to_vendor =
      (clientMeta?.total_billed_value || 0) > (total_advance_paid || 0)
        ? (balanceSummary?.total_po_with_gst || 0) -
          (clientMeta?.total_billed_value || 0)
        : (balanceSummary?.total_po_with_gst || 0) - (total_advance_paid || 0);

    const balance_with_slnko =
      (balanceSummary?.netBalance || 0) -
      (balanceSummary?.total_sales_value || 0) -
      (clientMeta?.total_billed_value || 0) -
      (remaining_advance_left_after_billed || 0) -
      (balanceSummary?.total_adjustment || 0);

    const aggregate_billed_value = clientMeta?.total_billed_value;

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
      aggregate_billed_value,
      remaining_advance_left_after_billed,
      exact_remaining_pay_to_vendor,
      balance_with_slnko,
      total_advance_paid,
      
    };

    // ---------- Tab filtering (JSON) ----------
    if (tab && exportToCSV !== "csv") {
      const filtered = { ...responseData };

      const emptyCredit = { history: [], total: 0 };
      const emptyDebit = { history: [], total: 0 };
      const emptyAdjustment = { history: [], totalCredit: 0, totalDebit: 0 };
      const emptyClient = {
        data: [],
        meta: {
          total_advance_paid: 0,
          total_billed_value: 0,
          total_po_value: 0,
          total_po_basic: 0,
          total_bill_basic: 0,
          total_bill_gst: 0,
          total_gst: 0,
          total_unbilled_sales: 0,
          total_remaining_amount: 0,
          total_sales_value: 0,
          total_remaining_sales_closure: 0,
        },
      };
      const emptySales = {
        data: [],
        meta: {
          total_sales_value: 0,
          total_basic_sales: 0,
          total_gst_on_sales: 0,
          total_advance_paid: 0,
          total_billed_value: 0,
          total_po_basic: 0,
          total_gst: 0,
          total_bill_basic: 0,
          total_bill_gst: 0,
        },
      };

      filtered.credit = emptyCredit;
      filtered.debit = emptyDebit;
      filtered.adjustment = emptyAdjustment;
      filtered.clientHistory = emptyClient;
      filtered.salesHistory = emptySales;

      if (tab === "credit") filtered.credit = responseData.credit;
      else if (tab === "debit") filtered.debit = responseData.debit;
      else if (tab === "adjustment")
        filtered.adjustment = responseData.adjustment;
      else if (tab === "purchase")
        filtered.clientHistory = responseData.clientHistory;
      else if (tab === "sales")
        filtered.salesHistory = responseData.salesHistory;

      return res.status(200).json(filtered);
    }

    // ---------- CSV export ----------
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

      const creditRows = creditHistory || [];
      if (creditRows.length) {
        pushSection(
          "Credit History",
          ["S.No.", "Credit Date", "Credit Mode", "Credited Amount"],
          creditRows.map((r, i) => [
            i + 1,
            formatISO(r.cr_date || r.createdAt),
            r.cr_mode || "-",
            Math.round(r.cr_amount ?? 0),
          ]),
          parts
        );
      }

      const debitRows = debitHistory || [];
      if (debitRows.length) {
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
          debitRows.map((r, i) => [
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

      const adjRows = adjustmentHistory || [];
      if (adjRows.length) {
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
          adjRows.map((r, i) => [
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
            "PO Basic",
            "PO Gst",
            "Total PO Value",
            "Advance Paid",
            "Advance Remaining",
            "Bill Basic",
            "Bill GST",
            "Total Billed Value",
          ],
          clientRows.map((row, i) => [
            i + 1,
            row.po_number || "-",
            row.vendor || "-",
            row.item || "-",
            Math.round(row.po_basic ?? 0),
            Math.round(row.gst ?? 0),
            Math.round(row.po_value ?? 0),
            Math.round(row.advance_paid ?? 0),
            Math.round(row.remaining_amount ?? 0),
            Math.round(row.bill_basic ?? 0),
            Math.round(row.bill_gst ?? 0),
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
            "Conversion Date",
            "Item",
            "Invoice Number",
            "Bill Basic",
            "Sales Value",
            "Sales GST",
            "Total Sales GST",
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

            return [
              i + 1,
              row.po_number || "-",
              row.converted_at || "-",
              itemLabel,
              row.sales_invoice || "-",
              Math.round(row.bill_basic ?? 0),
              Math.round(row.basic_sales ?? 0),
              Math.round(row.gst_on_sales ?? 0),
              Math.round(row.total_sales_value ?? 0),
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
        ["4", "Total Advances Paid to Vendors", INR(total_advance_paid)],
        ["", "Billing Details", ""],
        ["5", "Invoice issued to customer", INR(bs.total_sales_value)],
        [
          "6",
          "Bills received, yet to be invoiced to customer",
          INR(aggregate_billed_value),
        ],
        [
          "7",
          "Advances left after bills received [4-5-6]",
          INR(remaining_advance_left_after_billed),
        ],
        ["8", "Adjustment (Debit-Credit)", INR(bs.total_adjustment)],
        [
          "9",
          "Balance With Slnko [3 - 5 - 6 - 7 - 8]",
          INR(balance_with_slnko),
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

    // ---------- JSON response ----------
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const digitsByKey = Object.freeze({
  total_received: 2,
  total_return: 2,
  netBalance: 2,
  total_po_basic: 2,
  gst_as_po_basic: 2,
  total_po_with_gst: 2,
  total_billed_value: 2,
  total_advance_paid: 2,
  total_adjustment: 2,
  total_sales_value: 2,
});

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
      try {
        if (Array.isArray(address)) {
          const first = address.find(Boolean) ?? "";
          address = first;
        }

        if (address && typeof address === "object") {
          const line1    = cleanToken(address.address_line1 ?? address.line1 ?? address.address);
          const village  = cleanToken(address.village_name ?? address.village ?? address.villageName);
          const district = cleanToken(address.district_name ?? address.district ?? address.districtName);
          const city     = cleanToken(address.city ?? address.town ?? address.tehsil);
          const state    = cleanToken(address.state ?? address.state_name ?? address.stateName);
          const pincode  = cleanToken(address.pincode ?? address.pin ?? address.zip);

          const parts = [line1, village, district, city, state, pincode].filter((p) => !isNA(p));
          return parts.length ? parts.join(", ") : "-";
        }

        if (typeof address === "string" || typeof address === "number") {
          const s = cleanToken(address);
          return s && !isNA(s) ? s : "-";
        }

        return "-";
      } catch {
        return "-";
      }
    };

    const projectDetails = {
      name: project.name,
      p_group: project.p_group,
      project_kwp: project.project_kwp,
      customer: project.customer,
      code: project.code,
      billing_type: project.billing_type,
      billing_address: formatAddress(project.billing_address ?? ""),
      site_address: formatAddress(project.site_address ?? ""),
    };

    // ---------- Credit (no date filter) ----------
    const [creditData] = await CreditModel.aggregate([
      { $match: { p_id: projectId } },
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
    const [debitData] = await DebitModel.aggregate([
      { $match: { p_id: projectId } },
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
    const [adjustmentData] = await AdjustmentModel.aggregate([
      { $match: { p_id: projectId } },
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
            sales_Details: 1,
            total_sales_value: 1,
          },
        },
        { $addFields: { po_numberStr: { $toString: "$po_number" } } },

        // ---- last_sales_detail (keep your logic) ----
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
                    {
                      $and: [
                        { $isArray: "$$tail" },
                        { $gt: [{ $size: "$$tail" }, 0] },
                      ],
                    },
                    {
                      basic_sales: {
                        $toDouble: {
                          $ifNull: [
                            {
                              $arrayElemAt: [
                                {
                                  $map: {
                                    input: "$$tail",
                                    as: "t",
                                    in: "$$t.basic_sales",
                                  },
                                },
                                0,
                              ],
                            },
                            0,
                          ],
                        },
                      },
                      gst_on_sales: {
                        $toDouble: {
                          $ifNull: [
                            {
                              $arrayElemAt: [
                                {
                                  $map: {
                                    input: "$$tail",
                                    as: "t",
                                    in: "$$t.gst_on_sales",
                                  },
                                },
                                0,
                              ],
                            },
                            0,
                          ],
                        },
                      },
                      total_sales_value: {
                        $add: [
                          {
                            $toDouble: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    {
                                      $map: {
                                        input: "$$tail",
                                        as: "t",
                                        in: "$$t.basic_sales",
                                      },
                                    },
                                    0,
                                  ],
                                },
                                0,
                              ],
                            },
                          },
                          {
                            $toDouble: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    {
                                      $map: {
                                        input: "$$tail",
                                        as: "t",
                                        in: "$$t.gst_on_sales",
                                      },
                                    },
                                    0,
                                  ],
                                },
                                0,
                              ],
                            },
                          },
                        ],
                      },
                      remarks: {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: "$$tail",
                              as: "t",
                              in: "$$t.remarks",
                            },
                          },
                          0,
                        ],
                      },
                      converted_at: {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: "$$tail",
                              as: "t",
                              in: "$$t.converted_at",
                            },
                          },
                          0,
                        ],
                      },
                      user_id: {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: "$$tail",
                              as: "t",
                              in: "$$t.user_id",
                            },
                          },
                          0,
                        ],
                      },
                      sales_invoice: {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: "$$tail",
                              as: "t",
                              in: "$$t.sales_invoice",
                            },
                          },
                          0,
                        ],
                      },
                      attachments: {
                        $arrayElemAt: [
                          {
                            $map: {
                              input: "$$tail",
                              as: "t",
                              in: "$$t.attachments",
                            },
                          },
                          0,
                        ],
                      },
                    },
                    {
                      basic_sales: 0,
                      gst_on_sales: 0,
                      total_sales_value: 0,
                      remarks: null,
                      converted_at: null,
                      user_id: null,
                      sales_invoice: null,
                      attachments: [],
                    },
                  ],
                },
              },
            },
          },
        },

        // ---- Approved payments ----
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
                          { $eq: ["$approval_status.stage", "Initial Account"] },
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

        // ---- Bills → bill_basic & bill_gst (corrected) ----
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
              {
                $project: {
                  items: {
                    $cond: [
                      { $isArray: "$item" },
                      "$item",
                      {
                        $cond: [
                          { $eq: [{ $type: "$item" }, "object"] },
                          ["$item"],
                          [],
                        ],
                      },
                    ],
                  },
                },
              },
              { $unwind: { path: "$items", preserveNullAndEmptyArrays: false } },
              {
                $addFields: {
                  _qty: {
                    $toDouble: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: {
                              $toString: { $ifNull: ["$items.quantity", "0"] },
                            },
                            find: ",",
                            replacement: "",
                          },
                        },
                        find: " ",
                        replacement: "",
                      },
                    },
                  },
                  _rate: {
                    $toDouble: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: {
                              $toString: { $ifNull: ["$items.bill_value", "0"] },
                            },
                            find: ",",
                            replacement: "",
                          },
                        },
                        find: " ",
                        replacement: "",
                      },
                    },
                  },
                  _gstPct: {
                    $toDouble: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: {
                              $toString: { $ifNull: ["$items.gst_percent", "0"] },
                            },
                            find: "%",
                            replacement: "",
                          },
                        },
                        find: " ",
                        replacement: "",
                      },
                    },
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  bill_basic_sum: { $sum: { $multiply: ["$_qty", "$_rate"] } },
                  bill_gst_sum: {
                    $sum: {
                      $divide: [
                        { $multiply: [{ $multiply: ["$_qty", "$_rate"] }, "$_gstPct"] },
                        100,
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
              $round: [
                {
                  $ifNull: [{ $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] }, 0],
                },
                2,
              ],
            },
            bill_gst: {
              $round: [
                {
                  $ifNull: [{ $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] }, 0],
                },
                2,
              ],
            },
          },
        },

        // ---- Final computed fields for this PO ----
        {
          $addFields: {
            total_billed_value: { $add: ["$bill_basic", "$bill_gst"] },

            advance_paid: {
              $ifNull: [
                {
                  $cond: [
                    {
                      $gt: [{ $size: { $ifNull: ["$approved_payment", []] } }, 0],
                    },
                    { $arrayElemAt: ["$approved_payment.totalPaid", 0] },
                    0,
                  ],
                },
                0,
              ],
            },

            remaining_amount: {
              $subtract: [
                asDouble("$po_value"),
                {
                  $ifNull: [{ $arrayElemAt: ["$approved_payment.totalPaid", 0] }, 0],
                },
              ],
            },

            total_sales_value: {
              $toDouble: { $ifNull: ["$last_sales_detail.total_sales_value", 0] },
            },

            total_unbilled_sales: {
              $round: [
                {
                  $subtract: [
                    { $toDouble: { $ifNull: ["$last_sales_detail.total_sales_value", 0] } },
                    { $toDouble: { $ifNull: ["$total_billed_value", 0] } },
                  ],
                },
                2,
              ],
            },

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

            // Flatten attachments (keep your mapping)
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

        // Clean
        { $project: { bill_agg: 0, sales_Details: 0, approved_payment: 0 } },
      ],
      as: "purchase_orders",
    },
  },

  { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: false } },
  { $replaceRoot: { newRoot: "$purchase_orders" } },

  // ---- Vendor name on root doc ----
  {
    $lookup: {
      from: "vendors",
      localField: "vendor",
      foreignField: "_id",
      as: "_vendor",
    },
  },
  {
    $addFields: {
      vendor: { $ifNull: [{ $arrayElemAt: ["$_vendor.name", 0] }, "$vendor"] },
    },
  },
  { $project: { _vendor: 0 } },
]);


    // ---------- Sales (customer POs) ----------
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
                        {
                          $and: [
                            { $isArray: "$$tail" },
                            { $gt: [{ $size: "$$tail" }, 0] },
                          ],
                        },
                        {
                          basic_sales: {
                            $toDouble: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    {
                                      $map: {
                                        input: "$$tail",
                                        as: "t",
                                        in: "$$t.basic_sales",
                                      },
                                    },
                                    0,
                                  ],
                                },
                                0,
                              ],
                            },
                          },
                          gst_on_sales: {
                            $toDouble: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    {
                                      $map: {
                                        input: "$$tail",
                                        as: "t",
                                        in: "$$t.gst_on_sales",
                                      },
                                    },
                                    0,
                                  ],
                                },
                                0,
                              ],
                            },
                          },
                          total_sales_value: {
                            $add: [
                              {
                                $toDouble: {
                                  $ifNull: [
                                    {
                                      $arrayElemAt: [
                                        {
                                          $map: {
                                            input: "$$tail",
                                            as: "t",
                                            in: "$$t.basic_sales",
                                          },
                                        },
                                        0,
                                      ],
                                    },
                                    0,
                                  ],
                                },
                              },
                              {
                                $toDouble: {
                                  $ifNull: [
                                    {
                                      $arrayElemAt: [
                                        {
                                          $map: {
                                            input: "$$tail",
                                            as: "t",
                                            in: "$$t.gst_on_sales",
                                          },
                                        },
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
                        {
                          basic_sales: 0,
                          gst_on_sales: 0,
                          total_sales_value: 0,
                        },
                      ],
                    },
                  },
                },
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

      // Normalize "item" to array
      {
        $project: {
          items: {
            $cond: [
              { $isArray: "$item" }, "$item",
              {
                $cond: [
                  { $eq: [{ $type: "$item" }, "object"] },
                  ["$item"],
                  []
                ]
              }
            ]
          }
        }
      },

      // Calculate line_total = quantity * bill_value
      {
        $project: {
          lineTotals: {
            $map: {
              input: "$items",
              as: "it",
              in: {
                $multiply: [
                  {
                    $toDouble: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: { $toString: { $ifNull: ["$$it.quantity", "0"] } },
                            find: ",",
                            replacement: ""
                          }
                        },
                        find: " ",
                        replacement: ""
                      }
                    }
                  },
                  {
                    $toDouble: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: { $toString: { $ifNull: ["$$it.bill_value", "0"] } },
                            find: ",",
                            replacement: ""
                          }
                        },
                        find: " ",
                        replacement: ""
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      },

      // Sum all line totals for the PO
      {
        $project: {
          bill_basic_sum: { $sum: "$lineTotals" }
        }
      },
      {
        $group: {
          _id: null,
          bill_basic_sum: { $sum: "$bill_basic_sum" }
        }
      },
      { $project: { _id: 0, bill_basic_sum: 1 } }
    ],
    as: "bill_agg"
  }
},
{
  $addFields: {
    bill_basic: {
      $ifNull: [{ $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] }, 0]
    }
  }
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
          from: "vendors",
          localField: "vendor",
          foreignField: "_id",
          as: "_vendor",
        },
      },
      {
        $addFields: {
          vendor: {
            $ifNull: [{ $arrayElemAt: ["$_vendor.name", 0] }, "$vendor"],
          },
        },
      },
      { $project: { _vendor: 0 } },
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
basic_sales: asDouble("$last_sales_detail.basic_sales"),

gst_rate_percent: {
  $toDouble: {
    $replaceAll: {
      input: {
        $replaceAll: {
          input: { $toString: { $ifNull: ["$last_sales_detail.gst_on_sales", 0] } },
          find: "%", replacement: ""
        }
      },
      find: " ", replacement: ""
    }
  }
},

gst_on_sales: {
  $round: [
    {
      $divide: [
        {
          $multiply: [
            asDouble("$last_sales_detail.basic_sales"),
            {
              $toDouble: {
                $replaceAll: {
                  input: {
                    $replaceAll: {
                      input: { $toString: { $ifNull: ["$last_sales_detail.gst_on_sales", 0] } },
                      find: "%", replacement: ""
                    }
                  },
                  find: " ", replacement: ""
                }
              }
            }
          ]
        },
        100
      ]
    },
    2
  ]
},

total_sales_value: {
  $add: [
    asDouble("$last_sales_detail.basic_sales"),
    {
      $round: [
        {
          $divide: [
            {
              $multiply: [
                asDouble("$last_sales_detail.basic_sales"),
                {
                  $toDouble: {
                    $replaceAll: {
                      input: {
                        $replaceAll: {
                          input: { $toString: { $ifNull: ["$last_sales_detail.gst_on_sales", 0] } },
                          find: "%", replacement: ""
                        }
                      },
                      find: " ", replacement: ""
                    }
                  }
                }
              ]
            },
            100
          ]
        },
        2
      ]
    }
  ]
},

                remarks: "$last_sales_detail.remarks",
                converted_at: "$last_sales_detail.converted_at",
                user_id: "$last_sales_detail.user_id",
                user_name: 1,
                sales_invoice: "$last_sales_detail.sales_invoice",
                bill_basic: 1,
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
        $addFields: {
          po_numberStr: { $toString: "$purchase_orders.po_number" },
        },
      },
      {
        $lookup: {
          from: "payrequests",
          let: {
            po_numberStr: "$po_numberStr",
            projectId: "$p_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    // Ensure same project and PO number
                    { $eq: [{ $toString: "$po_number" }, "$$po_numberStr"] },
                    {
                      $eq: [
                        { $toString: "$p_id" },
                        { $toString: "$$projectId" },
                      ],
                    },
                    // Ensure valid approvals
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
          let: { poNum: "$po_numberStr" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
              },
            },
            { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                itemArray: { $cond: [{ $isArray: "$item" }, "$item", []] },
              },
            },
            {
              $addFields: {
                bill_basic: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
                    { $toDouble: { $ifNull: ["$item.bill_value", 0] } },
                    0,
                  ],
                },
                bill_gst: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
                    {
                      $multiply: [
                        { $toDouble: { $ifNull: ["$item.bill_value", 0] } },
                        {
                          $divide: [
                            {
                              $toDouble: { $ifNull: ["$item.gst_percent", 0] },
                            },
                            100,
                          ],
                        },
                      ],
                    },
                    0,
                  ],
                },
              },
            },
            {
              $addFields: {
                bill_basic: {
                  $cond: [
                    { $eq: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
                    { $toDouble: { $ifNull: ["$bill_value", 0] } },
                    "$bill_basic",
                  ],
                },
                bill_gst: {
                  $cond: [
                    { $eq: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
                    {
                      $multiply: [
                        { $toDouble: { $ifNull: ["$bill_value", 0] } },
                        {
                          $divide: [
                            { $toDouble: { $ifNull: ["$gst_percent", 0] } },
                            100,
                          ],
                        },
                      ],
                    },
                    "$bill_gst",
                  ],
                },
              },
            },
            {
              $group: {
                _id: "$po_number",
                total_billed_value: {
                  $sum: { $add: ["$bill_basic", "$bill_gst"] },
                },
              },
            },
          ],
          as: "billAgg",
        },
      },
      {
        $addFields: {
          "purchase_orders.total_billed_value": {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$billAgg", []] } }, 0] },
              {
                $toDouble: {
                  $ifNull: [
                    { $arrayElemAt: ["$billAgg.total_billed_value", 0] },
                    0,
                  ],
                },
              },
              0,
            ],
          },
          "purchase_orders.advance_paid": {
            $cond: [
              {
                $gt: [{ $size: { $ifNull: ["$po_advance_payments", []] } }, 0],
              },
              {
                $ifNull: [
                  { $arrayElemAt: ["$po_advance_payments.totalPaid", 0] },
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
        $addFields: {
          "purchase_orders.advance_paid": {
            $ifNull: [
              { $arrayElemAt: ["$po_advance_payments.totalPaid", 0] },
              0,
            ],
          },
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

          total_advance_paid: {
            $sum: asDouble("$purchase_orders.advance_paid"),
          },
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
          total_adjustment: {
            $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"],
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
          // total_advance_paid: 1,
          total_billed_value: 1,
          total_adjustment: 1,
          gst_as_po_basic: 1,
          total_po_with_gst: 1,
          // total_sales_value: 1,
        },
      },
    ]);

    // ---------- shape data for PDF (ALL NUMERIC, NO inr()) ----------
    const creditHistorys = creditHistory.map((r) => ({
      CreditDate: fmtDate(r.cr_date || r.createdAt),
      mode: r.cr_mode || "",
      amount: Number(r.cr_amount || 0),
    }));

    const DebitHistorys = debitHistory.map((r) => ({
      date: fmtDate(r.dbt_date || r.createdAt),
      po_number: r.po_number || "",
      paid_for: r.paid_for || "",
      paid_to: r.vendor || "",
      amount: Number(r.amount_paid || 0),
      utr: r.utr || "",
    }));

    const purchaseHistorys = clientHistoryResult.map((r) => ({
      po_number: r.po_number || "",
      vendor: r.vendor || "",
      item_name: Array.isArray(r.item)
        ? r.item[0]?.product_name || "-"
        : r.item || "-",
      po_basic: Number(r.po_basic || 0),
      gst: Number(r.gst || 0),
      po_value: Number(r.po_value || 0),
      advance_paid: Number(r.advance_paid || 0),
      advance_remaining: Number(r.remaining_amount || 0),
      billed_basic: Number(r.bill_basic || 0),
  billed_gst:   Number(r.bill_gst || 0),
  billed_total: Number(r.total_billed_value || 0),
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
      bill_basic: Number(r.bill_basic || 0),
      value: Number(r.basic_sales || 0),
      gst: Number(r.gst_on_sales || 0),
      total: Number(r.total_sales_value || 0),
    }));

    const AdjustmentHistorys = adjustmentHistory.map((r) => ({
      date: fmtDate(r.adj_date || r.createdAt),
      reason: r.pay_type || r.adj_type || "",
      po_number: r.po_number || "",
      paid_for: r.paid_for || "",
      description: r.description || r.comment || "",
      credit_adjust: r.adj_type === "Add" ? Number(r.adj_amount || 0) : 0,
      debit_adjust: r.adj_type === "Subtract" ? Number(r.adj_amount || 0) : 0,
    }));

    // ---------- Format balance summary ----------
    let balanceSummary = Object.entries(balance || {}).reduce((acc, [k, v]) => {
      acc[k] = typeof v === "number" ? roundMoney(v, digitsByKey[k] ?? 0) : v;
      return acc;
    }, {});

 
    const total_advance_paid = clientHistoryResult.reduce(
      (acc, po) => acc + Number(po.advance_paid || 0),
      0
    );
    const total_billed_value = clientHistoryResult.reduce(
      (acc, po) => acc + Number(po.total_billed_value || 0),
      0
    );
    const total_po_basic = clientHistoryResult.reduce(
      (acc, po) => acc + Number(po.po_basic || 0),
      0
    );
    const gst_as_po_basic = clientHistoryResult.reduce(
      (acc, po) => acc + Number(po.gst || 0),
      0
    );

    const total_sales_value = salesHistoryResult.reduce(
      (acc, po) => acc + Number(po.total_sales_value || 0),
      0
    );
    const total_po_with_gst = total_po_basic + gst_as_po_basic;

    // ---------- Inject computed values into balance summary ----------
    balanceSummary = {
      ...balanceSummary,
      total_advance_paid,
      total_billed_value,
      total_po_basic,
      total_sales_value,
      gst_as_po_basic,
      total_po_with_gst,
      netBalance:
        (balanceSummary.total_received || 0) -
        (balanceSummary.total_return || 0),
    };

    // ---------- PDF ----------
    const apiUrl = `${process.env.PDF_PORT}customer-summary/cu-summary`;
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
