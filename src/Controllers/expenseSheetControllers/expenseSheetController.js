const ExpenseSheet = require("../../Modells/Expense_Sheet/expense_sheet_Model");
const moment = require("moment");
const User = require("../../Modells/userModells");
const { Parser } = require("json2csv");
const { default: mongoose } = require("mongoose");

const getAllExpense = async (req, res) => {
  try {

    let expense = await ExpenseSheet.find();

    res.status(200).json({
      message: "Expense Sheet retrieved successfully",
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expenseId = req.params._id;

    const expense = await ExpenseSheet.findById(expenseId);

    if (!expense) {
      return res.status(404).json({
        message: "Expense not found",
      });
    }

    res.status(200).json({
      message: "Expense retrieved successfully",
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

async function generateExpenseCode(userId) {
  // Find user for emp_id
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Get current date info
  const now = moment();

  // Get month full name in uppercase, e.g. MAY
  const monthName = now.format("MMMM").toUpperCase(); // 'May' => 'MAY'

  // Calculate week of month (1-based)
  const weekOfMonth = Math.ceil(now.date() / 7);
  const week = weekOfMonth < 10 ? "0" + weekOfMonth : weekOfMonth.toString();

  // Count existing expense sheets this month for user
  const count = await ExpenseSheet.countDocuments({
    user_id: userId,
    createdAt: {
      $gte: now.startOf("month").toDate(),
      $lt: now.endOf("month").toDate(),
    },
  });

  // Auto number padded
  const autoNumber = (count + 1).toString().padStart(3, "0");

  // Format: EXP/MAY-01/EMP_ID/001
  return `EXP/${monthName}-${week}/${user.emp_id}/${autoNumber}`;
}

const createExpense = async (req, res) => {
  try {
    const { data, user_id } = req.body;

    const expense_code = await generateExpenseCode(user_id);

    if (!expense_code) {
      return res.status(400).json({ message: "Expense Code is required" });
    }

    const expense = new ExpenseSheet({
      expense_code,
      user_id,
      ...data,
    });

    await expense.save();

    res.status(201).json({
      message: "Expense Sheet Created Successfully",
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateExpenseStatusOverall = async (req, res) => {
  try {
    const expense = await ExpenseSheet.findById(req.params._id);
    if (!expense)
      return res.status(404).json({ error: "Expense Sheet not found" });

    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // Push to status_history
    expense.status_history.push({
      status,
      remarks: remarks || "",
      user_id: req.user._id,
      updatedAt: new Date(),
    });

    await expense.save();

    res.status(200).json({
      message: "Status Updated Successfully",
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateExpenseStatusItems = async (req, res) => {
  try {
    const { sheetId, itemId } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status of Item is required" });
    }

    const expenseSheet = await ExpenseSheet.findById(sheetId);
    if (!expenseSheet) {
      return res.status(404).json({ error: "Expense Sheet not found" });
    }

    const item = expenseSheet.items.id(itemId);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Push to status history
    item.item_status_history.push({
      status,
      remarks: remarks || "",
      user_id: req.user._id,
      updatedAt: new Date(),
    });

    await expenseSheet.save();

    res.status(200).json({
      message: "Item status updated successfully",
      data: item,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const deleteExpense = await ExpenseSheet.findByIdAndDelete(req.params._id);
    res.status(200).json({
      message: "Expense Sheet Deleted Successfully",
      data: deleteExpense,
    });
  } catch (error) {
    res.status(500).json({
      message: "Expense Sheet Deleted Successfully",
      error: error.message,
    });
  }
};

//Export To CSV

const exportAllExpenseSheetsCSV = async (req, res) => {
  try {
    const expenseSheets = await ExpenseSheet.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true },
      },
      {
        $unwind: { path: "$items", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 0,
          "Expense Code": "$expense_code",
          "Sheet Current Status": "$current_status",
          From: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.from" },
          },
          To: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.to" },
          },
          "Sheet Remarks": "$comments",
          "Emp Code": "$userDetails.emp_id",
          "Employee Name": "$userDetails.name",
          Category: "$items.category",
          "Project Code": { $toString: "$items.project_id" },
          Description: "$items.description",
          "Expense Date": {
            $cond: [
              { $ifNull: ["$items.expense_date", false] },
              {
                $dateToString: {
                  format: "%d/%m/%Y",
                  date: "$items.expense_date",
                },
              },
              "",
            ],
          },
          "Invoice Number": "$items.invoice.invoice_number",
          "Invoice Amount": "$items.invoice.invoice_amount",
          "Approved Amount": "$items.approved_amount",
          "Item Remarks": "$items.remarks",
          "Current Status": "$items.item_current_status",
        },
      },
    ]);

    // Generate main CSV
    const fields = Object.keys(expenseSheets[0] || {});
    const json2csvParser = new Parser({ fields });
    let csv = json2csvParser.parse(expenseSheets);

    // === 🔽 Build Summary Section ===
    const summaryMap = {};
    let totalRequested = 0;
    let totalApproved = 0;

    for (const row of expenseSheets) {
      const category = row["Category"] || "Uncategorized";
      const invoice = parseFloat(row["Invoice Amount"] || 0);
      const approved = parseFloat(row["Approved Amount"] || 0);

      if (!summaryMap[category]) {
        summaryMap[category] = { requested: 0, approved: 0 };
      }

      summaryMap[category].requested += invoice;
      summaryMap[category].approved += approved;

      totalRequested += invoice;
      totalApproved += approved;
    }

    const summaryRows = [
      "",
      "",
      "Summary by Category",
      "Category,Total Requested Amount,Total Approved Amount",
    ];

    for (const [category, data] of Object.entries(summaryMap)) {
      summaryRows.push(
        `"${category}",${data.requested.toFixed(2)},${data.approved.toFixed(2)}`
      );
    }

    // Add final total row
    summaryRows.push(
      `"Total",${totalRequested.toFixed(2)},${totalApproved.toFixed(2)}`
    );

    // Append summary to CSV
    csv += "\n" + summaryRows.join("\n");

    // Send response
    res.header("Content-Type", "text/csv");
    res.attachment("expenseSheets.csv");
    res.send(csv);
  } catch (err) {
    console.error("CSV Export Error:", err.message);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

const exportExpenseSheetsCSVById = async (req, res) => {
  try {
    const sheetId = req.params._id;

    const expenseSheets = await ExpenseSheet.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(sheetId) } },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$items",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          "Expense Code": "$expense_code",
          "Sheet Current Status": "$current_status",
          From: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.from" },
          },
          To: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.to" },
          },
          "Sheet Remarks": "$comments",
          "Emp Code": "$userDetails.emp_id",
          "Employee Name": "$userDetails.name",
          Category: "$items.category",
          "Project Code": { $toString: "$items.project_id" },
          Description: "$items.description",
          "Expense Date": {
            $cond: [
              { $ifNull: ["$items.expense_date", false] },
              {
                $dateToString: {
                  format: "%d/%m/%Y",
                  date: "$items.expense_date",
                },
              },
              "",
            ],
          },
          "Invoice Number": "$items.invoice.invoice_number",
          "Invoice Amount": "$items.invoice.invoice_amount",
          "Approved Amount": "$items.approved_amount",
          "Item Remarks": "$items.remarks",
          "Current Status": "$items.item_current_status",
        },
      },
    ]);

    const fields = Object.keys(expenseSheets[0] || {});
    const json2csvParser = new Parser({ fields });
    let csv = json2csvParser.parse(expenseSheets);

    // === 🔽 Build Summary Section ===
    const summaryMap = {};
    let totalRequested = 0;
    let totalApproved = 0;

    for (const row of expenseSheets) {
      const category = row["Category"] || "Uncategorized";
      const invoice = parseFloat(row["Invoice Amount"] || 0);
      const approved = parseFloat(row["Approved Amount"] || 0);

      if (!summaryMap[category]) {
        summaryMap[category] = { requested: 0, approved: 0 };
      }

      summaryMap[category].requested += invoice;
      summaryMap[category].approved += approved;

      totalRequested += invoice;
      totalApproved += approved;
    }

    const summaryRows = [
      "",
      "",
      "Summary by Category",
      "Category,Total Requested Amount,Total Approved Amount",
    ];

    for (const [category, data] of Object.entries(summaryMap)) {
      summaryRows.push(
        `"${category}",${data.requested.toFixed(2)},${data.approved.toFixed(2)}`
      );
    }

    // Add final total row
    summaryRows.push(
      `"Total",${totalRequested.toFixed(2)},${totalApproved.toFixed(2)}`
    );

    // Append summary to CSV
    csv += "\n" + summaryRows.join("\n");

    // Send response
    res.header("Content-Type", "text/csv");
    res.attachment("expenseSheets.csv");
    res.send(csv);
  } catch (err) {
    console.error("CSV Export Error:", err.message);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

module.exports = {
  getAllExpense,
  getExpenseById,
  createExpense,
  updateExpenseStatusOverall,
  updateExpenseStatusItems,
  deleteExpense,
  exportAllExpenseSheetsCSV,
  exportExpenseSheetsCSVById,
};
