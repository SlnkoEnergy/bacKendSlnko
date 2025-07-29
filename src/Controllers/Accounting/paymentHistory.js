const DebitModel = require("../../Modells/debitMoneyModells");
const { Parser } = require("json2csv");

const paymentHistory = async (req, res) => {
  try {
    const { po_number } = req.query;

    if (!po_number) {
      return res.status(400).json({ error: "PO number is required." });
    }

    const [result] = await DebitModel.aggregate([
      {
        $match: { po_number },
      },
      {
        $addFields: {
          dbt_date: { $toDate: "$dbt_date" },
        },
      },
      {
        $lookup: {
          from: "purchaseorders", // Replace with your actual PO collection name
          localField: "po_number",
          foreignField: "po_number",
          as: "po_info",
        },
      },
      {
        $unwind: {
          path: "$po_info",
          preserveNullAndEmptyArrays: true,
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
                createdAt: 1,
                updatedAt: 1,
                paid_to: "$vendor",
                po_value: "$po_info.po_value",
                debit_date: {
                  $dateToString: {
                    format: "%d-%m-%Y",
                    date: "$dbt_date",
                  },
                },
                utr_submitted_date: {
                  $dateToString: {
                    format: "%d-%m-%Y",
                    date: "$updatedAt",
                  },
                },
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: "$po_number",
                totalDebited: { $sum: "$amount_paid" },
                po_value: { $first: "$po_info.po_value" },
              },
            },
          ],
        },
      },
    ]);

    const history = result?.history || [];
    const summary = result?.summary?.[0] || {};

    res.status(200).json({
      history,
      total_debited: summary.totalDebited || 0,
      po_value: summary.po_value || 0,
    });
  } catch (error) {
    console.error("paymentHistory error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


// debit history to CSV format
const exportDebitHistoryCsv = async (req, res) => {
  try {
    const { po_number } = req.query;

    if (!po_number) {
      return res.status(400).json({ error: "PO number is required." });
    }

    const match = { po_number };

    const [debitData] = await DebitModel.aggregate([
      {
        $addFields: { dbt_date: { $toDate: "$dbt_date" } },
      },
      { $match: match },
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
                debit_date: {
                  $dateToString: { format: "%d-%m-%Y", date: "$dbt_date" },
                },
                utr_submitted_date: {
                  $dateToString: { format: "%d-%m-%Y", date: "$updatedAt" },
                },
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

    const history = debitData?.history || [];
    const total = debitData?.summary?.[0]?.totalDebited || 0;

    const totalRow = {
      debit_date: "",
      paid_to: "TOTAL",
      amount_paid: total,
      paid_for: "",
      po_number: "",
      utr: "",
      utr_submitted_date: "",
      db_mode: "",
      db_date: "",
    };

    const rows = [...history, totalRow];

    const fields = [
      { label: "Debit Date", value: "debit_date" },
      { label: "Paid To", value: "paid_to" },
      { label: "Amount Paid", value: "amount_paid" },
      { label: "Paid For", value: "paid_for" },
      { label: "PO Number", value: "po_number" },
      { label: "UTR", value: "utr" },
      { label: "UTR Submitted", value: "utr_submitted_date" },
      { label: "DB Mode", value: "db_mode" },
      { label: "DB Date", value: "db_date" },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment(`debit-history-${po_number}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  paymentHistory,
  exportDebitHistoryCsv,
};
