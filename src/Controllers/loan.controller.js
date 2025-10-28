const Loan = require("../models/loan.model");

const createLoan = async (req, res) => {
  try {
    const loan = new Loan(req.body);
    await loan.save();
    res.status(201).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllLoans = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { "banking_details.name": { $regex: search, $options: "i" } },
        { "documents.name": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(parseInt(page), 1);
    const pageSize = Math.max(parseInt(limit), 10);
    const skip = (pageNum - 1) * pageSize;

    const [loans, total] = await Promise.all([
      Loan.find(query)
        .populate("project_id", "_id code name")
        .populate("current_status.user_id", "_id name email")
        .skip(skip)
        .limit(pageSize)
        .sort({ createdAt: -1 })
        .lean(),
      Loan.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      meta: {
        total,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
      data: loans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getLoanById = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate("project_id")
      .populate("status_history.user_id")
      .populate("current_status.user_id");

    if (!loan)
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });

    res.status(200).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateLoan = async (req, res) => {
  try {
    const loan = await Loan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!loan)
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });

    res.status(200).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateLoanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    if (!status || !remarks) {
      return res.status(404).json({
        message: "Status and Remarks are required",
      });
    }
    const loan = await Loan.findById(id);
    if (!loan) {
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });
    }
    loan.status_history.push({
      status,
      remarks,
      user_id: req.user.userId,
    });
    await loan.save();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteLoan = async (req, res) => {
  try {
    const loan = await Loan.findByIdAndDelete(req.params.id);

    if (!loan)
      return res
        .status(404)
        .json({ success: false, message: "Loan not found" });

    res
      .status(200)
      .json({ success: true, message: "Loan deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createLoan,
  getAllLoans,
  getLoanById,
  updateLoan,
  updateLoanStatus,
  deleteLoan,
};
