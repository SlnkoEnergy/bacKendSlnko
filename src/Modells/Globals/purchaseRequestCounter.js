const mongoose = require('mongoose');

const purchaseRequestCounterSchema = new mongoose.Schema({
  project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'projectDetail', required: true },
  count: { type: Number, default: 0 },
});

purchaseRequestCounterSchema.index({ project_id: 1 }, { unique: true });

const PurchaseRequestCounter = mongoose.model('PurchaseRequestCounter', purchaseRequestCounterSchema);

module.exports = PurchaseRequestCounter;
