const addMoneyModells = require("../Modells/addMoneyModells");
const projectModells = require("../Modells/projectModells");
const { getBill } = require("./billController");

const addMoney = async function (req, res) {
  try {
    const {
      p_id,
      submitted_by,
      cr_amount,
      cr_mode,
      cr_date,

      comment,
    } = req.body;

    // Check if the project exists
    let checkProject = await projectModells.find({ p_id: p_id });
    if (!checkProject) {
      return res.status(400).json({ msg: "Project not found" });
    }

    // Create the money addition record
    const admoney = new addMoneyModells({
      p_id,
      submitted_by,
      cr_amount,
      cr_date,

      cr_mode,

      comment,
    });

    // Save the record to the database
    await admoney.save();

    // Send a success response
    return res.status(201).json({
      msg: "Money added successfully",
      data: admoney,
    });
  } catch (error) {
    // Handle errors
    console.error(error); // Log the actual error for debugging
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};






const allbill = async function(req,res) {
  let bill = await addMoneyModells.find();
  res.status(200).json({msg:"all Bill Detail", bill})
};



const credit_amount = async function (req, res) {
  const { p_id } = req.params;

  try {
    const credits = await addMoneyModells.aggregate([
      { $match: { p_id } }, // Match documents with the provided p_id
      {
        $group: {
          _id: "$p_id",
          totalCredited: { $sum: "$cr_amount" }, // Summing the credit amount
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

    // If no matching records found
    if (credits.length === 0) {
      return res.status(404).json({ message: "No credit history found" });
    }

    const { totalCredited, creditDetails } = credits[0];

    const formattedDetails = creditDetails.map((credit) => ({
      cr_date: new Date(credit.cr_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      cr_mode: credit.cr_mode,
      cr_amount: credit.cr_amount,
    }));

    res.json({
      totalCredited,
      credits: formattedDetails,
    });
  } catch (error) {
    console.error("Error in credit_amount:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};





// const credit_amount = async function (req, res) {
//   const { p_id } = req.params;
//   console.log(p_id)

//   try {
//     // const credits = await addMoneyModells.find({ p_id });
//     // console.log(credits)
//     // if (!credits) {
//     //   return res.status(404).json({ message: "No credit history found" });
//     // }
//     const credits = await addMoneyModells.aggregate([
//       { $match: { p_id } }, // Match documents with the provided p_id
//       {
//         $group: {
//           _id: "$p_id",
//           totalCredited: { $sum: "$cr_amount" },
//           creditDetails: {
//             $push: {
//               cr_date: "$cr_date",
//               cr_mode: "$cr_mode",
//               cr_amount: "$cr_amount",
//             },
//           },
//         },
//       },
//     ]);

   

//     res.json({
//       credits: credits.map((credit) => ({
//         cr_date: new Date(credit.cr_date).toLocaleDateString("en-IN", {
//           day: "2-digit",
//           month: "short",
//           year: "numeric",
//         }),
//         cr_mode: credit.cr_mode,
//         cr_amount: credit.cr_amount,
//       })),
//       totalCredited,
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Server Error", error });
//   }
// };








// const  getCreditAmount = async function (req,res) {
//   try {
//     const { p_id } = req.query.p_id;
//     console.log(p_id)

   

//     // Fetch records from the database
//     const records = await addMoneyModells.findOne({ p_id });
    

//     if (!records || records.length === 0) {
//         return res.status(404).json({ message: 'No records found for the given p_id' });
//     }

//     // Calculate the total credit amount
//     const totalCreditAmount = records.reduce((total, record) => {
//         return total + (record.cr_amount || 0);
//     }, 0);

//     return res.status(200).json({ totalCreditAmount, records });
// } catch (error) {
//     console.error('Error fetching records:', error);
//     return res.status(500).json({ message: 'Internal server error' });
// }
// }


// const getAllBill = async (req, res) => {
//   try {
//       // Access `p_id` from query parameters
//       const { p_id } = req.query;  // Correctly destructure the `p_id` query parameter

//       console.log('Received p_id:', p_id);

//       // Check if p_id is provided
//       if (!p_id) {
//           return res.status(400).json({ message: 'p_id is required' });
//       }

//       // Fetch records from the database where `p_id` matches
//       const records = await addMoneyModells.find({ p_id });

//       // Check if any records were found
//       if (!records || records.length === 0) {
//           return res.status(404).json({ message: `No records found for p_id: ${p_id}` });
//       }

//       // Calculate the total credit amount for the given p_id
//       const totalCreditAmount = records.reduce((total, record) => {
//           return total + (record.cr_amount || 0);  // Ensure we handle cases where cr_amount might be missing
//       }, 0);

//       // Return the total credit amount along with the records
//       return res.status(200).json({ totalCreditAmount, records });
//   } catch (error) {
//       console.error('Error fetching records:', error);
//       return res.status(500).json({ message: 'Internal server error' });
//   }
// };


module.exports = {
  addMoney,
  // getCreditAmount,
  // getAllBill,
  allbill,
  credit_amount
};
