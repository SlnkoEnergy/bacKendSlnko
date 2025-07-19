
const projectModells = require("../../Modells/projectModells");

const projectBalance = async (req, res) => {
    try { 
        const aggregationPipeline = [
      {
        $lookup: {
          from: "addmoneys",
          localField: "p_id",
          foreignField: "p_id",
          as: "credits",
        },
      },
      {
        $lookup: {
          from: "subtract moneys",
          localField: "p_id",
          foreignField: "p_id",
          as: "debits",
        },
      },
      {
        $lookup: {
          from: "adjustmentrequests",
          localField: "p_id",
          foreignField: "p_id",
          as: "adjustments",
        },
      },
      {
        $lookup: {
          from: "purchaseorders",
          localField: "code",
          foreignField: "p_id",
          as: "pos",
        },
      },
      {
        $lookup: {
          from: "payrequests",
          localField: "pos.po_number",
          foreignField: "po_number",
          as: "pays",
        },
      },
      {
        $lookup: {
          from: "biildetails",
          localField: "pos.po_number",
          foreignField: "po_number",
          as: "bills",
        },
      },
      {
        $addFields: {
          totalCredit: {
            $sum: {
              $map: {
                input: "$credits",
                as: "c",
                in: { $toDouble: "$$c.cr_amount" },
              },
            },
          },
          totalDebit: {
            $sum: {
              $map: {
                input: "$debits",
                as: "d",
                in: { $toDouble: "$$d.amount_paid" },
              },
            },
          },
        creditAdjustment: {
  $sum: {
    $map: {
      input: {
        $filter: {
          input: "$adjustmentrequests",
          as: "adj",
          cond: { $eq: ["$$adj.adj_type", "Add"] }
        }
      },
      as: "a",
      in: { $abs: { $toDouble: "$$a.adj_amount" } }
    }
  }
},
debitAdjustment: {
  $sum: {
    $map: {
      input: {
        $filter: {
          input: "$djustmentrequests",
          as: "adj",
          cond: { $eq: ["$$adj.adj_type", "Subtract"] }
        }
      },
      as: "a",
      in: { $abs: { $toDouble: "$$a.adj_amount" } }
    }
  }
},
          totalPoValue: {
            $sum: {
              $map: {
                input: "$purchaseorders",
                as: "po",
                in: { $toDouble: "$$po.po_value" },
              },
            },
          },
          totalAmountPaid: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$payrequests",
                    as: "pay",
                    cond: {
                      $and: [
                        { $eq: ["$$pay.approved", "Approved"] },
                        { $ne: ["$$pay.utr", null] },
                      ],
                    },
                  },
                },
                as: "pay",
                in: { $toDouble: "$$pay.amount_paid" },
              },
            },
          },
          totalBillValue: {
            $sum: {
              $map: {
                input: "$biildetails",
                as: "bill",
                in: { $toDouble: "$$bill.bill_value" },
              },
            },
          },
        },
      },
      {
        $project: {
          p_id: 1,
          code: 1,
          name: 1,
          customer: 1,
          project_kwp: 1,
          totalCredit: 1,
          totalDebit: 1,
          creditAdjustment: 1,
          debitAdjustment: 1,
          totalPoValue: 1,
          totalAmountPaid: 1,
          totalBillValue: 1,
        },
      },
    ];

    const data = await projectModells.aggregate(aggregationPipeline);
    res.json({ success: true, data });
        
    } catch (error) {
    
        res.status(500).json({ message: "Internal Server Error" }); 
        
    }
}

module.exports = { projectBalance };