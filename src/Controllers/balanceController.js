const projetcModells =require("../Modells/projectModells");
const purchaseorderModells =require("../Modells/purchaseOrderModells");
const billModells = require("../Modells/billDetailModells");
const debitmoneyModells = require("../Modells/debitMoneyModells");
const payrequestModells = require("../Modells/payRequestModells");
const addMoneyModells = require("../Modells/addMoneyModells");          


const all_project_balance = async function (req, res) {
  
    try {
        let  all_cr_balance= await addMoneyModells.aggregate([
            { $group: {
                _id: null, // Group all documents together
                totalCredited: { $sum: "$cr_amount" }, // Sum up cr_amount for all documents
              },
             }, // Match documents with the provided p_id
           
          ]);;
       res.status(200).json(all_cr_balance);


        
    } catch (error) {
       
        return res.status(400).json({ msg: "Server error", error: error.message });
      }
        
    };

const all_project_debit = async function (req, res) {
    try {
        let  all_db_balance= await debitmoneyModells.aggregate([
            { $group: {
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

    const total_po_balance = async function (req, res) {
        const { p_id } = req.body;
        try {
            let  all_po_value= await purchaseorderModells.aggregate([{$match: { p_id } }, // Match documents with the provided p_id
                { $group: {
                    _id: "$p_id",
                    totalPOValue: { $sum: "$po_value" },
                    totalamountpaid : {$sum:"$amount_paid"} // Sum up cr_amount for all documents
                  },
                 }, // Match documents with the provided p_id
               
              ]);;
           res.status(200).json(  {all_po_value});
            
        } catch (error) {
            return res.status(400).json({ msg: "Server error", error: error.message });
    }
    };



 const total_billed_value = async function (req, res) {
try {
    const { po_number } = req.body;  
    let  all_billed_value= await billModells.aggregate([{$match: { po_number} }, 
        { $group: {
            _id: "$po_number",
            totalBilledValue: { $sum: "$bill_value" }, 
          },
         },
       
      ]);
    res.status(200).json(  {all_billed_value});

} catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
    
}
};

// const total_project_billValue = async function (req, res) {
//     const { p_id } = req.body;
//     try {
//       const totalBilledValue = await projetcModells.aggregate([
//         // Match the specific project by its code
//         {
//           $match: { p_id },
//         },
//         // Lookup to join with the Purchase Order Model
//         {
//           $lookup: {
//             from: "purchaseOrderModells", // Correct Purchase Order collection name
//             localField: "code",           // `code` field in Project Model
//             foreignField: "p_id",         // `p_id` in Purchase Order Model
//             as: "purchaseOrders",         // Resulting array of matching purchase orders
//           },
//         },
//         // Unwind the purchase orders array
//         {
//           $unwind: {
//             path: "$purchaseOrders",
//             preserveNullAndEmptyArrays: true, // Keep projects without purchase orders for debugging
//           },
//         },
//         // Lookup to join with the Bill Detail Model
//         {
//           $lookup: {
//             from: "billModells",                // Correct Bill Detail collection name
//             localField: "po_number", // `po_number` in Purchase Order Model
//             foreignField: "po_number",             // `po_number` in Bill Detail Model
//             as: "billDetails",                     // Resulting array of matching bill details
//           },
//         },
//         // Unwind the bill details array
//         {
//           $unwind: {
//             path: "$billDetails",
//             preserveNullAndEmptyArrays: true, // Keep purchase orders without bill details for debugging
//           },
//         },
//         // Group to calculate the total billed value for the project
//         {
//           $group: {
//             _id: "$code", // Group by project code
//             totalBilledValue: { $sum: "$billDetails.bill_value" }, 
//             po_number:{po:"$purchaseOrders.po_number"},
//           },
//         },
//         // Project the final result
//         {
//           $project: {
//             _id: 0,
//             projectCode: "$_id",        // Project code
//             totalBilledValue: 1,        // Total billed value
//           },
//         },
//       ]);
  
//     //   // If no data is found, return an appropriate response
//     //   if (!totalBilledValue || totalBilledValue.length === 0) {
//     //     return res.status(404).json({ msg: "No billed values found for the project." });
//     //   }
  
//       // Return the result
//       res.status(200).json(totalBilledValue[0]); // Extract the first element from the array
//     } catch (error) {
//       // Handle server errors
//       return res.status(400).json({ msg: "Server error", error: error.message });
//     }
//   };

//   const total_project_billValue = async function (req, res) {
//     const { p_id} = req.body; // Expecting `codes` to be an array of project codes
//   try {
//     const purchaseOrders = await projetcModells.aggregate([
//       // Match projects whose codes are in the provided array
//       {
//         $match: { p_id  },
//       },
//       // Lookup to join with the Purchase Order Model
//       {
//         $lookup: {
//           from: "purchaseOrderModells", // Replace with your actual Purchase Order collection name
//           localField: "code",           // `code` field in the Project Model
//           foreignField: "p_id",         // `p_id` in the Purchase Order Model
//           as: "purchaseOrders",         // Resulting array of matching purchase orders
//         },
//       },
//       {
//                   $unwind: {
//                   path: "$purchaseOrders",
//                  preserveNullAndEmptyArrays: true, // Keep projects without purchase orders for debugging
//                 },
// },
//         // Lookup to join with the Bill Detail Model    
//         {
//             $lookup: {
//                 from: "billModells",                // Correct Bill Detail collection name
//                 localField: "purchaseOrders.po_number",  // `po_number` in Purchase Order Model
//                 foreignField: "po_number",             // `po_number` in Bill Detail Model
//                 as: "billDetails",                     // Resulting array of matching bill details
//             },
//         },
//         // Unwind the bill details array
//         {
//             $unwind: {  
//                 path: "$billDetails",
//                 preserveNullAndEmptyArrays: true, // Keep purchase orders without bill details for debugging
//             }
            
//         },
    
//         {
//             $group: {
//               _id: "$code", // Group by project ID
//               totalBilledValue: { $sum: "$billDetails.bill_value" }, // Calculate total bill value
//               purchaseOrders: {
//                 $addToSet: {
//                   po_number: "$purchaseOrders.po_number", // Include purchase order numbers
//                   totalBills: { $sum: "$billDetails.bill_value" }, // Bill details per PO
//                 },
//               },
//             },
//         },

//       {
//         $project: {
//           _id: 0,
//           projectId: "$_id",         
//           totalBilledValue: 1,          // Include project code for reference
//           purchaseOrders: 1,     // Include purchase orders
//         },
//       },
      
//     ]);
//     res.status(200).json(purchaseOrders);
//   }catch (error) {
//     // Handle server errors
//     return res.status(500).json({ msg: "Server error", error: error.message });
//   }
// }
    



    
  module.exports = { all_project_balance, all_project_debit, total_po_balance, total_billed_value };
