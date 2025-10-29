const { default: mongoose } = require("mongoose")

const ticketSchema = new mongoose.Schema(
    {
        ticket_id: {
            type: String,
        },
        project_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "projectDetail",
        },
        documents: [
            {
                attachment_url: { type: String },
            }
        ],

        short_description: {
            type: String,
        },
        description: {
            type: String,
        },
        material: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MaterialCategory",
        },
        current_status: {
            status: {
                type: String,
                enum: [
                    "completed",
                    "pending",
                    "in progress",
                    "draft",
                    "cancelled",
                    "system",
                ],
            },
            remarks: {
                type: String,
            },
            user_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            updatedAt: {
                type: Date,
                default: Date.now,
            }
        },

        status_history: [
            {
                status: {
                    type: String,
                    enum: [
                        "completed",
                        "pending",
                        "in progress",
                        "draft",
                        "cancelled",
                        "system",
                    ],
                },
                remarks: {
                    type: String,
                },
                user_id: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                updatedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        number: {
            type: String,
        }

    },
    { timestamps: true }
);

module.exports = mongoose.model("complaints", ticketSchema);