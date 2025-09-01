const projetcModells = require("../Modells/project.model");
const purchaseorderModells = require("../Modells/purchaseorder.model");
const billModells = require("../Modells/bill.model");
const debitmoneyModells = require("../Modells/debitMoneyModells");
const payrequestModells = require("../Modells/payRequestModells");
const addMoneyModells = require("../Modells/addMoneyModells");


//total project credit amount for all project
const all_project_balance = async function (req, res) {
  try {
    let all_cr_balance = await addMoneyModells.aggregate([
      {
        $group: {
          _id: null, // Group all documents together
          totalCredited: { $sum: "$cr_amount" }, // Sum up cr_amount for all documents
        },
      }, // Match documents with the provided p_id
    ]);
    res.status(200).json(all_cr_balance);
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};



//total project credit amount for single project
const project_credit_amount = async function (req, res) {
  const { p_id } = req.body;
  try {
    let all_cr_balance = await addMoneyModells.aggregate([
      { $match: { p_id } }, // Match documents with the provided p_id
      {
        $group: {
          _id: "$p_id",
          totalCredited: { $sum: "$cr_amount" }, // Sum up cr_amount for all documents
        },
      }, // Match documents with the provided p_id
    ]);
    res.status(200).json(all_cr_balance);
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};



//total project debit amount for single project
const project_debit_amount = async function (req, res) {
  const { p_id } = req.body;
  try {
    let all_db_balance = await debitmoneyModells.aggregate([
      { $match: { p_id } }, // Match documents with the provided p_id
      {
        $group: {
          _id: "$p_id",
          totalDebited: { $sum: "$amount_paid" }, // Sum up cr_amount for all documents
        },
      }, // Match documents with the provided p_id
    ]);
    res.status(200).json(all_db_balance);
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};


// const group_blanace = async function (p_group) {
    
//     const projects = await projetcModells.find({ p_group: group });

//     // Fetch credits and debits in parallel for all projects
//     const creditsPromises = projects.map(project => project_credit_amount(project.p_id));
//     const debitsPromises = projects.map(project => project_debit_amount(project.p_id));

//     // Wait for all promises to resolve
//     const totalCredits = await Promise.all(creditsPromises);
//     const totalDebits = await Promise.all(debitsPromises);

//     // Sum up the credits and debits
//     const totalCredit = totalCredits.reduce((acc, credit) => acc + credit, 0);
//     const totalDebit = totalDebits.reduce((acc, debit) => acc + debit, 0);

//     // Return the balance
//     return totalCredit - totalDebit;
// };

// const groupbalance =  async function (req,res)  {
//     try {
//         const p_group = req.params.p_group;
//         const balance = await group_blanace(p_group);
//         res.json({ p_group, balance });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: 'Internal Server Error'+ error });
//     }
// };






//total project debit amount for all project
const all_project_debit = async function (req, res) {
  try {
    let all_db_balance = await debitmoneyModells.aggregate([
      {
        $group: {
          _id: null, // Group all documents together
          totalDebited: { $sum: "$amount_paid" }, // Sum up cr_amount for all documents
        },
      }, // Match documents with the provided p_id
    ]);
    res.status(200).json(all_db_balance);
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};


//total po balance for single project
const total_po_balance = async function (req, res) {
  const { p_id } = req.body;
  try {
    let all_po_value = await purchaseorderModells.aggregate([
      { $match: { p_id } }, // Match documents with the provided p_id
      {
        $group: {
          _id: "$p_id",
          totalPOValue: { $sum: "$po_value" },
          totalamountpaid: { $sum: "$amount_paid" }, // Sum up cr_amount for all documents
        },
      }, // Match documents with the provided p_id
    ]);
    res.status(200).json({ all_po_value });
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};


//total billed value for single project
const total_billed_value = async function (req, res) {
  try {
    const { po_number } = req.body;
    let all_billed_value = await billModells.aggregate([
      { $match: { po_number } },
      {
        $group: {
          _id: "$po_number",
          totalBilledValue: { $sum: "$bill_value" },
        },
      },
    ]);
    res.status(200).json({ all_billed_value });
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};


module.exports = {
  all_project_balance,
  all_project_debit,
  total_po_balance,
  total_billed_value,
  project_credit_amount,
  project_debit_amount,
//   group_blanace,
//   groupbalance
};
