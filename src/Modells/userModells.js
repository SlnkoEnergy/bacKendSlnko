const { default: mongoose } = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true

    },
    id: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true
    },
        password:{
            type:String,
        },
    phone: {
        type: Number,

    },
    department: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        trim: true
    },
     otp:{
        type:Number,
        default: " "
    },
    otpExpires: { type: Date, default: null },




}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);