const mongoose = require('mongoose');

const expenseSheetSchema = new mongoose.Schema({
    project_code: {
        type: String,
        required: true
    },
    project_name: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 20 
    },
    submitted_date: {
        type: Date,
        required: true
    },
    emp_code: {
        type: String
    },
    submitted_by:{
        type:String
    },
    quantity: {
        type: Number,
        required: true,
        default: 1
    },
    rate: {
        type: Number,
        required: true
    },
    total_rate: {
        type: Number,
        required: true
    },
    approved_amount: {
        type: Number,
    },
    disbursement_date: {
        type: Date,
    },
    status: {
        type: String,
        required: true,
        enum: ['draft', 'submitted', 'rejected', 'approved_by_cam', 'approved_by_hr', 'approved_by_accounts']
    },
    attachment_url: {
        type: String
    },
    
}, { timestamps: true });

module.exports = mongoose.model("ExpenseSheet", expenseSheetSchema);