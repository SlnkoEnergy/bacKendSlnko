const Project = require("../../Modells/projectModells");
const AddMoney = require("../../Modells/addMoneyModells");
const RecoveryPayRequest = require("../../Modells/recoveryPayrequestModells");
const AdjustmentRequest = require("../../Modells/adjustmentRequestModells");

const getProjectBalance = async (req, res) => {
  try {
    const { page = 1, limit = 196, search = "" } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { customer: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ],
    };

    const projects = await Project.find(query)
      .select("p_id code name customer project_kwp")
      .skip(skip)
      .limit(parseInt(limit));

    const results = await Promise.all(
      projects.map(async (project) => {
        const { p_id } = project;

        const creditAgg = await AddMoney.aggregate([
          { $match: { p_id } },
          { $group: { _id: null, total_credit_amount: { $sum: "$cr_amount" } } },
        ]);
        const total_credit_amount = creditAgg[0]?.total_credit_amount || 0;

        const debitAgg = await RecoveryPayRequest.aggregate([
          {
            $match: {
              p_id,
              utr: { $nin: [null, "", "NA", "0"] },
            },
          },
          {
            $group: {
              _id: null,
              total_debit_history: {
                $sum: {
                  $toDouble: {
                    $ifNull: ["$amount_paid", "0"],
                  },
                },
              },
            },
          },
        ]);
        const total_debit_history = debitAgg[0]?.total_debit_history || 0;

        const adjAgg = await AdjustmentRequest.aggregate([
          { $match: { p_id } },
          {
            $group: {
              _id: null,
              total_adjustment_amount: {
                $sum: {
                  $toDouble: {
                    $ifNull: ["$adj_amount", "0"],
                  },
                },
              },
            },
          },
        ]);
        const total_adjustment_amount = adjAgg[0]?.total_adjustment_amount || 0;

        const returnAgg = await RecoveryPayRequest.aggregate([
          {
            $match: {
              p_id,
              po_number: { $nin: [null, "", "NA", "0"] },
            },
          },
          {
            $group: {
              _id: null,
              total_po_amount: {
                $sum: {
                  $toDouble: {
                    $ifNull: ["$amount_paid", "0"],
                  },
                },
              },
            },
          },
        ]);
        const total_return = returnAgg[0]?.total_po_amount || 0;

        const available_amount_with_slnko = total_credit_amount - total_debit_history;
        const balance_with_slnko = total_credit_amount - (total_adjustment_amount + total_return);

        return {
          ...project._doc,
          total_credit_amount,
          total_debit_history,
          total_adjustment_amount,
          available_amount_with_slnko,
          balance_with_slnko,
        };
      })
    );

    const totalCount = await Project.countDocuments(query);

    res.json({
      data: results,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
    });
  } catch (error) {
    console.error("Error in getProjectBalance:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getProjectBalance,
};
