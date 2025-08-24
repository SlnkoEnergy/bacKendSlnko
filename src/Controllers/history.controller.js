const {
  catchAsyncError,
} = require("../middlewares/catchasyncerror.middleware");
const History = require("../Modells/history.model");
const mongoose = require("mongoose");
const ErrorHandler = require("../middlewares/error.middleware");

const createHistory = catchAsyncError(async (req, res) => {
  const payload = req.body;

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

  const doc = await History.create({
    subject_type: payload.subject_type,
    subject_id: payload.subject_id,
    event_type: payload.event_type,
    message: payload.message ?? "",
    changes: payload.changes,
    attachments: payload.attachments,
    createdBy: payload.createdBy || undefined,
  });

  res.status(201).json({
    message: "History created successfully",
    data: doc,
  });
});

const listHistory = catchAsyncError(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const sort = req.query.sort || "-createdAt";

  const skip = (page - 1) * pageSize;

  const filter = {};
  if (req.query.subject_type) {
    filter.subject_type = req.query.subject_type;
  }
  if (req.query.event_type) {
    const events = req.query.event_type.split(",").map((e) => e.trim());
    filter.event_type = { $in: events };
  }

  const total = await History.countDocuments(filter);
  const data = await History.find(filter).sort(sort).skip(skip).limit(pageSize);

  res.status(200).json({
    message: "History retrieved successfully",
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    data,
  });
});

const getHistory = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const doc = await History.findById(id);
  if (!doc) return next(new ErrorHandler("History not found", 404));
  res.status(200).json({
    message: "History retrived successfully",
    data: doc,
  });
});

const updateHistory = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  if (
    payload.subject_id &&
    !mongoose.Types.ObjectId.isValid(payload.subject_id)
  ) {
    return next(new ErrorHandler("Invalid subject_id", 400));
  }

  const updated = await History.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!updated) return next(new ErrorHandler("History not found", 404));

  res.status(200).json({
    message: "History Updated Successfully",
    data: updated,
  });
});

const deleteHistory = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const deleted = await History.findByIdAndDelete(id);
  if (!deleted) return next(new ErrorHandler("History not found", 404));
  return ok(res, { _id: id });
});

module.exports = {
  createHistory,
  listHistory,
  getHistory,
  updateHistory,
  deleteHistory,
};
