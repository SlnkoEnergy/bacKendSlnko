const mongoose = require("mongoose");

const ticketCounterSchema = new mongoose.Schema({
    state: {
        type: String, required: true
    },
    count: { type: Number, default: 1 },

});

ticketCounterSchema.index({ phone_no: 1 });

const TicketCounterSchema = mongoose.model("TicketCounter", ticketCounterSchema);

module.exports = TicketCounterSchema;