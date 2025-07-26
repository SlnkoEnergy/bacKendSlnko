const addBillModells = require("../Modells/billDetailModells");
const projectModells = require("../Modells/projectModells");
const purchaseOrderModeslls = require("../Modells/purchaseOrderModells");
const moment = require("moment");
const mongoose = require("mongoose");
const { Parser } = require("json2csv");

//Add-Bill
const addBill = async function (req, res) {
  try {
    const {
      po_number,
      bill_number,
      bill_date,
      bill_value,
      bill_type,
      submitted_by,
      approved_by,
    } = req.body;

    // Step 1: Calculate total billed value for the given PO number
    // const bills = await addBillModells.find({ po_number });
    // const totalBilled = bills.reduce((sum, bill) => sum + bill.bill_value);

    // Step 2: Fetch the purchase order value
    const purchaseOrder = await purchaseOrderModeslls.findOne({ po_number });
    if (!purchaseOrder) {
      return res.status(404).json({ message: "Purchase Order not found." });
    }

    //  const { po_value, final } = purchaseOrder;

    // Step 3: Check if total billed value exceeds PO value
    // if (po_value < totalBilled + bill_value) {
    //   return res.status(400).json({
    //     message:
    //       "Total billed amount exceeds the PO value. Please review the billing details.",
    //   });
    // }

    // const biilnum= await addBillModells.findOne({ bill_number });
    // if (biilnum) {
    //   return res.status(400).send({ message: "Bill Number already used!" });
    // }

    // Step 4: Save the new bill
    const newBill = new addBillModells({
      po_number,
      bill_number,
      bill_date: moment(bill_date, "YYYY-MM-DD").toDate(),
      bill_value,
      type: bill_type,
      submitted_by,
      approved_by,
    });

    const savedBill = await newBill.save();

    // Step 5: If "Final" bill, update the purchase order status
    if (bill_type === "Final") {
      await purchaseOrderModeslls.updateOne(
        { po_number },
        { $set: { final: "disabled" } }
      );
    }

    res.status(201).json({
      message: "Bill added successfully!",
      data: savedBill,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "An error occurred while adding the bill.",
      error: error.message,
    });
  }
};

const getBill = async (req, res) => {
  try {
    const data = await addBillModells.find();
    res.status(200).json({ msg: "All Bill Details", data });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Failed to fetch bill details", error: error.message });
  }
};

const getPaginatedBill = async (req, res) => {
  try {
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

    const [result] = await addBillModells.aggregate(pipeline);
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
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Error retrieving bills with PO data",
      error: err.message,
    });
  }
};

//Bills Exports

const exportBills = async (req, res) => {
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

    const bills = await addBillModells.aggregate(pipeline);

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
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Failed to export bills",
      error: err.message,
    });
  }
};

const GetBillByID = async (req, res) => {
  try {
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

      {
        $addFields: {
          itemId: {
            $cond: [{ $eq: [{ $type: "$item" }, "objectId"] }, "$item", null],
          },
        },
      },
      {
        $lookup: {
          from: "materialcategories",
          localField: "itemId",
          foreignField: "_id",
          as: "itemDoc",
        },
      },
      { $unwind: { path: "$itemDoc", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          itemName: { $ifNull: ["$itemDoc.name", "$item"] },
        },
      },

      {
        $addFields: {
          poItemId: {
            $cond: [
              { $eq: [{ $type: "$poData.item" }, "objectId"] },
              "$poData.item",
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: "materialcategories",
          localField: "poItemId",
          foreignField: "_id",
          as: "poItemDoc",
        },
      },
      { $unwind: { path: "$poItemDoc", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          "poData.item": {
            $ifNull: ["$poItemDoc.name", "$poData.item"],
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
          submitted_by: 1,
          type: 1,
          item: "$itemName",
          poData: {
            p_id: "$poData.p_id",
            date: "$poData.date",
            po_value: "$poData.po_value",
            vendor: "$poData.vendor",
            item: "$poData.item",
          },
        },
      },
    ];

    const data = await addBillModells.aggregate(pipeline);
    res.status(200).json({ data, msg: "Bill details fetched successfully" });
  } catch (error) {
    res.status(500).json({
      msg: "Failed to fetch bills by PO",
      error: error.message,
    });
  }
};

//update-bill
const updatebill = async function (req, res) {
  try {
    let id = req.params._id;
    let updatedata = req.body;
    let data = await addBillModells.findByIdAndUpdate(id, updatedata, {
      new: true,
    });
    if (!data) {
      res.status(404).json({ msg: "User Not fornd" });
    }
    res.status(200).json({ msg: "Bill updated sucessfully", data });
  } catch (error) {
    res.status(400).json({
      message: "An error occurred while adding the bill.",
      error: error.message,
    });
  }
};

//delete-bill

const deleteBill = async function (req, res) {
  try {
    let id = req.params._id;
    let data = await addBillModells.findByIdAndDelete(id);
    if (!data) {
      res.status(404).json({ msg: "User Not fornd" });
    }
    res.status(200).json({ msg: "Bill deleted sucessfully", data });
  } catch (error) {
    res.status(400).json({
      message: "An error occurred while adding the bill.",
      error: error.message,
    });
  }
};

// bill_appoved
const bill_approved = async function (req, res) {
  const { bill_number, approved_by } = req.body;
  try {
    const existingBill = await addBillModells.findOne({
      bill_number: bill_number,
    });
    if (!existingBill) {
      return res.status(404).json({
        msg: "No bill found",
      });
    }

    if (existingBill.approved_by.trim() !== "") {
      return res.status(400).json({
        msg: "Bill is already approved and cannot be updated to an empty string.",
      });
    }

    const approvedby = await addBillModells.findOneAndUpdate(
      { bill_number }, // Matching criteria
      { $set: { approved_by } }, // Update action
      { new: true } // Return the updated document
    );

    res.status(200).json({
      msg: "Bill updated successfully.",
      data: approvedby,
    });
  } catch (error) {
    res.status(500).json({
      msg: "An error occurred while adding the bill.",
      error: error.message,
    });
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
};
