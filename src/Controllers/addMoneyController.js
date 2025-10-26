const addMoneyModells = require("../models/addMoneyModells");
const projectModells = require("../models/project.model");
const projectBalanceModel = require("../models/projectBalance.model");

//Add Money
const addMoney = async (req, res) => {
  try {
    const { p_id, cr_amount, cr_mode, cr_date, comment } = req.body;


    const submitted_by = req.user.userId;

    const project = await projectModells.findOne({ p_id: Number(p_id) });
    if (!project) return res.status(404).json({ msg: "Project not found" });

    const admoney = await addMoneyModells.create({
      p_id,
      submitted_by,
      cr_amount,
      cr_mode,
      cr_date,
      comment,
    });

    const amount = Number(cr_amount) || 0;

    const updatedBalance = await projectBalanceModel.findOneAndUpdate(
      { p_id: project._id },
      [
        {
          $set: {
            totalCredited: {
              $add: [{ $ifNull: ["$totalCredited", 0] }, amount],
            },
            amountAvailable: {
              $subtract: [
                { $add: [{ $ifNull: ["$totalCredited", 0] }, amount] },
                { $ifNull: ["$totalDebited", 0] },
              ],
            },
          },
        },
      ],
      { new: true, upsert: true }
    );

    const creditEntry = {
      cr_date: new Date(),
      cr_amount: amount,
      added_by: submitted_by || null,
    };

    await projectBalanceModel.updateOne(
      { p_id: project._id },
      {
        $push: {
          recentCredits: {
            $each: [creditEntry],
            $position: 0,
            $slice: 3,
          },
        },
      },
      { upsert: true }
    );

    res
      .status(201)
      .json({ msg: "Money added", data: admoney, balance: updatedBalance });
  } catch (err) {
    console.error("addMoney error:", err);
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};


//get all bill

const allbill = async function (req, res) {
  // const page = parseInt(req.query.page) || 1;
  // const pageSize = 200;
  // const skip = (page - 1) * pageSize;
  let bill = await addMoneyModells.find();
  // .sort({ createdAt: -1 }) // Latest first
  // .skip(skip)
  // .limit(pageSize);;
  res.status(200).json({ msg: "all Bill Detail", bill });
};

//Delete -Crerdit Amount not IN USE

const deletecredit = async function (req, res) {
  const { _id } = req.params;

  try {
    // Use MongoDB's updateOne with $unset to remove fields
    const updatedDoc = await addMoneyModells.updateOne(
      { _id: _id }, // Find document by ID
      {
        $unset: {
          cr_date: "",
          cr_mode: "",
          cr_amount: "",
        },
      }
    );

    if (updatedDoc.nModified === 0) {
      return res
        .status(404)
        .json({ message: "Document not found or no changes made." });
    }

    return res
      .status(200)
      .json({ message: "Credit amount deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

//Delete -Crerdit Amount IN USE

const deleteCreditAmount = async function (req, res) {
  let _id = req.params._id;
  try {
    let credit = await addMoneyModells.findByIdAndDelete(_id);
    if (!credit) {
      return res.status(404).json({ message: "Credit Amount Not Found" });
    }

    res.status(200).json({ msg: "Credit Amount Deleted", credit: credit });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" + error });
  }
};

//  Credit Amount
const credit_amount = async function (req, res) {
  const { p_id } = req.body;

  try {
    if (!p_id) {
      return res.status(400).json({ message: "p_id is required" });
    }

    // Aggregate data to calculate total credited amount and fetch details
    const credits = await addMoneyModells.aggregate([
      { $match: { p_id } }, // Match documents with the provided p_id
      {
        $group: {
          _id: "$p_id",
          totalCredited: { $sum: "$cr_amount" }, // Sum up cr_amount
          creditDetails: {
            $push: {
              cr_date: "$cr_date",
              cr_mode: "$cr_mode",
              cr_amount: "$cr_amount",
            },
          },
        },
      },
    ]);

    // If no credits found, return a 404 response
    if (credits.length == 0) {
      return res
        .status(404)
        .json({ message: "No records found for the given p_id" });
    }

    // Prepare response
    const creditData = credits[0]; // There will be only one group since we match by p_id
    const formattedDetails = creditData.creditDetails.map((detail) => ({
      cr_date: new Date(detail.cr_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      cr_mode: detail.cr_mode,
      cr_amount: detail.cr_amount.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
      }),
    }));

    const totalCreditedFormatted = creditData.totalCredited.toLocaleString(
      "en-IN",
      { style: "currency", currency: "INR" }
    );

    res.json({
      p_id: creditData._id,
      totalCredited: totalCreditedFormatted,
      creditDetails: formattedDetails,
    });
  } catch (error) {
    console.error("Error fetching credit data:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};

module.exports = {
  addMoney,
  allbill,
  credit_amount,
  deletecredit,
  deleteCreditAmount,
};
