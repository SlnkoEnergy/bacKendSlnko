const ExpenseSheet = require("../models/expensesheet.model");
const User = require("../models/user.model");
const { Parser } = require("json2csv");
const { default: mongoose } = require("mongoose");
const generateExpenseCode = require("../utils/generateExpenseCode");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");
const mime = require("mime-types");

const getAllExpense = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      emp_id,
      department,
      status,
      from,
      to,
    } = req.query;

    const currentUser = await User.findById(req.user.userId);

    const match = {};

    if (search) {
      match.$or = [
        { expense_code: { $regex: search, $options: "i" } },
        { emp_name: { $regex: search, $options: "i" } },
        { current_status: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      match.$or = [
        ...(match.$or || []),
        { current_status: status },
        { "current_status.status": status },
      ];
    }

    if (from && to) {
      match["expense_term.from"] = { $gte: new Date(from) };
      match["expense_term.to"] = { $lte: new Date(to) };
    }

    if (emp_id) {
      match.emp_id = emp_id;
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "emp_id",
          foreignField: "emp_id",
          as: "user_info",
        },
      },
      {
        $unwind: {
          path: "$user_info",
          preserveNullAndEmptyArrays: false,
        },
      },
    ];

    // Apply access control
    if (
      currentUser.department === "superadmin" ||
      currentUser.department === "admin"
    ) {
      // No additional filtering
    } else if (
      currentUser.department === "HR" &&
      currentUser.emp_id !== "SE-208"
    ) {
      pipeline.push({
        $match: {
          $or: [
            { current_status: "manager approval" },
            { "current_status.status": "manager approval" },
            { current_status: "hr approval" },
            { "current_status.status": "hr approval" },
            { current_status: "final approval" },
            { "current_status.status": "final approval" },
            { current_status: "rejected" },
            { "current_status.status": "rejected" },
          ],
        },
      });
    } else if (currentUser.department === "Accounts") {
      pipeline.push({
        $match: {
          $or: [
            { current_status: "hr approval" },
            { "current_status.status": "hr approval" },
            { current_status: "final approval" },
            { "current_status.status": "final approval" },
            { current_status: "rejected" },
            { "current_status.status": "rejected" },
          ],
        },
      });
    } else if (
      currentUser.department !== "Accounts" &&
      (currentUser.role === "manager" || currentUser.role === "visitor")
    ) {
      pipeline.push({
        $match: {
          "user_info.department": currentUser.department,
        },
      });
    } else {
      pipeline.push({
        $match: {
          emp_id: currentUser.emp_id,
        },
      });
    }

    if (department) {
      pipeline.push({
        $match: { "user_info.department": department },
      });
    }

    const totalPipeline = [...pipeline, { $count: "total" }];
    const dataPipeline = [
      ...pipeline,
      { $sort: { createdAt: -1 } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
    ];

    const [totalResult] = await ExpenseSheet.aggregate(totalPipeline);
    const expenses = await ExpenseSheet.aggregate(dataPipeline);
    const total = totalResult?.total || 0;

    res.status(200).json({
      message: "Expense Sheet retrieved successfully",
      data: expenses,
      total,
      page: Number(page),
      limit: Number(limit),
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
    const { expense_code, _id } = req.query;

    let query = {};
    if (_id) query._id = _id;
    if (expense_code) query.expense_code = expense_code;

    const expense = await ExpenseSheet.findOne(query);

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
    const data =
      typeof req.body.data === "string"
        ? JSON.parse(req.body.data)
        : req.body.data;

    const user_id = data.user_id || req.body.user_id;

    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const expense_code = await generateExpenseCode(user_id);
    const user = await User.findById(user_id).select("emp_id name role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const folderType = user.role === "site" ? "onsite" : "offsite";
    const folderPath = `expense_sheet/${folderType}/${user.emp_id}`.replace(/ /g, "_");
    const uploadedFileMap = {};

    for (const file of req.files || []) {
      const match = file.fieldname.match(/file_(\d+)/);
      if (!match) continue;

      const index = match[1];
      const mimeType = mime.lookup(file.originalname) || file.mimetype;
      let buffer = file.buffer;

      if (mimeType.startsWith("image/")) {
        const extension = mime.extension(mimeType);

        if (extension === "jpeg" || extension === "jpg") {
          buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        } else if (extension === "png") {
          buffer = await sharp(buffer).png({ quality: 40 }).toBuffer();
        } else if (extension === "webp") {
          buffer = await sharp(buffer).webp({ quality: 40 }).toBuffer();
        } else {
          buffer = await sharp(buffer).jpeg({ quality: 40 }).toBuffer();
        }
      }

      // Upload the file
      const form = new FormData();
      form.append("file", buffer, {
        filename: file.originalname,
        contentType: mimeType,
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;
      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const respData = response.data;
      const url =
        Array.isArray(respData) && respData.length > 0
          ? respData[0]
          : respData.url ||
            respData.fileUrl ||
            (respData.data && respData.data.url) ||
            null;

      if (url) {
        uploadedFileMap[index] = url;
      } else {
        console.warn(`No URL found for uploaded file ${file.originalname}`);
      }
    }

    const itemsWithAttachments = (data.items || []).map((item, idx) => ({
      ...item,
      attachment_url: uploadedFileMap[idx] || item.attachment_url || null,
    }));

    const expense = new ExpenseSheet({
      expense_code,
      user_id,
      emp_id: user.emp_id,
      emp_name: user.name,
      ...data,
      items: itemsWithAttachments,
    });

    await expense.save();

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

    const statusValue =
      typeof expense.current_status === "string"
        ? expense.current_status
        : expense.current_status?.status;

    if (statusValue?.trim().toLowerCase() !== "final approval") {
      return res
        .status(400)
        .json({ error: "Expense Sheet is not in final approval status" });
    }

    const { disbursement_date } = req.body;

    if (!disbursement_date) {
      return res.status(400).json({ error: "Disbursement date is required" });
    }

    const safeDateStr = disbursement_date.replace(/\//g, "-");
    const parsedDate = new Date(`${safeDateStr}T12:00:00+05:30`);

    if (isNaN(parsedDate.getTime())) {
      return res
        .status(400)
        .json({ error: "Invalid disbursement date format" });
    }

    expense.disbursement_date = parsedDate;

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

    const { status, remarks, approved_items } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // Update expense status history
    expense.status_history.push({
      status,
      remarks: remarks || "",
      user_id: req.user.userId,
      updatedAt: new Date(),
    });

    if (
      expense.items &&
      Array.isArray(expense.items) &&
      (status === "manager approval" ||
        status === "rejected" ||
        status === "hold" ||
        status === "hr approval" ||
        status === "final approval")
    ) {
      expense.items = expense.items.map((item) => {
        item.item_status_history = item.item_status_history || [];
        item.item_status_history.push({
          status,
          remarks: remarks || "",
          user_id: req.user.userId,
          updatedAt: new Date(),
        });

        if (status === "manager approval" && Array.isArray(approved_items)) {
          const match = approved_items.find(
            (a) => a._id.toString() === item._id.toString()
          );
          if (match) {
            item.approved_amount = match.approved_amount;
            expense.total_approved_amount = (
              parseFloat(expense.total_approved_amount || 0) +
              parseFloat(match.approved_amount || 0)
            ).toString();
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
      user_id: req.user.userId,
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

const toNumberExpr = (expr) => ({
  $convert: {
    input: {
      $replaceAll: {
        input: {
          $replaceAll: {
            input: {
              $trim: { input: { $ifNull: [expr, ""] } }
            },
            find: "₹",
            replacement: ""
          }
        },
        find: ",",
        replacement: ""
      }
    },
    to: "double",
    onError: 0,
    onNull: 0,
  },
});

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const exportExpenseSheetsCSV = async (req, res) => {
  try {
    const sheetIds = req.body.sheetIds;
    const dashboard = String(req.query.dashboard ?? "").toLowerCase() === "true";

    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      return res.status(400).json({ message: "No sheetIds provided." });
    }

    const objectIds = sheetIds.map(toObjectId);

    if (dashboard) {
      const rows = await ExpenseSheet.aggregate([
        { $match: { _id: { $in: objectIds } } },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$_id",
            expense_code: { $first: "$expense_code" },
            emp_name: { $first: "$emp_name" },
            current_status: { $first: "$current_status.status" },
            requested: { $sum: toNumberExpr("$items.invoice.invoice_amount") },
            approved: { $sum: toNumberExpr("$items.approved_amount") }, 
          },
        },
        {
          $project: {
            _id: 0,
            "Expense Code": "$expense_code",
            "Employee Name": "$emp_name",
            "Requested Amount": { $round: ["$requested", 2] },
            "Approved Amount": { $round: ["$approved", 2] },
            "Rejected Amount": {
              $round: [{ $subtract: ["$requested", "$approved"] }, 2],
            },
            "Sheet Current Status": "$current_status",
          },
        },
      ]);

      const fields = [
        "Expense Code",
        "Employee Name",
        "Requested Amount",
        "Approved Amount",
        "Rejected Amount",
        "Sheet Current Status",
      ];
      const parser = new Parser({ fields });
      const csv = parser.parse(rows);

      res.header("Content-Type", "text/csv");
      res.attachment("expenseSheets_dashboard.csv");
      return res.send(csv);
    }

    // Detailed export (per your original, but with safe conversions)
    let finalCSV = "";

    for (const sheetId of objectIds) {
      const expenseSheets = await ExpenseSheet.aggregate([
        { $match: { _id: sheetId } },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            "Expense Code": "$expense_code",
            "Emp Code": "$emp_id",
            "Employee Name": "$emp_name",
            "Project Code": {
              $toString: { $ifNull: ["$items.project_code", ""] },
            },
            "Project Name": {
              $toString: { $ifNull: ["$items.project_name", ""] },
            },
            "Sheet Current Status": "$current_status.status",
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
            "Invoice Amount": toNumberExpr("$items.invoice.invoice_amount"),
            "Approved Amount": toNumberExpr("$items.approved_amount"),
            "Item Remarks": "$items.remarks",
            "Attachment Available": {
              $cond: [
                {
                  $and: [
                    { $ne: ["$items.attachment_url", null] },
                    { $ne: ["$items.attachment_url", ""] },
                  ],
                },
                "Yes",
                "No",
              ],
            },
          },
        },
      ]);

      if (expenseSheets.length === 0) {
        finalCSV += `Sheet ID: ${sheetId.toString()} — No records found.\n\n`;
        continue;
      }

      const firstRow = expenseSheets[0];
      const headerSection = [
        ["Expense Code", firstRow["Expense Code"]],
        ["Emp Code", firstRow["Emp Code"]],
        ["Employee Name", firstRow["Employee Name"]],
        ["From", firstRow["From"]],
        ["To", firstRow["To"]],
        ["Sheet Current Status", firstRow["Sheet Current Status"]],
        "",
      ];

      const fields = Object.keys(firstRow).filter(
        (f) =>
          ![
            "Expense Code",
            "Emp Code",
            "Employee Name",
            "From",
            "To",
            "Sheet Current Status",
          ].includes(f)
      );

      const json2csvParser = new Parser({ fields });
      const csvTable = json2csvParser.parse(expenseSheets);

      // Summary by Category
      const summaryMap = {};
      let totalRequested = 0;
      let totalApproved = 0;

      for (const row of expenseSheets) {
        const category = row["Category"] || "Uncategorized";
        const invoice = Number(row["Invoice Amount"] || 0);
        const approved = Number(row["Approved Amount"] || 0);

        if (!summaryMap[category]) summaryMap[category] = { requested: 0, approved: 0 };
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
        ...Object.entries(summaryMap).map(
          ([cat, v]) => `"${cat}",${v.requested.toFixed(2)},${v.approved.toFixed(2)}`
        ),
        `"Total",${totalRequested.toFixed(2)},${totalApproved.toFixed(2)}`,
      ];

      const headerCSV = headerSection
        .map((row) => (Array.isArray(row) ? row.join(",") : row))
        .join("\n");

      finalCSV += `${headerCSV}\n${csvTable}\n${summaryRows.join("\n")}\n\n`;
    }

    res.header("Content-Type", "text/csv");
    res.attachment("expenseSheets.csv");
    return res.send(finalCSV);
  } catch (err) {
    console.error("CSV Export Error:", err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};


const getExpensePdf = async (req, res) => {
  try {
    const { printAttachments } = req.query;
    const { expenseIds } = req.body;

    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ message: "Expense sheet ID(s) required" });
    }

    const sheets = await ExpenseSheet.find({ _id: { $in: expenseIds } })
      .populate("user_id")
      .lean();

    if (!sheets.length) {
      return res.status(404).json({ message: "No expense sheets found" });
    }

    const processed = sheets.map((sheet) => ({
      ...sheet,
      department: sheet?.user_id?.department || "",
      attachmentLinks: (sheet.items || [])
        .map((item) => item.attachment_url)
        .filter((url) => url && url.startsWith("http")),
    }));

    const apiUrl = `${process.env.PDF_PORT}/expensePdf/expense-pdf`;

    const axiosResponse = await axios({
      method: "post",
      url: apiUrl,
      data: {
        sheets: processed,
        printAttachments: printAttachments === "true",
      },
      responseType: "stream",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    res.set({
      "Content-Type": axiosResponse.headers["content-type"],
      "Content-Disposition":
        axiosResponse.headers["content-disposition"] ||
        `attachment; filename="Multiple_Expenses.pdf"`,
    });

    axiosResponse.data.pipe(res);
  } catch (error) {
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
  exportExpenseSheetsCSV,
  getExpensePdf
};
