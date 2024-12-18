const addMoneyModells = require("../Modells/addMoneyModells");
const projectModells = require("../Modells/projectModells");
const { getBill } = require("./billController");




//Add Money
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



//get all bill

const allbill = async function (req, res) {
  let bill = await addMoneyModells.find();
  res.status(200).json({ msg: "all Bill Detail", bill });
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
};
