const CreditModel = require("../../Modells/addMoneyModells");
const DebitModel = require("../../Modells/debitMoneyModells");
const AdjustModel = require("../../Modells/adjustmentRequestModells");
const ClientModel = require("../../Modells/purchaseOrderModells");

const getCustomerPaymentSummary = async (req, res) => {
  try {
    const { p_id } = req.query;
    if (!p_id) {
      return res.status(400).json({ error: "Project ID (p_id) is required" });
    }

    const projectMatch = { p_id };

    // CREDIT HISTORY
    const creditHistory = await CreditModel.aggregate([
      { $match: projectMatch },
      {
        $project: {
          cr_date: "$cr_date",
          cr_mode: "$cr_mode",
          cr_amount:"$cr_amount",
        },
      },
    ]);

    const totalCredited = creditHistory.reduce((sum, row) => sum + row.cr_amount, 0);

    // DEBIT HISTORY
    const debitHistory = await DebitModel.aggregate([
      { $match: projectMatch },
      {
        $project: {
          dbt_date: "$dbt_date",
          pay_mode: "$pay_mode",
          paid_for: "$paid_for",
          vendor: "$vendor",
          amount_paid: "$amount_paid",
          utr: "$utr",
        },
      },
    ]);

    const totalDebited = debitHistory.reduce((sum, row) => sum + row.amount_paid, 0);

    // ADJUST HISTORY
    const adjustHistory = await AdjustModel.aggregate([
      { $match: projectMatch },
      {
        $project: {
          adj_date: "$adj_date",
          pay_type: "$pay_type",
          po_number: "$po_number",
          paid_for: "$paid_for",
          vendor: "$vendor",
          adj_type: "$adj_type",
          adj_amount: "$adj_amount",
        },
      },
    ]);

    const creditTotal = adjustHistory
      .filter(row => row.adj_type === "Add")
      .reduce((sum, row) => sum + parseFloat(row.adj_amount), 0);

    const debitTotal = adjustHistory
      .filter(row => row.adj_type === "Subtract")
      .reduce((sum, row) => sum + parseFloat(row.adj_amount), 0);

    const adjTotal = debitTotal - creditTotal;

    // CLIENT PO DATA
    const clientHistory = await ClientModel.aggregate([
      { $match: projectMatch },
      {
        $project: {
          po_number: "$po_number",
          vendor: "$vendor",
          item: "$item",
          po_value: "$po_value",
          totalAdvancePaid: 1,
          billedValue: 1,
          calculatedPoBasic: 1,
        },
      },
    ]);

    const totalPOValue = clientHistory.reduce((acc, row) => acc + row.po_value, 0);
    const totalAdvancePaid = clientHistory.reduce(
      (acc, row) => acc + (row.totalAdvancePaid || 0),
      0
    );
    const totalBilledValue = clientHistory.reduce((acc, row) => acc + (row.billedValue || 0), 0);
    const totalPoBasic = clientHistory.reduce(
      (acc, row) => acc + parseFloat(row.calculatedPoBasic || 0),
      0
    );

    const totalReturn = 0; // If you track return somewhere, fetch it here

    const netBalance = totalCredited - totalReturn;
    const tcs = netBalance > 5000000 ? Math.round(netBalance - 5000000) * 0.001 : 0;
    const netAdvance = totalAdvancePaid - totalBilledValue;
    const balancePayable = totalPOValue - totalBilledValue - netAdvance;
    const balanceSlnko = netBalance - totalAdvancePaid - adjTotal;
    const balanceRequired = balanceSlnko - balancePayable - tcs;

    res.json({
      creditHistory,
      debitHistory,
      adjustHistory,
      clientHistory,
      summary: {
        totalCredited,
        totalDebited,
        netBalance,
        totalAdvancePaid,
        adjTotal,
        balanceSlnko,
        totalPOValue,
        totalBilledValue,
        netAdvance,
        balancePayable,
        tcs,
        totalPoBasic,
        balanceRequired,
      },
    });
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getCustomerPaymentSummary };
