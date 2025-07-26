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
    device_id: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", sessionSchema);
