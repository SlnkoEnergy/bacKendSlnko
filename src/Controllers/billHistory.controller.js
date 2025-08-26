const {
  catchAsyncError,
} = require("../middlewares/catchasyncerror.middleware");
const BillHistory = require("../Modells/billHistory.model");
const mongoose = require("mongoose");
const ErrorHandler = require("../middlewares/error.middleware");
const usermodel = require("../Modells/users/userModells");


const createBillHistory = catchAsyncError(async (req, res) => {
  const payload = req.body;
  const userId = req.user.userId;
  const user = await usermodel.findById(userId);
  
  if (!payload.subject_type || !payload.subject_id || !payload.event_type) {
    return next(
      new ErrorHandler(
        "subject_type, subject_id, and event_type are required",
        400
      )
    );
  }
  if (!mongoose.Types.ObjectId.isValid(payload.subject_id)) {
    return next(new ErrorHandler("Invalid subject_id", 400));
  }

  payload.changes = Array.isArray(payload.changes) ? payload.changes : [];
  payload.attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  const doc = await BillHistory.create({
    subject_type: payload.subject_type,
    subject_id: payload.subject_id,
    event_type: payload.event_type,
    message: payload.message ?? "",
    changes: payload.changes,
    attachments: payload.attachments,
    createdBy: {
      user_id: userId,
      name: user?.name
    },
  });

  res.status(201).json({
    message: "BillHistory created successfully",
    data: doc,
  });
});

const listBillHistory = catchAsyncError(async (req, res) => {
  const filter = {};
  if (req.query.subject_type) {
    filter.subject_type = req.query.subject_type;
  }
  if(req.query.subject_id){
    filter.subject_id = req.query.subject_id;
  }
  if (req.query.event_type) {
    const events = req.query.event_type.split(",").map((e) => e.trim());
    filter.event_type = { $in: events };
  }

  const data = await BillHistory.find(filter);

  res.status(200).json({
    message: "BillHistory retrieved successfully",
    data,
  });
});

const getBillHistory = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const doc = await BillHistory.findById(id);
  if (!doc) return next(new ErrorHandler("BillHistory not found", 404));
  res.status(200).json({
    message: "BillHistory retrived successfully",
    data: doc,
  });
});

const updateBillHistory = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  if (
    payload.subject_id &&
    !mongoose.Types.ObjectId.isValid(payload.subject_id)
  ) {
    return next(new ErrorHandler("Invalid subject_id", 400));
  }

  const updated = await BillHistory.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updated) return next(new ErrorHandler("BillHistory not found", 404));

  res.status(200).json({
    message: "BillHistory Updated Successfully",
    data: updated,
  });
});

const deleteBillHistory = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const deleted = await BillHistory.findByIdAndDelete(id);
  if (!deleted) return next(new ErrorHandler("BillHistory not found", 404));
  return ok(res, { _id: id });
});

module.exports = {
  createBillHistory,
  listBillHistory,
  getBillHistory,
  updateBillHistory,
  deleteBillHistory,
};
