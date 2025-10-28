const CreditModel = require("../../models/addMoneyModells");
const DebitModel = require("../../models/debitMoneyModells");
const AdjustmentModel = require("../../models/adjustmentRequestModells");
const ClientModel = require("../../models/purchaseorder.model");
const ProjectModel = require("../../models/project.model");
const { Parser } = require("json2csv");
const { default: axios } = require("axios");
const { default: mongoose } = require("mongoose");

// ---- Helpers ----

const asDouble = (v) => ({ $toDouble: { $ifNull: [v, 0] } });

const safeNumber = (n) => (Number.isFinite(+n) ? +n : 0);

const fmtDate = (d) => {
  const dt = d ? new Date(d) : null;
  if (!dt || isNaN(dt)) return "-";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const inr = (n) => Number(n || 0);

const roundMoney = (v, digits = 0) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  const r = Math.round(n * p) / p;
  return Object.is(r, -0) ? 0 : r;
};
const digitsByKey = {};

// const formatAddress = (addr) =>
//   [addr?.line1, addr?.line2, addr?.district, addr?.state, addr?.pincode]
//     .filter(Boolean)
//     .join(", ");

// const paginate = (query, page = 1, pageSize = 50) =>
//   query.skip((page - 1) * pageSize).limit(pageSize);

// // ──────────────────────────────────────────────────────────────
// // Fetch project base info
// // ──────────────────────────────────────────────────────────────

// async function fetchProjectInfo(p_id, _id) {
//   const project = await ProjectModel.findOne(
//     _id ? { _id: new mongoose.Types.ObjectId(_id) } : { p_id: p_id }
//   ).lean();

//   if (!project)
//     throw new Error("Project not found — invalid p_id or _id in request");

//   project.billing_address_formatted = formatAddress(project.billing_address);
//   project.site_address_formatted = formatAddress(project.site_address);

//   return project;
// }


// async function getCreditData({ projectId, start, end, search, page, pageSize }) {
//   const match = { p_id: projectId };
//   if (start || end) {
//     match.createdAt = {};
//     if (start) match.createdAt.$gte = new Date(start);
//     if (end) match.createdAt.$lte = new Date(end);
//   }
//   if (search) match.remark = new RegExp(search, "i");

//   const [data, totalResult] = await Promise.all([
//     CreditModel.find(match)
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * pageSize)
//       .limit(pageSize)
//       .lean(),
//     CreditModel.aggregate([
//       { $match: match },
//       { $group: { _id: null, total: { $sum: asDouble("$cr_amount") } } },
//     ]),
//   ]);

//   const total = totalResult?.[0]?.total || 0;
//   return { history: data, total };
// }


// async function getDebitData({ projectId, start, end, search, page, pageSize }) {
//   const match = { p_id: projectId };
//   if (start || end) {
//     match.createdAt = {};
//     if (start) match.createdAt.$gte = new Date(start);
//     if (end) match.createdAt.$lte = new Date(end);
//   }
//   if (search) match.reason = new RegExp(search, "i");

//   const [data, totalResult] = await Promise.all([
//     DebitModel.find(match)
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * pageSize)
//       .limit(pageSize)
//       .lean(),
//     DebitModel.aggregate([
//       { $match: match },
//       { $group: { _id: null, total: { $sum: asDouble("$amount_paid") } } },
//     ]),
//   ]);

//   const total = totalResult?.[0]?.total || 0;
//   return { history: data, total };
// }


// async function getAdjustmentData({
//   projectId,
//   start,
//   end,
//   search,
//   page,
//   pageSize,
// }) {
//   const match = { p_id: projectId };
//   if (start || end) {
//     match.createdAt = {};
//     if (start) match.createdAt.$gte = new Date(start);
//     if (end) match.createdAt.$lte = new Date(end);
//   }
//   if (search) match.remarks = new RegExp(search, "i");

//   const [data, totalResult] = await Promise.all([
//     AdjustmentModel.find(match)
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * pageSize)
//       .limit(pageSize)
//       .lean(),
//     AdjustmentModel.aggregate([
//       { $match: match },
//       {
//         $group: {
//           _id: null,
//           totalCredit: {
//             $sum: {
//               $cond: [{ $eq: ["$adj_type", "Add"] }, asDouble("$adj_amount"), 0],
//             },
//           },
//           totalDebit: {
//             $sum: {
//               $cond: [
//                 { $eq: ["$adj_type", "Subtract"] },
//                 asDouble("$adj_amount"),
//                 0,
//               ],
//             },
//           },
//         },
//       },
//     ]),
//   ]);

//   const totalCredit = totalResult?.[0]?.totalCredit || 0;
//   const totalDebit = totalResult?.[0]?.totalDebit || 0;

//   return { history: data, totalCredit, totalDebit };
// }


// async function exportToCSV(res, data) {
//   const csvData = [];

//   const pushSection = (title, rows) => {
//     csvData.push({ Section: title });
//     rows.forEach((r) => csvData.push(r));
//     csvData.push({});
//   };

//   if (data.projectDetails) pushSection("Project Details", [data.projectDetails]);
//   if (data.credit) pushSection("Credit", data.credit.history || []);
//   if (data.debit) pushSection("Debit", data.debit.history || []);
//   if (data.clientHistory)
//     pushSection("Purchase", data.clientHistory.data || []);
//   if (data.salesHistory)
//     pushSection("Sales", data.salesHistory.data || []);
//   if (data.adjustment)
//     pushSection("Adjustment", data.adjustment.history || []);
//   if (data.summary)
//     pushSection("Balance Summary", [data.summary]);

//   const parser = new Parser();
//   const csv = parser.parse(csvData);
//   res.header("Content-Type", "text/csv");
//   res.attachment("customer_payment_summary.csv");
//   return res.send(csv);
// }

// async function getPurchaseData({
//   project,
//   projectOid,
//   page,
//   pageSize,
//   searchClient,
// }) {
//   const skip = (page - 1) * pageSize;
//   const searchRegex = searchClient ? new RegExp(searchClient, "i") : null;

//   // your entire clientHistoryResult aggregation (unchanged)
//   const clientHistoryResult = await ProjectModel.aggregate([
//     { $match: { _id: projectOid } },
//     { $project: { _id: 1, code: 1 } },
//     /* full long aggregation pipeline preserved exactly */
//     // ... [omitted here for brevity; keep your same logic as you pasted]
//   ]);

//   const clientMeta = (clientHistoryResult || [])
//     .filter((r) => r && r._id)
//     .reduce(
//       (acc, curr) => {
//         acc.total_advance_paid += Number(curr.advance_paid || 0);
//         acc.total_billed_value += Number(curr.total_billed_value || 0);
//         acc.total_po_value += Number(curr.po_value || 0);
//         acc.total_po_basic += Number(curr.po_basic || 0);
//         acc.total_bill_basic += Number(curr.bill_basic || 0);
//         acc.total_bill_gst += Number(curr.bill_gst || 0);
//         acc.total_unbilled_sales += Number(curr.total_unbilled_sales || 0);
//         acc.total_remaining_amount += Number(curr.remaining_amount || 0);
//         acc.total_sales_value += Number(curr.total_sales_value || 0);
//         acc.total_gst += Number(curr.gst || 0);
//         acc.total_remaining_sales_closure += Number(
//           curr.remaining_sales_closure || 0
//         );
//         return acc;
//       },
//       {
//         total_advance_paid: 0,
//         total_billed_value: 0,
//         total_po_value: 0,
//         total_po_basic: 0,
//         total_bill_basic: 0,
//         total_bill_gst: 0,
//         total_gst: 0,
//         total_unbilled_sales: 0,
//         total_remaining_amount: 0,
//         total_sales_value: 0,
//         total_remaining_sales_closure: 0,
//       }
//     );

//   return { data: clientHistoryResult, meta: clientMeta };
// }

// async function getSalesData({ projectOid, page, pageSize }) {
//   const skip = (page - 1) * pageSize;
//     const salesHistoryResult = await ProjectModel.aggregate([
//       { $match: { _id: projectOid } },
//       { $project: { _id: 1 } },
//       {
//         $lookup: {
//           from: "purchaseorders",
//           let: { projectId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $eq: ["$project_id", "$$projectId"] },
//                     { $in: ["$isSales", [true, "true", 1, "1"]] },
//                   ],
//                 },
//               },
//             },
//             { $sort: { createdAt: -1 } },
//             { $addFields: { po_numberStr: { $toString: "$po_number" } } },

//             // Sales meta
//             {
//               $addFields: {
//                 last_sales_detail: {
//                   $let: {
//                     vars: {
//                       tail: {
//                         $slice: [{ $ifNull: ["$sales_Details", []] }, -1],
//                       },
//                     },
//                     in: {
//                       $cond: [
//                         { $gt: [{ $size: "$$tail" }, 0] },
//                         { $arrayElemAt: ["$$tail", 0] },
//                         null,
//                       ],
//                     },
//                   },
//                 },
//               },
//             },

//             // BillDetails lookup
//             // --- BillDetails lookup (sum across all docs & items) ---
//            {
//   $lookup: {
//     from: "biildetails",
//     let: { poNum: "$po_numberStr" },
//     pipeline: [
//       {
//         $match: {
//           $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
//         },
//       },

//       // keep only `item` array (some documents might store as `item`)
//       { $project: { item: 1 } },

//       // unwind all items from the array
//       {
//         $unwind: {
//           path: "$item",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // clean and normalize numeric values
//       {
//         $addFields: {
//           bill_value_num: {
//             $toDouble: {
//               $replaceAll: {
//                 input: { $toString: { $ifNull: ["$item.bill_value", 0] } },
//                 find: ",",
//                 replacement: "",
//               },
//             },
//           },
//           gst_num: {
//             $toDouble: {
//               $replaceAll: {
//                 input: {
//                   $replaceAll: {
//                     input: { $toString: { $ifNull: ["$item.gst_percent", 0] } },
//                     find: "%",
//                     replacement: "",
//                   },
//                 },
//                 find: ",",
//                 replacement: "",
//               },
//             },
//           },
//         },
//       },

//       // sum totals per PO
//       {
//         $group: {
//           _id: null,
//           bill_basic_sum: { $sum: "$bill_value_num" },
//           bill_gst_sum: {
//             $sum: {
//               $multiply: [
//                 "$bill_value_num",
//                 { $divide: ["$gst_num", 100] },
//               ],
//             },
//           },
//         },
//       },
//       { $project: { _id: 0, bill_basic_sum: 1, bill_gst_sum: 1 } },
//     ],
//     as: "bill_agg",
//   },
// },

// {
//   $addFields: {
//     bill_basic: {
//       $cond: [
//         { $gt: [{ $size: "$bill_agg" }, 0] },
//         { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
//         asDouble("$po_basic"),
//       ],
//     },
//     bill_gst: {
//       $cond: [
//         { $gt: [{ $size: "$bill_agg" }, 0] },
//         { $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] },
//         asDouble("$gst"),
//       ],
//     },
//   },
// },


//             // Approved payments for advance
//             {
//               $lookup: {
//                 from: "payrequests",
//                 let: { poNum: "$po_numberStr" },
//                 pipeline: [
//                   {
//                     $match: {
//                       $expr: {
//                         $and: [
//                           { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
//                           { $eq: ["$approved", "Approved"] },
//                           {
//                             $or: [
//                               { $eq: ["$acc_match", "matched"] },
//                               {
//                                 $eq: [
//                                   "$approval_status.stage",
//                                   "Initial Account",
//                                 ],
//                               },
//                             ],
//                           },
//                           { $ne: ["$utr", ""] },
//                         ],
//                       },
//                     },
//                   },
//                   {
//                     $group: {
//                       _id: null,
//                       totalPaid: { $sum: asDouble("$amount_paid") },
//                     },
//                   },
//                 ],
//                 as: "approved_payment",
//               },
//             },

//             {
//               $project: {
//                 _id: 1,
//                 po_number: 1,
//                 vendor: 1,
//                 po_value: asDouble("$po_value"),
//                 po_basic: asDouble("$po_basic"),
//                 gst: asDouble("$gst"),
//                 createdAt: 1,
//                 advance_paid: {
//                   $cond: [
//                     {
//                       $gt: [
//                         { $size: { $ifNull: ["$approved_payment", []] } },
//                         0,
//                       ],
//                     },
//                     {
//                       $arrayElemAt: [
//                         { $ifNull: ["$approved_payment.totalPaid", [0]] },
//                         0,
//                       ],
//                     },
//                     0,
//                   ],
//                 },
//                 total_billed_value: asDouble("$total_billed"),
//                 remaining_amount: {
//                   $subtract: [
//                     asDouble("$po_value"),
//                     {
//                       $cond: [
//                         {
//                           $gt: [
//                             { $size: { $ifNull: ["$approved_payment", []] } },
//                             0,
//                           ],
//                         },
//                         {
//                           $arrayElemAt: [
//                             { $ifNull: ["$approved_payment.totalPaid", [0]] },
//                             0,
//                           ],
//                         },
//                         0,
//                       ],
//                     },
//                   ],
//                 },
//                 total_sales_value: asDouble("$total_sales_value"),
//                 basic_sales: asDouble("$last_sales_detail.basic_sales"),
//                 gst_on_sales: asDouble("$last_sales_detail.gst_on_sales"),

//                 remarks: "$last_sales_detail.remarks",
//                 converted_at: "$last_sales_detail.converted_at",
//                 user_id: "$last_sales_detail.user_id",
//                 sales_invoice: "$last_sales_detail.sales_invoice",
//                 bill_basic: 1,
//                 bill_gst: 1,
//               },
//             },
//           ],
//           as: "sales_orders",
//         },
//       },
//       { $unwind: { path: "$sales_orders", preserveNullAndEmptyArrays: false } },
//       { $replaceRoot: { newRoot: "$sales_orders" } },
//       { $skip: skip },
// { $limit: pageSize },
//     ]);

//     const salesMeta = salesHistoryResult.reduce(
//       (acc, row) => {
//         acc.total_advance_paid += Number(row.advance_paid || 0);
//         acc.total_sales_value += Number(row.total_sales_value || 0);
//         acc.total_basic_sales += Number(row.basic_sales || 0);
//         acc.total_gst_on_sales += Number(row.gst_on_sales || 0);

//         acc.total_billed_value += Number(row.total_billed_value || 0);
//         acc.total_po_basic += Number(row.po_basic || 0);
//         acc.total_gst += Number(row.gst || 0);
//         acc.total_bill_basic += Number(row.bill_basic || 0);
//         acc.total_bill_gst += Number(row.bill_gst || 0);
//         acc.count += 1;
//         return acc;
//       },
//       {
//         total_sales_value: 0,
//         total_basic_sales: 0,
//         total_gst_on_sales: 0,
//         total_advance_paid: 0,

//         total_billed_value: 0,
//         total_po_basic: 0,
//         total_gst: 0,
//         total_bill_basic: 0,
//         total_bill_gst: 0,
        
//       }
//     );

//   return { data: salesHistoryResult, meta: salesMeta };
// }


// async function getBalanceSummary({ projectId, clientMeta }) {
//     const [balanceSummary = {}] = await ProjectModel.aggregate([
//       { $match: { p_id: projectId } },

//       // CREDIT
//       {
//         $lookup: {
//           from: "addmoneys",
//           let: { projectId: "$p_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }],
//                 },
//               },
//             },
//             {
//               $group: {
//                 _id: null,
//                 totalCredit: { $sum: asDouble("$cr_amount") },
//               },
//             },
//           ],
//           as: "creditData",
//         },
//       },

//       // RETURN (Customer Adjustment)
//       {
//         $lookup: {
//           from: "subtract moneys",
//           let: { projectId: "$p_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     {
//                       $eq: [
//                         { $toString: "$p_id" },
//                         { $toString: "$$projectId" },
//                       ],
//                     },
//                     { $eq: ["$paid_for", "Customer Adjustment"] },
//                   ],
//                 },
//               },
//             },
//             {
//               $group: {
//                 _id: null,
//                 total_return: { $sum: asDouble("$amount_paid") },
//               },
//             },
//           ],
//           as: "returnData",
//         },
//       },

//       // ALL POs + BillDetails + Approved advances
//       {
//         $lookup: {
//           from: "purchaseorders",
//           let: { projectId: "$_id" },
//           pipeline: [
//             { $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } },
//             {
//               $addFields: {
//                 po_numberStr: { $toString: "$po_number" },
//                 lastSales: {
//                   $arrayElemAt: [{ $ifNull: ["$sales_Details", []] }, -1],
//                 },
//               },
//             },

//             // --- Approved advances ---
//             {
//               $lookup: {
//                 from: "payrequests",
//                 let: { poNum: "$po_numberStr" },
//                 pipeline: [
//                   {
//                     $match: {
//                       $expr: {
//                         $and: [
//                           { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
//                           { $eq: ["$approved", "Approved"] },
//                           {
//                             $or: [
//                               { $eq: ["$acc_match", "matched"] },
//                               {
//                                 $eq: [
//                                   "$approval_status.stage",
//                                   "Initial Account",
//                                 ],
//                               },
//                             ],
//                           },
//                           { $ne: ["$utr", ""] },
//                         ],
//                       },
//                     },
//                   },
//                   {
//                     $group: {
//                       _id: null,
//                       totalPaid: { $sum: asDouble("$amount_paid") },
//                     },
//                   },
//                 ],
//                 as: "approved_payment",
//               },
//             },
// {
//   $lookup: {
//     from: "biildetails",  // Correct collection name (biildetails)
//     let: { poNum: "$po_numberStr" },
//     pipeline: [
//       {
//         $match: {
//           $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] },
//         },
//       },
//       { 
//         $unwind: { 
//           path: "$item", 
//           preserveNullAndEmptyArrays: true 
//         } 
//       },

//       // Ensure item is treated as an array
//       {
//         $addFields: {
//           itemArray: { 
//             $cond: [
//               { $isArray: "$item" }, // Check if item is an array
//               "$item",  // If yes, keep it as is
//               []        // If no, make it an empty array
//             ]
//           }
//         }
//       },

//       // Normalize bill_value and gst_percent
//       {
//         $addFields: {
//           bill_basic: {
//             $cond: [
//               { $gt: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
//               { $toDouble: { $ifNull: ["$item.bill_value", 0] } },  // Ensure bill_value is numeric
//               0
//             ]
//           },
//           bill_gst: {
//             $cond: [
//               { $gt: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
//               { 
//                 $multiply: [
//                   { $toDouble: { $ifNull: ["$item.bill_value", 0] } },  // Ensure bill_value is numeric
//                   { $divide: [{ $toDouble: { $ifNull: ["$item.gst_percent", 0] } }, 100] } // Convert gst_percent to numeric
//                 ]
//               },
//               0
//             ]
//           }
//         }
//       },

//       // If item array is empty, use direct bill_value
//       {
//         $addFields: {
//           bill_basic: {
//             $cond: [
//               { $eq: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
//               { $toDouble: "$bill_value" },
//               "$bill_basic"
//             ]
//           },
//           bill_gst: {
//             $cond: [
//               { $eq: [{ $size: { $ifNull: ["$itemArray", []] } }, 0] },
//               { 
//                 $multiply: [
//                   { $toDouble: "$bill_value" },  // Ensure bill_value is numeric
//                   { $divide: [{ $toDouble: "$gst_percent" }, 100] } // Convert gst_percent to numeric
//                 ]
//               },
//               "$bill_gst"
//             ]
//           }
//         }
//       },

//       // Group by PO number and sum bill_basic + bill_gst
//       {
//         $group: {
//           _id: "$po_number",
//           total_billed_value: {
//             $sum: { $add: ["$bill_basic", "$bill_gst"] }
//           }
//         }
//       }
//     ],
//     as: "billAgg",
//   }
// },

// {
//   $addFields: {
//     total_billed_value: {
//       $cond: [
//         { $gt: [{ $size: "$billAgg" }, 0] },
//         { 
//           $toDouble: { 
//             $ifNull: [{ $arrayElemAt: ["$billAgg.total_billed_value", 0] }, 0] 
//           }
//         },
//         0
//       ]
//     }
//   }
// },




//             // --- Per-PO numbers with safe fallbacks ---
//            {
//   $project: {
//     _id: 1,
//     isSales: 1,
//     po_value: asDouble("$po_value"),
//     po_basic: asDouble("$po_basic"),
//     gst: asDouble("$gst"),
//     total_billed_value:1,

//     bill_basic: {
//       $cond: [
//         { $gt: [{ $size: "$billAgg" }, 0] },
//         { $toDouble: { $ifNull: [{ $arrayElemAt: ["$billAgg.bill_basic_sum", 0] }, 0] } },
//         asDouble("$po_basic"),
//       ],
//     },
//     bill_gst: {
//       $cond: [
//         { $gt: [{ $size: "$billAgg" }, 0] },
//         { $toDouble: { $ifNull: [{ $arrayElemAt: ["$billAgg.bill_gst_sum", 0] }, 0] } },
//         asDouble("$gst"),
//       ],
//     },

//     basic_sales: asDouble("$lastSales.basic_sales"),

  
//    total_sales_value: {
//   $cond: [
//     { $in: ["$isSales", [true, "true", 1, "1"]] },
//     {
//       $toDouble: {
//         $ifNull: [
//           "$total_sales_value",                 // <-- primary (root field updated by updateSalesPO)
//           { $ifNull: [ { $toDouble: "$lastSales.total_sales_value" }, 0 ] } // fallback
//         ]
//       }
//     },
//     0
//   ]
// },


//     advance_paid: {
//       $cond: [
//         { $gt: [{ $size: { $ifNull: ["$approved_payment", []] } }, 0] },
//         { $toDouble: { $ifNull: [{ $arrayElemAt: ["$approved_payment.totalPaid", 0] }, 0] } },
//         0,
//       ],
//     },
//   },
// }

//           ],
//           as: "purchase_orders",
//         },
//       },

//       {
//         $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true },
//       },

//       {
//         $lookup: {
//           from: "adjustmentrequests",
//           let: { projectId: "$p_id" },
//           pipeline: [
//             { $match: { $expr: { $eq: ["$p_id", "$$projectId"] } } },
//             {
//               $project: {
//                 adj_amount: 1,
//                 adj_type: 1,
//                 credit_adj: {
//                   $cond: [
//                     { $eq: ["$adj_type", "Add"] },
//                     asDouble("$adj_amount"),
//                     0,
//                   ],
//                 },
//                 debit_adj: {
//                   $cond: [
//                     { $eq: ["$adj_type", "Subtract"] },
//                     asDouble("$adj_amount"),
//                     0,
//                   ],
//                 },
//               },
//             },
//             {
//               $group: {
//                 _id: null,
//                 totalCreditAdjustment: { $sum: "$credit_adj" },
//                 totalDebitAdjustment: { $sum: "$debit_adj" },
//               },
//             },
//           ],
//           as: "adjustmentData",
//         },
//       },



      

//       // GROUP project-wise
//       {
//         $group: {
//           _id: "$p_id",
//           billing_type: { $first: "$billing_type" },

//           totalCredit: {
//             $first: {
//               $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0],
//             },
//           },
//           total_return: {
//             $first: {
//               $ifNull: [{ $arrayElemAt: ["$returnData.total_return", 0] }, 0],
//             },
//           },

          

//           // Vendor-side totals
//           total_po_with_gst: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.po_value"),
//                 0,
//               ],
//             },
//           },
//           total_po_basic: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.po_basic"),
//                 0,
//               ],
//             },
//           },
//           gst_as_po_basic: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.gst"),
//                 0,
//               ],
//             },
//           },

//           // Sales-side totals (we keep po_value as “sales value” bucket)
//          total_sales_value: {
//   $sum: {
//     $cond: [
//       { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
//       { $toDouble: { $ifNull: ["$purchase_orders.total_sales_value", 0] } }, // <-- use per-PO computed field
//       0
//     ]
//   }
// },


//           // Bill totals
//           total_bill_basic_vendor: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.bill_basic"),
//                 0,
//               ],
//             },
//           },
//           total_bill_gst_vendor: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.bill_gst"),
//                 0,
//               ],
//             },
//           },
//           total_bill_basic_sales: {
//             $sum: {
//               $cond: [
//                 { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
//                 asDouble("$purchase_orders.bill_basic"),
//                 0,
//               ],
//             },
//           },
//           total_bill_gst_sales: {
//             $sum: {
//               $cond: [
//                 { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
//                 asDouble("$purchase_orders.bill_gst"),
//                 0,
//               ],
//             },
//           },

//           // vendor advances
//           total_advance_paid: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.advance_paid"),
//                 0,
//               ],
//             },
//           },
//                     totalCreditAdjustment: {
//             $first: {
//               $ifNull: [
//                 { $arrayElemAt: ["$adjustmentData.totalCreditAdjustment", 0] },
//                 0,
//               ],
//             },
//           },
//           totalDebitAdjustment: {
//             $first: {
//               $ifNull: [
//                 { $arrayElemAt: ["$adjustmentData.totalDebitAdjustment", 0] },
//                 0,
//               ],
//             },
//           },

//           // vendor billed value (if still needed)
//           total_billed_value: {
//             $sum: {
//               $cond: [
//                 {
//                   $in: [
//                     "$purchase_orders.isSales",
//                     [false, "false", 0, "0", null],
//                   ],
//                 },
//                 asDouble("$purchase_orders.total_billed"),
//                 0,
//               ],
//             },
//           },

//           // Σ over SALES POs: (po_value - basic_sales)
//           total_unbilled_sales: {
//             $sum: {
//               $cond: [
//                 { $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] },
//                 {
//                   $subtract: [
//                     asDouble("$purchase_orders.po_value"),
//                     asDouble("$purchase_orders.total_sales_value"),
//                   ],
//                 },
//                 0,
//               ],
//             },
//           },
//         },
//       },

//       // Derived
//       {
//         $addFields: {
//           total_bill_basic: {
//             $add: ["$total_bill_basic_vendor", "$total_bill_basic_sales"],
//           },
//           total_bill_gst: {
//             $add: ["$total_bill_gst_vendor", "$total_bill_gst_sales"],
//           },

//           netBalance: { $subtract: ["$totalCredit", "$total_return"] },
//                balance_with_slnko: {
//       $round: [
//         {
//           $subtract: [
//             {
//               $subtract: [
//                 {
//                   $subtract: [
//                     {
//                       $subtract: [
//                         { $ifNull: ["$netBalance", 0] },
//                         { $ifNull: ["$total_sales_value", 0] },
//                       ],
//                     },
//                     { $ifNull: ["$total_unbilled_sales", 0] },
//                   ],
//                 },
//                 { $ifNull: ["$advance_left_after_billed", 0] },
//               ],
//             },
//             { $ifNull: ["$total_adjustment", 0] },
//           ],
//         },
//         2,
//       ],
//     },

//           total_unbilled_sales: {
//       $subtract: ["$total_po_with_gst", "$total_sales_value"],
//     },
//         },
        
//       },
//        {
//         $addFields: {
//           extraGST: {
//             $round: [
//               {
//                 $cond: [
//                   { $gt: ["$total_po_basic", 0] },
//                   { $subtract: ["$total_po_with_gst", "$total_po_basic"] },
//                   0,
//                 ],
//               },
//             ],
//           },
//         },
//       },

//       {
//         $addFields: {
//           total_adjustment: {
//             $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"],
//           },
//         },
//       },
//       {
//         $addFields: {
//           gst_with_type_percentage: {
//             $switch: {
//               branches: [
//                 {
//                   case: { $eq: ["$billing_type", "Composite"] },
//                   then: { $round: [{ $multiply: ["$total_po_basic", 0.138] }] },
//                 },
//                 {
//                   case: { $eq: ["$billing_type", "Individual"] },
//                   then: { $round: [{ $multiply: ["$total_po_basic", 0.18] }] },
//                 },
//               ],
//               default: 0,
//             },
//           },
//         },
//       },
//       {
//         $addFields: {
//           gst_difference: {
//             $cond: [
//               { $gt: ["$gst_with_type_percentage", "$gst_as_po_basic"] },
//               { $subtract: ["$gst_with_type_percentage", "$gst_as_po_basic"] },
//               0,
//             ],
//           },
//         },
//       },
//       // Final projection
//       {
//         $project: {
//           _id: 0,
//           billing_type: 1,
//           total_received: "$totalCredit",
//           total_return: 1,
//           netBalance: 1,

//           total_po_basic: 1,
//           gst_as_po_basic: 1,
//           total_po_with_gst: 1,
// gst_as_po_basic: 1,
//           total_po_with_gst: 1,
//           gst_with_type_percentage: 1,
//           gst_difference: 1,
//           total_bill_basic_sales: 1,
//           total_bill_gst_sales: 1,
//           total_bill_basic: 1,
//           total_bill_gst: 1,
//               extraGST: 1,

// total_adjustment:1,
//           total_advance_paid: 1,
//           total_billed_value: 1,
//           total_sales_value: 1,

//           total_unbilled_sales: 1,
// //           balance_with_slnko: {
// //   $round: [
// //     {
// //       $subtract: [
// //         {
// //           $subtract: [
// //             {
// //               $subtract: [
// //                 { $ifNull: ["$netBalance", 0] },
// //                 { $ifNull: ["$total_sales_value", 0] }
// //               ]
// //             },
// //             { $ifNull: ["$total_unbilled_sales", 0] }
// //           ]
// //         },
// //         {
// //           $add: [
// //             { $ifNull: ["$advance_left_after_billed", 0] },
// //             { $ifNull: ["$total_adjustment", 0] }
// //           ]
// //         }
// //       ],
// //     },
// //     2
// //   ]
// // }

//           //       advance_left_after_billed: {
//           //   $round: [
//           //     {
//           //       $subtract: [
//           //         { $ifNull: ["$total_advance_paid", 0] },
//           //         {
//           //           $add: [
//           //             { $ifNull: ["$total_sales_value", 0] },
//           //             { $ifNull: ["$total_unbilled_sales", 0] },
//           //           ],
//           //         },
//           //       ],
//           //     },
//           //     2,
//           //   ],
//           // }, 
//         },
//       },
//     ]);

//   const remaining_advance_left_after_billed =
//     balanceSummary?.total_advance_paid > clientMeta?.total_billed_value
//       ? (balanceSummary?.total_advance_paid || 0) -
//         (balanceSummary?.total_sales_value || 0) -
//         (clientMeta?.total_billed_value || 0)
//       : 0;

//   const exact_remaining_pay_to_vendor =
//     clientMeta?.total_billed_value > balanceSummary?.total_advance_paid
//       ? (balanceSummary?.total_po_with_gst || 0) -
//         (clientMeta?.total_billed_value || 0)
//       : (balanceSummary?.total_po_with_gst || 0) -
//         (balanceSummary?.total_advance_paid || 0);

//   const balance_with_slnko =
//     (balanceSummary?.netBalance || 0) -
//     (balanceSummary?.total_sales_value || 0) -
//     (clientMeta?.total_billed_value || 0) -
//     (remaining_advance_left_after_billed || 0) -
//     (balanceSummary?.total_adjustment || 0);

//   const aggregate_billed_value = clientMeta?.total_billed_value;

//   return {
//     ...balanceSummary,
//     aggregate_billed_value,
//     remaining_advance_left_after_billed,
//     exact_remaining_pay_to_vendor,
//     balance_with_slnko,
//   };
// }


// async function getCustomerPaymentSummary(req, res) {
//   try {
//     const {
//       p_id,
//       _id,
//       tab = "",
//       start,
//       end,
//       searchClient,
//       searchDebit,
//       searchAdjustment,
//       export: exportMode,
//       page = 1,
//       pageSize = 50,
//     } = req.query;

//     if (!p_id && !_id)
//       return res.status(400).json({ message: "Missing p_id or _id" });

//     const project = await fetchProjectInfo(p_id, _id);
//     const projectId = project.p_id;
//     const projectOid = project._id;

//     let responseData = {
//       projectDetails: {
//         customer_name: project.customer,
//         p_group: project.p_group || "N/A",
//         project_kwp: project.project_kwp,
//         name: project.name,
//         code: project.code,
//         billing_type: project.billing_type,
//         billing_address: project.billing_address_formatted,
//         site_address: project.site_address_formatted,
//       },
//     };

//     const t = String(tab).toLowerCase();

//     if (t === "credit") {
//       const credit = await getCreditData({
//         projectId,
//         start,
//         end,
//         search: searchClient,
//         page: +page,
//         pageSize: +pageSize,
//       });
//       responseData.credit = credit;
//       return res.json(responseData);
//     }

//     if (t === "debit") {
//       const debit = await getDebitData({
//         projectId,
//         start,
//         end,
//         search: searchDebit,
//         page: +page,
//         pageSize: +pageSize,
//       });
//       responseData.debit = debit;
//       return res.json(responseData);
//     }

//     if (t === "adjustment") {
//       const adjustment = await getAdjustmentData({
//         projectId,
//         start,
//         end,
//         search: searchAdjustment,
//         page: +page,
//         pageSize: +pageSize,
//       });
//       responseData.adjustment = adjustment;
//       return res.json(responseData);
//     }

//     if (t === "purchase") {
//       const clientHistory = await getPurchaseData({
//         project,
//         projectOid,
//         page: +page,
//         pageSize: +pageSize,
//         searchClient,
//       });
//       responseData.clientHistory = clientHistory;
//       return res.json(responseData);
//     }

//     if (t === "sales") {
//       const salesHistory = await getSalesData({
//         projectOid,
//         page: +page,
//         pageSize: +pageSize,
//       });
//       responseData.salesHistory = salesHistory;
//       return res.json(responseData);
//     }

//     if (t === "balance") {
//       const clientHistory = await getPurchaseData({
//         project,
//         projectOid,
//         page: +page,
//         pageSize: +pageSize,
//         searchClient,
//       });
//       const balanceSummary = await getBalanceSummary({
//         projectId,
//         clientMeta: clientHistory.meta,
//       });
//       responseData.balanceSummary = balanceSummary;
//       return res.json(responseData);
//     }


//     const [credit, debit, adjustment, clientHistory, salesHistory] =
//       await Promise.all([
//         getCreditData({ projectId, page: 1, pageSize: 10000 }),
//         getDebitData({ projectId, page: 1, pageSize: 10000 }),
//         getAdjustmentData({ projectId, page: 1, pageSize: 10000 }),
//         getPurchaseData({ project, projectOid, page: 1, pageSize: 10000 }),
//         getSalesData({ projectOid, page: 1, pageSize: 10000 }),
//       ]);

//     const balanceSummary = await getBalanceSummary({
//       projectId,
//       clientMeta: clientHistory.meta,
//     });

//     responseData = {
//       ...responseData,
//       credit,
//       debit,
//       adjustment,
//       clientHistory,
//       salesHistory,
//       ...balanceSummary,
//     };

//     if (exportMode === "csv") return exportToCSV(res, responseData);
//     return res.json(responseData);
//   } catch (error) {
//     console.error("Error in getCustomerPaymentSummary:", error);
//     res.status(500).json({ message: "Internal server error", error: error.message });
//   }
// }


const getCustomerPaymentSummary = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
const pageSize = parseInt(req.query.pageSize, 10) || 50;
const skip = (page - 1) * pageSize;
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
             { $skip: skip },
  { $limit: pageSize },
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
const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  // 1) Cheap, index-friendly filters first
  { $match: baseMatch },

  // 2) Normalize searchable fields to strings
  {
    $addFields: {
      po_numberStr: { $toString: { $ifNull: ["$po_number", ""] } },
      vendorStr:    { $toString: { $ifNull: ["$vendor", ""] } },
      paid_forStr:  { $toString: { $ifNull: ["$paid_for", ""] } },
    }
  },

  // 3) Apply search after normalization
  ...(hasSearch ? [{
    $match: {
      $or: [
        // substring match for mixed-format POs like "ENERGY-PO/25-26/02142"
        { po_numberStr: { $regex: searchEsc, $options: "i" } },
        // fast exact numeric match if user typed only digits
        ...(isDigits ? [{ po_number: Number(searchDebit.trim()) }] : []),
        { vendorStr:   { $regex: searchEsc, $options: "i" } },
        { paid_forStr: { $regex: searchEsc, $options: "i" } },
      ]
    }
  }] : []),

  // 4) Results + totals in one go
  {
    $facet: {
      history: [
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: pageSize },
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
          }
        }
      ],
      summary: [
        { $group: { _id: null, totalDebited: { $sum: asDouble("$amount_paid") } } }
      ]
    }
  }
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
              { $skip: skip },
  { $limit: pageSize },
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
const searchRegex = searchClient ? new RegExp(escapeRegex(searchClient), "i") : null;

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

    // Early filtering inside purchaseorders pipeline
...(searchClient
  ? [
      {
        $match: {
          $or: [
            // numeric match if pure digits
            ...( /^\d+$/.test(searchClient)
              ? [{ po_number: Number(searchClient) }]
              : []),
            // substring match on po_numberStr (ENERGY-PO/25-26/02142 will match "02142")
            { po_numberStr: { $regex: escapeRegex(searchClient), $options: "i" } },
          ],
        },
      },
    ]
  : []),

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

  
  { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: false } },
  { $match: { "purchase_orders._id": { $exists: true } } },
  { $sort: { "purchase_orders.createdAt": -1 } },
  { $skip: skip },
{ $limit: pageSize },
 
  {
  $addFields: {
    item_name: {
      $let: {
        vars: {
          arr: {
            $cond: [
              { $eq: [ { $type: "$purchase_orders.item" }, "array" ] },
              "$purchase_orders.item",
              []
            ]
          },
          str: {
            $cond: [
              { $eq: [ { $type: "$purchase_orders.item" }, "string" ] },
              { $trim: { input: { $ifNull: [ "$purchase_orders.item", "" ] } } },
              ""
            ]
          }
        },
        in: {
          $cond: [
            { $gt: [ { $size: "$$arr" }, 0 ] },
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
                                            { $ifNull: ["$$it.name", ""] }
                                          ]
                                        }
                                      }
                                    },
                                    {
                                      $cond: [
                                        { $eq: ["$$t", "string"] },
                                        { $trim: { input: "$$it" } },
                                        ""
                                      ]
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        as: "n",
                        cond: { $ne: ["$$n", ""] }
                      }
                    },
                    [] // de-dupe
                  ]
                },
                initialValue: "",
                in: {
                  $cond: [
                    { $eq: ["$$value", ""] },
                    "$$this",
                    { $concat: ["$$value", ", ", "$$this"] }
                  ]
                }
              }
            },
            { $cond: [ { $ne: ["$$str", ""] }, "$$str", "-" ] }
          ]
        }
      }
    }
  }
},





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
    vendorName: { $ifNull: [{ $arrayElemAt: ["$_vendor.name", 0] }, ""] }
  },
},




...(searchRegex ? [{
  $match: {
    $or: [
      { vendorName: searchRegex },
      { "purchase_orders.po_numberStr": searchRegex },
      { code: searchRegex },
      { item_name: searchRegex }
    ]
  }
}] : []),




  // --- Final projection ---
  {
    $project: {
      _id: "$purchase_orders._id",
      project_code: "$code",
      // item_name: 1,
      po_number: "$purchase_orders.po_number",
      vendor: "$vendorName",
      po_value: "$purchase_orders.po_value",
      item_name: "$item_name",
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

            {
  $addFields: {
    item_name: {
      $let: {
        vars: {
          // Normalize "item" to an array of entries
          arr: {
            $switch: {
              branches: [
                { case: { $eq: [ { $type: "$item" }, "array" ] },  then: "$item" },
                { case: { $eq: [ { $type: "$item" }, "object" ] }, then: [ "$item" ] },
              ],
              default: []
            }
          },
          // If "item" is a plain string, keep it here
          str: {
            $cond: [
              { $eq: [ { $type: "$item" }, "string" ] },
              { $trim: { input: { $ifNull: [ "$item", "" ] } } },
              ""
            ]
          }
        },
        in: {
          $cond: [
            // Prefer normalized array path if we have entries
            { $gt: [ { $size: "$$arr" }, 0 ] },
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
                                    // array entry is an object → product_name → fallback name
                                    { $eq: ["$$t", "object"] },
                                    {
                                      $trim: {
                                        input: {
                                          $ifNull: [
                                            "$$it.product_name",
                                            { $ifNull: [ "$$it.name", "" ] }
                                          ]
                                        }
                                      }
                                    },
                                    // array entry is a string
                                    {
                                      $cond: [
                                        { $eq: ["$$t", "string"] },
                                        { $trim: { input: "$$it" } },
                                        ""
                                      ]
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        as: "n",
                        cond: { $ne: ["$$n", ""] }
                      }
                    },
                    [] // de-dupe
                  ]
                },
                initialValue: "",
                in: {
                  $cond: [
                    { $eq: ["$$value", ""] },
                    "$$this",
                    { $concat: ["$$value", ", ", "$$this"] }
                  ]
                }
              }
            },
            // Fall back to plain string if present, else "-"
            { $cond: [ { $ne: ["$$str", ""] }, "$$str", "-" ] }
          ]
        }
      }
    }
  }
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
                item_name:"$item_name",
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
      { $skip: skip },
{ $limit: pageSize },
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
          // total_advance_paid: 1,
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
  clientMeta?.total_advance_paid > clientMeta?.total_billed_value
    ? (clientMeta?.total_advance_paid || 0) -
      (balanceSummary?.total_sales_value || 0) -
      (clientMeta?.total_billed_value || 0)
    : 0;

const exact_remaining_pay_to_vendor =
  clientMeta?.total_billed_value > clientMeta?.total_advance_paid
    ? (balanceSummary?.total_po_with_gst || 0) - (clientMeta?.total_billed_value || 0)
    : (balanceSummary?.total_po_with_gst || 0) - (clientMeta?.total_advance_paid || 0);


    const balance_with_slnko =
  (balanceSummary?.netBalance || 0) -
  (balanceSummary?.total_sales_value || 0) -
  (clientMeta?.total_billed_value || 0) -
  (remaining_advance_left_after_billed || 0) -
  (balanceSummary?.total_adjustment || 0);
  const aggregate_billed_value = clientMeta?.total_billed_value;

  const total_advance_paid = clientMeta?.total_advance_paid


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
  total_advance_paid

    };

   
if (tab && exportToCSV !== "csv") {
  const filtered = { ...responseData };

  const emptyCredit = { history: [], total: 0 };
  const emptyDebit = { history: [], total: 0 };
  const emptyAdjustment = { history: [], totalCredit: 0, totalDebit: 0 };
  const emptyClient = { data: [], meta: {
    total_advance_paid: 0, total_billed_value: 0, total_po_value: 0,
    total_po_basic: 0, total_bill_basic: 0, total_bill_gst: 0, total_gst: 0,
    total_unbilled_sales: 0, total_remaining_amount: 0,
    total_sales_value: 0, total_remaining_sales_closure: 0,
  }};
  const emptySales = { data: [], meta: {
    total_sales_value: 0, total_basic_sales: 0, total_gst_on_sales: 0,
    total_advance_paid: 0, total_billed_value: 0, total_po_basic: 0,
    total_gst: 0, total_bill_basic: 0, total_bill_gst: 0,
  }};


  filtered.credit = emptyCredit;
  filtered.debit = emptyDebit;
  filtered.adjustment = emptyAdjustment;
  filtered.clientHistory = emptyClient;
  filtered.salesHistory = emptySales;

  if (tab === "credit") filtered.credit = responseData.credit;
  else if (tab === "debit") filtered.debit = responseData.debit;
  else if (tab === "adjustment") filtered.adjustment = responseData.adjustment;
  else if (tab === "purchase") filtered.clientHistory = responseData.clientHistory; // vendor POs
  else if (tab === "sales") filtered.salesHistory = responseData.salesHistory;

  filtered.page = page;
  filtered.pageSize = pageSize;

  return res.status(200).json(filtered);
}


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
            "PO Basic",
            "PO Gst",
            "Total PO Value",
            "Advance Paid",
            "Advance Remaining",
            "Bill Basic" ,
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
        [
          "5",
          "Invoice issued to customer",
          INR(bs.total_sales_value),
        ],
        ["6", "Bills received, yet to be invoiced to customer" ,INR(aggregate_billed_value)],
          [
          "7",
          "	Advances left after bills received [4-5-6]",
          INR(remaining_advance_left_after_billed),
        ],
        
        ["8", "Adjustment (Debit-Credit)", INR(bs.total_adjustment)],
        ["9", "Balance With Slnko [3 - 5 - 6 - 7 - 8]", INR(balance_with_slnko)],
      
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
    if (!p_id) return res.status(400).json({ message: "Project ID (p_id) is required." });

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
    if (!project) return res.status(404).json({ message: "Project not found." });

    const formatAddress = (address) => {
      if (address && typeof address === "object") {
        const village = (address.village_name || "").replace(/(^"|"$)/g, "").trim();
        const district = (address.district_name || "").replace(/(^"|"$)/g, "").trim();
        if ((!village || village.toUpperCase() === "NA") && (!district || district.toUpperCase() === "NA")) return "-";
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
    const [creditData] = await CreditModel.aggregate([
      { $match: { p_id: projectId } },
      {
        $facet: {
          history: [
            { $sort: { createdAt: -1 } },
            { $project: { _id: 1, cr_date: 1, cr_mode: 1, cr_amount: 1, createdAt: 1 } },
          ],
          summary: [{ $group: { _id: null, totalCredited: { $sum: asDouble("$cr_amount") } } }],
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
          summary: [{ $group: { _id: null, totalDebited: { $sum: asDouble("$amount_paid") } } }],
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
                  $sum: { $cond: [{ $eq: ["$adj_type", "Add"] }, "$adj_amount_numeric", 0] },
                },
                totalDebitAdjustment: {
                  $sum: { $cond: [{ $eq: ["$adj_type", "Subtract"] }, "$adj_amount_numeric", 0] },
                },
              },
            },
            { $project: { _id: 0, totalCreditAdjustment: 1, totalDebitAdjustment: 1 } },
          ],
        },
      },
    ]);
    const adjustmentHistory = adjustmentData?.history || [];

    // ---------- Purchases (vendor POs) ----------
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
                $expr: { $and: [{ $eq: ["$project_id", "$$projectId"] }, { $in: ["$isSales", [false, "false", 0, "0", null]] }] },
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
            {
              $addFields: {
                last_sales_detail: {
                  $let: {
                    vars: { tail: { $slice: [{ $ifNull: ["$sales_Details", []] }, -1] } },
                    in: {
                      $cond: [
                        { $and: [{ $isArray: "$$tail" }, { $gt: [{ $size: "$$tail" }, 0] }] },
                        {
                          basic_sales: {
                            $toDouble: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    { $map: { input: "$$tail", as: "t", in: "$$t.basic_sales" } },
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
                                    { $map: { input: "$$tail", as: "t", in: "$$t.gst_on_sales" } },
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
                                        { $map: { input: "$$tail", as: "t", in: "$$t.basic_sales" } },
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
                                        { $map: { input: "$$tail", as: "t", in: "$$t.gst_on_sales" } },
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
                        { basic_sales: 0, gst_on_sales: 0, total_sales_value: 0 },
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
                              { $eq: ["$approval_status.stage", "Initial Account"] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  { $group: { _id: null, totalPaid: { $sum: asDouble("$amount_paid") } } },
                ],
                as: "approved_payment",
              },
            },
            {
              $lookup: {
                from: "biildetails",
                let: { poNum: "$po_numberStr" },
                pipeline: [
                  { $match: { $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] } } },
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
                        $sum: { $multiply: ["$bill_value_num", { $divide: ["$gst_num", 100] }] },
                      },
                    },
                  },
                  { $project: { _id: 0, bill_basic_sum: 1, bill_gst_sum: 1 } },
                ],
                as: "bill_agg",
              },
            },
            // SAFE use of bill_agg
            {
              $addFields: {
                bill_basic: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$bill_agg", []] } }, 0] },
                    { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
                    0,
                  ],
                },
                bill_gst: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$bill_agg", []] } }, 0] },
                    { $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] },
                    0,
                  ],
                },
              },
            },
            {
              $addFields: {
                total_billed_value: { $add: [{ $toDouble: "$bill_basic" }, { $toDouble: "$bill_gst" }] },
                advance_paid: {
                  $ifNull: [
                    {
                      $cond: [
                        { $gt: [{ $size: { $ifNull: ["$approved_payment", []] } }, 0] },
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
                    { $ifNull: [{ $arrayElemAt: ["$approved_payment.totalPaid", 0] }, 0] },
                  ],
                },
                total_sales_value: { $toDouble: { $ifNull: ["$last_sales_detail.total_sales_value", 0] } },
                total_unbilled_sales: {
                  $round: [
                    {
                      $subtract: [
                        { $add: [{ $toDouble: { $ifNull: ["$bill_basic", 0] } }, { $toDouble: { $ifNull: ["$bill_gst", 0] } }] },
                        { $toDouble: { $ifNull: ["$last_sales_detail.total_sales_value", 0] } },
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
              },
            },
            { $project: { bill_agg: 0, sales_Details: 0 } },
          ],
          as: "purchase_orders",
        },
      },
      { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: false } },
      { $replaceRoot: { newRoot: "$purchase_orders" } },
      // vendor name on root doc
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
                $expr: { $and: [{ $eq: ["$project_id", "$$projectId"] }, { $in: ["$isSales", [true, "true", 1, "1"]] }] },
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
                        { $and: [{ $isArray: "$$tail" }, { $gt: [{ $size: "$$tail" }, 0] }] },
                        {
                          basic_sales: {
                            $toDouble: {
                              $ifNull: [
                                {
                                  $arrayElemAt: [
                                    { $map: { input: "$$tail", as: "t", in: "$$t.basic_sales" } },
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
                                    { $map: { input: "$$tail", as: "t", in: "$$t.gst_on_sales" } },
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
                                        { $map: { input: "$$tail", as: "t", in: "$$t.basic_sales" } },
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
                                        { $map: { input: "$$tail", as: "t", in: "$$t.gst_on_sales" } },
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
                        { basic_sales: 0, gst_on_sales: 0, total_sales_value: 0 },
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
                  { $match: { $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] } } },
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
                        $sum: { $multiply: ["$bill_value_num", { $divide: ["$gst_num", 100] }] },
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
                    { $gt: [{ $size: { $ifNull: ["$bill_agg", []] } }, 0] },
                    { $arrayElemAt: ["$bill_agg.bill_basic_sum", 0] },
                    asDouble("$po_basic"),
                  ],
                },
                bill_gst: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$bill_agg", []] } }, 0] },
                    { $arrayElemAt: ["$bill_agg.bill_gst_sum", 0] },
                    asDouble("$gst"),
                  ],
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
                              { $eq: ["$approval_status.stage", "Initial Account"] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  { $group: { _id: null, totalPaid: { $sum: asDouble("$amount_paid") } } },
                ],
                as: "approved_payment",
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
                advance_paid: { $ifNull: [{ $arrayElemAt: ["$approved_payment.totalPaid", 0] }, 0] },
                total_billed_value: { $add: [{ $toDouble: "$bill_basic" }, { $toDouble: "$bill_gst" }] },
                remaining_amount: {
                  $subtract: [asDouble("$po_value"), { $ifNull: [{ $arrayElemAt: ["$approved_payment.totalPaid", 0] }, 0] }],
                },
                total_sales_value: asDouble("$total_sales_value"),
                basic_sales: asDouble("$last_sales_detail.basic_sales"),
                gst_on_sales: asDouble("$last_sales_detail.gst_on_sales"),
                remarks: "$last_sales_detail.remarks",
                converted_at: "$last_sales_detail.converted_at",
                user_id: "$last_sales_detail.user_id",
                user_name: 1,
                sales_invoice: "$last_sales_detail.sales_invoice",
                bill_basic: 1,
                bill_gst: 1,
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
            { $match: { $expr: { $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }] } } },
            { $group: { _id: null, totalCredit: { $sum: asDouble("$cr_amount") } } },
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
            { $group: { _id: null, total_return: { $sum: asDouble("$amount_paid") } } },
          ],
          as: "returnData",
        },
      },
 
      {
        $lookup: {
          from: "purchaseorders",
          let: { projectId: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$project_id", "$$projectId"] } } }],
          as: "purchase_orders",
        },
      },
      { $unwind: { path: "$purchase_orders", preserveNullAndEmptyArrays: true } },
      { $addFields: { po_numberStr: { $toString: "$purchase_orders.po_number" } } },
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
              { $eq: [{ $toString: "$p_id" }, { $toString: "$$projectId" }] },
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
            { $match: { $expr: { $eq: [{ $toString: "$po_number" }, "$$poNum"] } } },
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
                        { $divide: [{ $toDouble: { $ifNull: ["$item.gst_percent", 0] } }, 100] },
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
                        { $divide: [{ $toDouble: { $ifNull: ["$gst_percent", 0] } }, 100] },
                      ],
                    },
                    "$bill_gst",
                  ],
                },
              },
            },
            { $group: { _id: "$po_number", total_billed_value: { $sum: { $add: ["$bill_basic", "$bill_gst"] } } } },
          ],
          as: "billAgg",
        },
      },
      {
        $addFields: {
          "purchase_orders.total_billed_value": {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$billAgg", []] } }, 0] },
              { $toDouble: { $ifNull: [{ $arrayElemAt: ["$billAgg.total_billed_value", 0] }, 0] } },
              0,
            ],
          },
          "purchase_orders.advance_paid": {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$po_advance_payments", []] } }, 0] },
              { $ifNull: [{ $arrayElemAt: ["$po_advance_payments.totalPaid", 0] }, 0] },
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
                credit_adj: { $cond: [{ $eq: ["$adj_type", "Add"] }, asDouble("$adj_amount"), 0] },
                debit_adj: { $cond: [{ $eq: ["$adj_type", "Subtract"] }, asDouble("$adj_amount"), 0] },
              },
            },
            { $group: { _id: null, totalCreditAdjustment: { $sum: "$credit_adj" }, totalDebitAdjustment: { $sum: "$debit_adj" } } },
          ],
          as: "adjustmentData",
        },
      },
      {
  $addFields: {
    "purchase_orders.advance_paid": {
      $ifNull: [{ $arrayElemAt: ["$po_advance_payments.totalPaid", 0] }, 0],
    },
  },
},
      {
        $group: {
          _id: "$p_id",
          billing_type: { $first: "$billing_type" },
          totalCredit: { $first: { $ifNull: [{ $arrayElemAt: ["$creditData.totalCredit", 0] }, 0] } },
          total_return: { $first: { $ifNull: [{ $arrayElemAt: ["$returnData.total_return", 0] }, 0] } },
        
    total_advance_paid: { $sum: asDouble("$purchase_orders.advance_paid") },
          total_billed_value: { $sum: "$purchase_orders.total_billed_value" },
          total_po_basic: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$purchase_orders.po_basic", null] }, { $ne: ["$purchase_orders.po_basic", ""] }] },
                asDouble("$purchase_orders.po_basic"),
                0,
              ],
            },
          },
          gst_as_po_basic: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$purchase_orders.gst", null] }, { $ne: ["$purchase_orders.gst", ""] }] },
                asDouble("$purchase_orders.gst"),
                0,
              ],
            },
          },
          total_sales_value: {
            $sum: {
             
              $cond: [{ $in: ["$purchase_orders.isSales", [true, "true", 1, "1"]] }, asDouble("$purchase_orders.total_sales_value"), 0],
            },
          },
          totalCreditAdjustment: {
            $first: { $ifNull: [{ $arrayElemAt: ["$adjustmentData.totalCreditAdjustment", 0] }, 0] },
          },
          totalDebitAdjustment: {
            $first: { $ifNull: [{ $arrayElemAt: ["$adjustmentData.totalDebitAdjustment", 0] }, 0] },
          },
        },
      },
      { $addFields: { total_po_with_gst: { $add: ["$total_po_basic", "$gst_as_po_basic"] } } },
      { $addFields: { total_adjustment: { $subtract: ["$totalCreditAdjustment", "$totalDebitAdjustment"] } } },

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
      item_name: Array.isArray(r.item) ? r.item[0]?.product_name || "-" : r.item || "-",
      po_basic: Number(r.po_basic || 0),
      gst: Number(r.gst || 0),
      po_value: Number(r.po_value || 0),
      advance_paid: Number(r.advance_paid || 0),
      advance_remaining: Number(r.remaining_amount || 0),
      bill_basic: Number(r.bill_basic || 0),
      bill_gst: Number(r.bill_gst || 0),
      total_billed_value: Number(r.total_billed_value || 0),
    }));

    const saleHistorys = salesHistoryResult.map((r) => ({
      po_number: r.po_number || "",
      converted_at: fmtDate(r.converted_at),
      vendor: r.vendor || "",
      item: Array.isArray(r.item)
        ? r.item.map((i) => i.product_name).filter(Boolean).join(", ") || "-"
        : (typeof r.item === "string" ? r.item : (r.item_name || "-")),
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

// ---------- Compute reliable totals from PO aggregation ----------
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

const total_sales_value = salesHistoryResult.reduce((acc, po) => acc + Number(po.total_sales_value || 0), 0);
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
    const apiUrl = `${process.env.PDF_PORT}/customer-summary/cu-summary`;
    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: { projectDetails, creditHistorys, DebitHistorys, purchaseHistorys, saleHistorys, AdjustmentHistorys, balanceSummary },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"] || "application/pdf",
      "Content-Disposition": axiosResponse.headers["content-disposition"] || `attachment; filename="Payment_History.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (err) {
    console.error("Error generating Customer Payment PDF:", err);
    res.status(500).json({ message: "Error Generating PDF", error: err.message });
  }
};


module.exports = {
  getCustomerPaymentSummary,
  postCustomerPaymentSummaryPdf,
};