const mongoose = require('mongoose');

const taskCounterSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  count: { type: Number, default: 0 },
});

taskCounterSchema.index({ createdBy: 1 }, { unique: true });

const TaskCounterSchema = mongoose.model('TaskCounter', taskCounterSchema);

module.exports = TaskCounterSchema;
