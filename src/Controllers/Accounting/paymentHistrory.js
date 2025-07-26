const DebitModel = require("../../Modells/debitMoneyModells");

const paymentHistory = async (req, res) => {
  try {
    const { p_id } = req.query;

    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required." });
    }

    const projectId = isNaN(p_id) ? p_id : Number(p_id);
    const match = { p_id: projectId };

    const [debitData] = await DebitModel.aggregate([
      {
        $addFields: {
          dbt_date: { $toDate: "$dbt_date" },
        },
      },
      {
        $match: match,
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
                utr_submitted_date: "$updatedAt", 
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
      total: debitData?.summary?.[0]?.totalDebited || 0,
    });
  } catch (error) {
    console.error("Debit summary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  paymentHistory,
};
