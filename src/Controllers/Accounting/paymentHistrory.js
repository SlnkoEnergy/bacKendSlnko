const DebitModel = require("../../Modells/debitMoneyModells");
const { Parser } = require('json2csv');

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
                debit_date: {  $dateToString: {
                    format: "%d-%m-%Y",
                    date: "$dbt_date",
                  },},
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


// debit history to CSV format
const exportDebitHistoryCsv = async (req, res) => {
    try {
    const { p_id } = req.query;
    if (!p_id) {
      return res.status(400).json({ error: 'Project ID (p_id) is required.' });
    }
    const projectId = isNaN(p_id) ? p_id : Number(p_id);
    const match = { p_id: projectId };

    const [debitData] = await DebitModel.aggregate([
      {
        $addFields: { dbt_date: { $toDate: '$dbt_date' } },
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
                paid_to: '$vendor',
                debit_date: {
                  $dateToString: { format: '%d-%m-%Y', date: '$dbt_date' },
                },
                utr_submitted_date: {
                  $dateToString: { format: '%d-%m-%Y', date: '$updatedAt' },
                },
              },
            },
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalDebited: { $sum: '$amount_paid' },
              },
            },
          ],
        },
      },
    ]);

    const history = debitData?.history || [];
    const total = debitData?.summary?.[0]?.totalDebited || 0;

    // Add a total row as final line
    const totalRow = {
      debit_date: '',
      paid_to: 'TOTAL',
      amount_paid: total,
      paid_for: '',
      po_number: '',
      utr: '',
      utr_submitted_date: '',
      db_mode: '',
      db_date: '',
    };

    const rows = [...history, totalRow];

    const fields = [
      { label: 'Debit Date', value: 'debit_date' },
      { label: 'Paid To', value: 'paid_to' },
      { label: 'Amount Paid', value: 'amount_paid' },
      { label: 'Paid For', value: 'paid_for' },
      { label: 'PO Number', value: 'po_number' },
      { label: 'UTR', value: 'utr' },
      { label: 'UTR Submitted', value: 'utr_submitted_date' },
      { label: 'DB Mode', value: 'db_mode' },
      { label: 'DB Date', value: 'db_date' },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.header('Content-Type', 'text/csv');
    res.attachment(`debit-history-${projectId}.csv`);
    return res.send(csv);

  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};




module.exports = {
  paymentHistory,
  exportDebitHistoryCsv,
};
