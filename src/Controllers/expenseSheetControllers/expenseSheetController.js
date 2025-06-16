const ExpenseSheet = require("../../Modells/Expense_Sheet/expense_sheet_Model");
const User = require("../../Modells/userModells");
const { Parser } = require("json2csv");
const { default: mongoose } = require("mongoose");
const generateExpenseCode = require("../../utils/generateExpenseCode");
const axios = require("axios");
const FormData = require("form-data");


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

const createExpense = async (req, res) => {
  try {
    // Parse incoming data (handle string or already parsed object)
    const data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;

    const user_id = data.user_id || req.body.user_id;
    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    // Generate unique expense code
    const expense_code = await generateExpenseCode(user_id);

    // Fetch user details
    const user = await User.findById(user_id).select("emp_id name role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Define folder path based on user role
    const folderType = user.role === "site" ? "onsite" : "offsite";
    const folderPath = `expense_sheet/${folderType}/${user.emp_id}`;

    const uploadedFileURLs = [];

    // Upload each file and collect URLs
    for (const file of (req.files || [])) {
      const form = new FormData();
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      // Construct upload URL
      const uploadUrl = `https://upload.slnkoprotrac.com?containerName=protrac&foldername=${folderPath}`;

      // Post file to upload endpoint
      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      // Extract URL from response safely
      const respData = response.data;
      const url = Array.isArray(respData) && respData.length > 0
        ? respData[0]
        : respData.url || respData.fileUrl || (respData.data && respData.data.url) || null;

      if (!url) {
        console.warn(`Warning: No upload URL found for file ${file.originalname}`);
      }
      uploadedFileURLs.push(url);
    }

    // Map uploaded URLs back to items, preserving existing attachment URLs if no new upload
    const itemsWithAttachments = (data.items || []).map((item, idx) => ({
      ...item,
      attachment_url: uploadedFileURLs[idx] || item.attachment_url || null,
    }));

    // Create new expense sheet document
    const expense = new ExpenseSheet({
      expense_code,
      user_id,
      emp_id: user.emp_id,
      emp_name: user.name,
      ...data,
      items: itemsWithAttachments,
    });

    // Save to database
    await expense.save();

    // Send success response
    return res.status(201).json({
      message: "Expense Sheet Created Successfully",
      data: expense,
    });
  } catch (error) {
    console.error("Error creating expense sheet:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message || error.toString(),
    });
  }
};

const updateExpenseSheet = async (req, res) => {
  try {
    const expense = await ExpenseSheet.findByIdAndUpdate(
      req.params._id,
      req.body,
      { new: true }
    );
    res.status(201).json({
      message: "Expense Sheet Updated Successfully",
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const updateDisbursementDate = async (req, res) => {
  try {
    const expense = await ExpenseSheet.findById(req.params._id);
    if (!expense) {
      return res.status(404).json({ error: "Expense Sheet not found" });
    }

    if (expense.current_status !== "final approval") {
      return res
        .status(400)
        .json({ error: "Expense Sheet is not in final approval status" });
    }

    const { disbursement_date } = req.body;

    if (!disbursement_date) {
      return res.status(400).json({ error: "Disbursement date is required" });
    }

    // Update the disbursement date
    expense.disbursement_date = disbursement_date;
    await expense.save();
    res.status(200).json({
      message: "Disbursement date updated successfully",
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

    const { status, remarks, approved_items} = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // Update expense status history
    expense.status_history.push({
      status,
      remarks: remarks || "",
      user_id: req.user._id,
      updatedAt: new Date(),
    });

    // Update each item's status and push to item_status_history
    if (
      expense.items &&
      Array.isArray(expense.items) &&
      (status === "manager approval" ||
        status === "rejected" ||
        status === "hold")
    ) {
      expense.items = expense.items.map((item) => {
        item.item_status_history = item.item_status_history || [];
        item.item_status_history.push({
          status,
          remarks: remarks || "",
          user_id: req.user._id,
          updatedAt: new Date(),
        });
    
      if (status === "manager approval" && Array.isArray(approved_items)) {
          const match = approved_items.find((a) =>
            a._id.toString() === item._id.toString()
          );
          if (match) {
            item.approved_amount = match.approved_amount;
          }
        }

        return item;
      });
    }
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
    const { status, remarks, approved_amount } = req.body;

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


    item.approved_amount = approved_amount;
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
      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          "Expense Code": "$expense_code",
          "Emp Code": "$emp_id",
          "Employee Name": "$emp_name",
          "Project Code": { $toString: "$items.project_id" },
          "Sheet Current Status": "$current_status",
          From: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.from" },
          },
          To: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.to" },
          },
          "Sheet Remarks": "$comments",
          Category: "$items.category",
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

    summaryRows.push(
      `"Total",${totalRequested.toFixed(2)},${totalApproved.toFixed(2)}`
    );

    csv += "\n" + summaryRows.join("\n");

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
      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          "Expense Code": "$expense_code",
          "Emp Code": "$emp_id",
          "Employee Name": "$emp_name",
          "Project Code": { $toString: "$items.project_id" },
          "Sheet Current Status": "$current_status",
          From: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.from" },
          },
          To: {
            $dateToString: { format: "%d/%m/%Y", date: "$expense_term.to" },
          },
          "Sheet Remarks": "$comments",
          Category: "$items.category",
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

    // Summary by Category
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

    summaryRows.push(
      `"Total",${totalRequested.toFixed(2)},${totalApproved.toFixed(2)}`
    );

    csv += "\n" + summaryRows.join("\n");

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
const getExpensePdf = async (req, res) => {
  try {
    const { _id } = req.params;
    const { printAttachments } = req.query;

    if (!_id) {
      return res.status(400).json({ message: "Expense sheet ID is required" });
    }

    // Fetch the sheet from DB (or get it from somewhere)
    const sheet = await ExpenseSheet.findById(_id).populate("user_id").lean();
    if (!sheet) {
      return res.status(404).json({ message: "Expense sheet not found" });
    }

    const department = sheet?.user_id?.department || "";
    const attachmentLinks = sheet.items
  .map(item => item.attachment_url)
  .filter(url => url && url.startsWith("http"));

    console.log(attachmentLinks);

    const apiUrl = `${process.env.PDF_PORT}/expensePdf/expense-pdf`;

    // POST request with body containing sheet and other data
    const response = await axios.post(
      apiUrl,
      {
        sheet,
        printAttachments: printAttachments === "true",
        attachmentLinks,
        department,
      },
      { responseType: "arraybuffer", maxContentLength: Infinity,  // Allow unlimited size
    maxBodyLength: Infinity  } // important for binary data
    );

    // Forward PDF response headers and body
    res.set({
      "Content-Type": response.headers["content-type"],
      "Content-Disposition": response.headers["content-disposition"],
      "Content-Length": response.headers["content-length"],
    });

    res.send(response.data);
  } catch (error) {
    console.error("Error proxying PDF request:", error.message);
    res.status(500).json({ message: "Error fetching PDF", error: error.message });
  }
};


module.exports = {
  getAllExpense,
  getExpenseById,
  createExpense,
  updateExpenseSheet,
  updateDisbursementDate,
  updateExpenseStatusOverall,
  updateExpenseStatusItems,
  deleteExpense,
  exportAllExpenseSheetsCSV,
  exportExpenseSheetsCSVById,
  getExpensePdf
};
