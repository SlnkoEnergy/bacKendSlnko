const purchaseOrderModells = require("../Modells/purchaseOrderModells");
const iteamModells = require("../Modells/iteamModells");
const recoveryPurchaseOrder = require("../Modells/recoveryPurchaseOrderModells");
const pohisttoryModells = require("../Modells/pohistoryModells");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");
const { default: mongoose } = require("mongoose");
const materialCategoryModells = require("../Modells/EngineeringModells/materials/materialCategoryModells");
const {
  getLowerPriorityStatus,
} = require("../utils/updatePurchaseRequestStatus");
const purchaseRequest = require("../Modells/PurchaseRequest/purchaseRequest");
const payRequestModells = require("../Modells/payRequestModells");
const vendorModells = require("../Modells/vendorModells");

//Add-Purchase-Order
const addPo = async function (req, res) {
  try {
    const {
      p_id,
      date,
      item,
      other,
      po_number,
      po_value,
      vendor,
      partial_billing,
      submitted_By,
      po_basic,
      gst,
      pr_id,
    } = req.body;

    let resolvedItem = item === "Other" ? other : item;
    const partialItem = await iteamModells.findOne({ item: resolvedItem });
    const partal_billing = partialItem ? partialItem.partial_billing : "";

    // Check if PO Number exists
    const existingPO = await purchaseOrderModells.findOne({ po_number });
    if (existingPO) {
      return res.status(400).send({ message: "PO Number already used!" });
    }

    // Add new Purchase Order
    const newPO = new purchaseOrderModells({
      p_id,
      po_number,
      date,
      item: resolvedItem,
      po_value,
      vendor,
      other,
      submitted_By,
      partial_billing,
      po_basic,
      gst,
      pr_id,
      etd: null,
      delivery_date: null,
      dispatch_date: null,
    });

    await newPO.save();

    res.status(200).send({
      message: "Purchase Order has been added successfully!",

      newPO,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "An error occurred while processing your request." });
  }
};

//Edit-Purchase-Order
const editPO = async function (req, res) {
  let id = req.params._id;
  let updateData = req.body;
  try {
    let update = await purchaseOrderModells.findByIdAndUpdate(id, updateData, {
      new: true,
    });

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
    };
    await pohisttoryModells.create(pohistory);

    res.status(200).json({
      msg: "Project updated successfully",
      data: update,
    });
  } catch (error) {
    res.status(400).json({ msg: "Server error", error: error.message });
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
    const { po_number } = req.query;

    if (!po_number) {
      return res.status(400).json({ msg: "po_number is required" });
    }

    const data = await purchaseOrderModells.find({ po_number }).lean();

    if (data.length === 0) {
      return res.status(404).json({ msg: "No purchase orders found" });
    }

    const updatedData = await Promise.all(
      data.map(async (po) => {
        if (mongoose.Types.ObjectId.isValid(po.item)) {
          const material = await materialCategoryModells
            .findById(po.item)
            .select("name")
            .lean();

          return {
            ...po,
            item: material?.name || null,
          };
        } else {
          return {
            ...po,
            item: po.item,
          };
        }
      })
    );

    res
      .status(200)
      .json({ msg: "Purchase Orders fetched successfully", data: updatedData });
  } catch (error) {
    console.error("Error in getPOByPONumber:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

// const getPOById = async (req, res) => {
//   try {
//     const { p_id, _id } = req.body;

//     const query = {};
//     if (_id) query._id = _id;
//     if (p_id) query.p_id = p_id;

//     const data = await purchaseOrderModells.findOne(query);

//     if (!data) {
//       return res.status(404).json({ msg: "Purchase Order not found" });
//     }

//     res.status(200).json({ msg: "Purchase Order found", data });
//   } catch (error) {
//     res.status(500).json({ msg: "Error retrieving PO", error: error.message });
//   }
// };

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

// const getPOHistoryById = async (req, res) => {
//   try {
//     const { po_number, _id } = req.query;

//     const query = {};
//     if (_id) query._id = _id;
//     if (po_number) query.po_number = po_number;

//     const data = await pohisttoryModells.findOne(query);

//     if (!data) {
//       return res.status(404).json({ msg: "Purchase Order not found" });
//     }

//     res.status(200).json({ msg: "Purchase Order found", data });
//   } catch (error) {
//     res.status(500).json({ msg: "Error retrieving PO", error: error.message });
//   }
// };

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
    const updatedData = await purchaseOrderModells.aggregate([
      {
        $lookup: {
          from: "materialcategorymodells",
          localField: "item",
          foreignField: "_id",
          as: "material",
        },
      },
      {
        $unwind: {
          path: "$material",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          item: {
            $ifNull: ["$material.name", "$item"],
          },
        },
      },
      {
        $project: {
          material: 0,
        },
      },
    ]);

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
        po_numbers: poList.map((po) => po.po_number),
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
          total_po_value: { $sum: { $toDouble: "$po_value" } },
        },
      },
    ]);

    const po_value = poAggregate.length > 0 ? poAggregate[0].total_po_value : 0;

 
    let itemName = "";
    if (Array.isArray(selectedPo.item)) {
      itemName = selectedPo.item.map((i) => i.product_name).join(", ");
    } else if (mongoose.Types.ObjectId.isValid(selectedPo.item)) {
      const itemDoc = await materialCategoryModells
        .findById(selectedPo.item)
        .lean();
      itemName = itemDoc?.name || "";
    } else if (typeof selectedPo.item === "string") {
      itemName = selectedPo.item;
    }

 
    let vendorDetails = {};
    if (selectedPo.vendor) {
      const matchedVendor = await vendorModells
        .findOne({
          name: selectedPo.vendor,
        })
        .lean();
      if (matchedVendor) {
        vendorDetails = {
          benificiary: matchedVendor.name,
          acc_number: matchedVendor.Account_No,
          ifsc: matchedVendor.IFSC_Code,
          branch: matchedVendor.Bank_Name,
        };
      }
    }


    const approvedPayments = await payRequestModells.aggregate([
      { $match: { po_number, approved: "Approved" } },
      {
        $group: {
          _id: "$po_number",
          totalAdvancePaid: { $sum: { $toDouble: "$amount_paid" } },
        },
      },
    ]);
    const totalAdvancePaid =
      approvedPayments.length > 0 ? approvedPayments[0].totalAdvancePaid : 0;

    const po_balance = po_value - totalAdvancePaid;

    return res.status(200).json({
      p_id:selectedPo.p_id,
      po_number: selectedPo.po_number,
      po_value,
      vendor: selectedPo.vendor,
      item: itemName,
      total_advance_paid: totalAdvancePaid,
      po_balance,
      ...vendorDetails,
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
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const search = req.query.search?.trim() || "";
    const status = req.query.status?.trim();
    const searchRegex = new RegExp(search, "i");
    const parseCustomDate = (dateStr) => {
      return dateStr ? new Date(Date.parse(dateStr)) : null;
    };
    const createdFrom = parseCustomDate(req.query.createdFrom);
    const createdTo = parseCustomDate(req.query.createdTo);
    const etdFrom = parseCustomDate(req.query.etdFrom);
    const etdTo = parseCustomDate(req.query.etdTo);
    const deliveryFrom = parseCustomDate(req.query.deliveryFrom);
    const deliveryTo = parseCustomDate(req.query.deliveryTo);
    const filter = req.query.filter?.trim();

    const matchStage = {
      ...(search && {
        $or: [
          { p_id: { $regex: searchRegex } },
          { po_number: { $regex: searchRegex } },
          { vendor: { $regex: searchRegex } },
          { item: { $regex: searchRegex } },
        ],
      }),
      ...(req.query.project_id && { p_id: req.query.project_id }),
      ...(req.query.pr_id && {
        pr_id: new mongoose.Types.ObjectId(req.query.pr_id),
      }),
      ...(req.query.item_id && {
        $or: [
          { item: new mongoose.Types.ObjectId(req.query.item_id) },
          { item: req.query.item_id },
        ],
      }),
      ...(createdFrom || createdTo
        ? {
            dateObj: {
              ...(createdFrom ? { $gte: new Date(createdFrom) } : {}),
              ...(createdTo ? { $lte: new Date(createdTo) } : {}),
            },
          }
        : {}),
      ...(etdFrom || etdTo
        ? {
            etd: {
              ...(etdFrom && { $gte: etdFrom }),
              ...(etdTo && { $lte: etdTo }),
            },
          }
        : {}),
      ...(deliveryFrom || deliveryTo
        ? {
            delivery_date: {
              ...(deliveryFrom && { $gte: deliveryFrom }),
              ...(deliveryTo && { $lte: deliveryTo }),
            },
          }
        : {}),
    };

    if (filter) {
      switch (filter) {
        case "ETD Pending":
          matchStage["current_status.status"] = "draft";
          matchStage["etd"] = null;
          break;
        case "ETD Done":
          matchStage["current_status.status"] = "draft";
          matchStage["etd"] = { $ne: null };
          break;
        case "Ready to Dispatch":
          matchStage["current_status.status"] = "ready_to_dispatch";
          matchStage["dispatch_date"] = { $ne: null };
          break;
        case "Out for Delivery":
          matchStage["current_status.status"] = "out_for_delivery";
          break;
        case "Delivered":
          matchStage["current_status.status"] = "delivered";
          break;
        default:
          break;
      }
    }

    const pipeline = [
      {
        $addFields: {
          dateObj: {
            $cond: [
              { $eq: [{ $type: "$date" }, "string"] },
              {
                $dateFromString: {
                  dateString: "$date",
                  format: "%Y-%m-%d",
                },
              },
              "$date",
            ],
          },
        },
      },
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $addFields: {
          po_number: { $toString: "$po_number" },
          po_value: { $toDouble: "$po_value" },
        },
      },

      {
        $lookup: {
          from: "payrequests",
          let: { poNumber: "$po_number" },
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
          ],
          as: "approvedPayments",
        },
      },
      {
        $lookup: {
          from: "biildetails",
          localField: "po_number",
          foreignField: "po_number",
          as: "billData",
        },
      },
      {
        $addFields: {
          amount_paid: {
            $sum: {
              $map: {
                input: "$approvedPayments",
                as: "pay",
                in: {
                  $convert: {
                    input: "$$pay.amount_paid",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          total_billed: {
            $sum: {
              $map: {
                input: "$billData",
                as: "b",
                in: {
                  $convert: {
                    input: "$$b.bill_value",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        },
      },

      {
        $addFields: {
          partial_billing: {
            $cond: {
              if: { $lt: ["$total_billed", "$po_value"] },
              then: "Bill Pending",
              else: "Fully Billed",
            },
          },
          billingTypes: {
            $cond: {
              if: { $gt: [{ $size: "$billData" }, 0] },
              then: {
                $let: {
                  vars: {
                    sorted: {
                      $slice: [
                        {
                          $filter: {
                            input: {
                              $sortArray: {
                                input: "$billData",
                                sortBy: { updatedAt: -1 },
                              },
                            },
                            as: "d",
                            cond: { $ne: ["$$d.type", null] },
                          },
                        },
                        1,
                      ],
                    },
                  },
                  in: { $arrayElemAt: ["$$sorted.type", 0] },
                },
              },
              else: "-",
            },
          },
        },
      },
      {
        $lookup: {
          from: "purchaserequests",
          localField: "pr_id",
          foreignField: "_id",
          as: "prRequest",
        },
      },
      {
        $addFields: {
          pr_no: {
            $arrayElemAt: ["$prRequest.pr_no", 0],
          },
        },
      },

      {
        $addFields: {
          itemObjectId: {
            $cond: [
              {
                $and: [
                  { $eq: [{ $strLenCP: "$item" }, 24] },
                  {
                    $regexMatch: {
                      input: "$item",
                      regex: "^[0-9a-fA-F]{24}$",
                      options: "i",
                    },
                  },
                ],
              },
              { $toObjectId: "$item" },
              null,
            ],
          },
        },
      },
      {
        $addFields: {
          po_number: { $toString: "$po_number" },
          po_value: { $toDouble: "$po_value" },
          po_basic: { $toDouble: "$po_basic" },
          gst: { $toDouble: "$gst" },
        },
      },

      {
        $lookup: {
          from: "materialcategories",
          let: { itemField: "$item", itemObjectId: "$itemObjectId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$_id", "$$itemObjectId"] },
                    { $eq: ["$name", "$$itemField"] },
                  ],
                },
              },
            },
          ],
          as: "itemData",
        },
      },
      ...(status ? [{ $match: { partial_billing: status } }] : []),
      {
        $project: {
          _id: 0,
          po_number: 1,
          p_id: 1,
          pr_no: 1,
          vendor: 1,
          item: {
            $cond: {
              if: { $gt: [{ $size: "$itemData" }, 0] },
              then: { $arrayElemAt: ["$itemData.name", 0] },
              else: "$item",
            },
          },
          date: 1,
          po_value: 1,
          po_basic: 1,
          gst: 1,
          amount_paid: 1,
          total_billed: 1,
          partial_billing: 1,
          etd: 1,
          delivery_date: 1,
          dispatch_date: 1,
          current_status: 1,
          status_history: 1,
          type: "$billingTypes",
        },
      },
    ];

    const countPipeline = [
      { $match: matchStage },
      {
        $addFields: {
          po_number: { $toString: "$po_number" },
          po_value: { $toDouble: "$po_value" },
        },
      },
      {
        $lookup: {
          from: "biildetails",
          localField: "po_number",
          foreignField: "po_number",
          as: "billData",
        },
      },
      {
        $addFields: {
          total_billed: {
            $sum: {
              $map: {
                input: "$billData",
                as: "b",
                in: {
                  $convert: {
                    input: "$$b.bill_value",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          partial_billing: {
            $cond: {
              if: { $lt: ["$total_billed", "$po_value"] },
              then: "Bill Pending",
              else: "Fully Billed",
            },
          },
        },
      },
      ...(status ? [{ $match: { partial_billing: status } }] : []),
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

    const data = result.map((item) => ({
      ...item,
      date: formatDate(item.date),
    }));

    res.status(200).json({
      msg: "All PO Detail With PO Number",
      meta: {
        total,
        page,
        pageSize,
        count: data.length,
      },
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Error retrieving bills with PO data",
      error: err.message,
    });
  }
};

const getExportPo = async (req, res) => {
  try {
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
        date: {
          $gte: fromDate,
          $lte: toDate,
        },
      };
    }

    const rawData = await purchaseOrderModells.find(matchStage).lean();

    const pipeline = [
      { $match: matchStage },

      {
        $addFields: {
          po_number: { $toString: "$po_number" },
          po_value: { $toDouble: "$po_value" },
        },
      },

      {
        $lookup: {
          from: "payrequests",
          let: { poNumber: "$po_number" },
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
          ],
          as: "approvedPayments",
        },
      },

      {
        $lookup: {
          from: "biildetails",
          localField: "po_number",
          foreignField: "po_number",
          as: "billData",
        },
      },

      {
        $addFields: {
          amount_paid: {
            $sum: {
              $map: {
                input: "$approvedPayments",
                as: "pay",
                in: {
                  $convert: {
                    input: "$$pay.amount_paid",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
          total_billed: {
            $sum: {
              $map: {
                input: "$billData",
                as: "b",
                in: {
                  $convert: {
                    input: "$$b.bill_value",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        },
      },

      {
        $addFields: {
          partial_billing: {
            $cond: {
              if: { $lt: ["$total_billed", "$po_value"] },
              then: "Bill Pending",
              else: "Fully Billed",
            },
          },
          billingTypes: {
            $cond: {
              if: { $gt: [{ $size: "$billData" }, 0] },
              then: {
                $let: {
                  vars: {
                    sorted: {
                      $slice: [
                        {
                          $filter: {
                            input: {
                              $sortArray: {
                                input: "$billData",
                                sortBy: { updatedAt: -1 },
                              },
                            },
                            as: "d",
                            cond: { $ne: ["$$d.type", null] },
                          },
                        },
                        1,
                      ],
                    },
                  },
                  in: { $arrayElemAt: ["$$sorted.type", 0] },
                },
              },
              else: "-",
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          po_number: 1,
          p_id: 1,
          vendor: 1,
          item: 1,
          date: 1,
          po_value: 1,
          amount_paid: 1,
          total_billed: 1,
          partial_billing: 1,
          type: "$billingTypes",
        },
      },
    ];

    const result = await purchaseOrderModells.aggregate(pipeline);

    // Format fields
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

    const formatted = result.map((item) => ({
      ...item,
      date: formatDate(item.date),
      po_value: Number(item.po_value)?.toLocaleString("en-IN"),
      amount_paid: Number(item.amount_paid)?.toLocaleString("en-IN"),
      total_billed: Number(item.total_billed)?.toLocaleString("en-IN"),
    }));

    const fields = [
      "p_id",
      "po_number",
      "vendor",
      "item",
      "date",
      "po_value",
      "amount_paid",
      "total_billed",
      "partial_billing",
      "type",
    ];
    const parser = new Parser({ fields, quote: '"' });
    const csv = parser.parse(formatted);

    res.header("Content-Type", "text/csv");
    res.attachment("PO_Export.csv");
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Export failed", error: err.message });
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

// //gtpo test
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
    const { status, remarks, id } = req.body;
    if (!id) return res.status(404).json({ message: "ID is required" });
    if (!status && !remarks)
      return res
        .status(404)
        .json({ message: "Status and remarks are required" });

    const purchaseOrder = await purchaseOrderModells.findOne({ po_number: id });
    if (!purchaseOrder)
      return res.status(404).json({ message: "Purchase Order not found" });

    purchaseOrder.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });

    if (status === "ready_to_dispatch") {
      purchaseOrder.dispatch_date = new Date();
    }

    await purchaseOrder.save();

    // 👇 Start Processing PR Item Statuses
    const pr = await purchaseRequest.findById(purchaseOrder.pr_id).lean();
    if (!pr)
      return res
        .status(404)
        .json({ message: "Related Purchase Request not found" });

    const allPOs = await purchaseOrderModells.find({ pr_id: pr._id }).lean();

    const updatedItems = await Promise.all(
      pr.items.map(async (item) => {
        const itemIdStr = String(item.item_id);

        // Get all POs that have this item (by id or name)
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

//get All PO With

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
};
