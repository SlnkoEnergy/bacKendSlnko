const { default: mongoose } = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    login_time: {
      type: Date,
    },
    logout_time: {
      type: Date,
    },
    device_info: {
      device_id: { type: String },
      ip: { type: String },
      latitude: { type: String },
      longitude: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);
