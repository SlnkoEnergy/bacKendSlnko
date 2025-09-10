const ModifiedExpenseSheet = require("../models/modifiedexpensesheet.model");
const User = require("../models/user.model");
const generateExpenseCode = require("../utils/generateExpenseCode");
const axios = require("axios");
const FormData = require("form-data");

const createModifiedExpense = async (req, res) => {
  try {
    const data = req.body;
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
    const folderPath = `expense_sheet/${folderType}/${user.emp_id}`;

    const uploadedFileMap = {};

    for (const file of req.files || []) {
      const match = file.fieldname.match(/file_(\d+)_(\d+)/);
      if (!match) continue;

      const projIdx = match[1];
      const itemIdx = match[2];
      const key = `${projIdx}_${itemIdx}`;

      const form = new FormData();
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
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
        uploadedFileMap[key] = url;
      } else {
        console.warn(`No URL found for uploaded file ${file.originalname}`);
      }
    }

    const projectsWithAttachments = (data.projects || []).map(
      (project, projIdx) => ({
        ...project,
        items: (project.items || []).map((item, itemIdx) => {
          const key = `${projIdx}_${itemIdx}`;
          return {
            ...item,
            attachment_url: uploadedFileMap[key] || item.attachment_url || null,
          };
        }),
      })
    );

    const expense = new ModifiedExpenseSheet({
      expense_code,
      user_id,
      emp_id: user.emp_id,
      emp_name: user.name,
      ...data,
      projects: projectsWithAttachments,
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

const getAllModifiedExpense = async (req, res) => {
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
      match.$or = [...(match.$or || []), { "current_status.status": status }];
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
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    if (
      currentUser.department === "superadmin" ||
      currentUser.department === "admin"
    ) {
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

    const [totalResult] = await ModifiedExpenseSheet.aggregate(totalPipeline);
    const expenses = await ModifiedExpenseSheet.aggregate(dataPipeline);
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

const getModifiedExpenseById = async (req, res) => {
  try {
    const { expense_code, _id } = req.query;

    let query = {};
    if (_id) query._id = _id;
    if (expense_code) query.expense_code = expense_code;

    const expense = await ModifiedExpenseSheet.findOne(query);

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

module.exports = {
  createModifiedExpense,
  getAllModifiedExpense,
  getModifiedExpenseById,
};
