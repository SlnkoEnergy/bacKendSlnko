const commRateModells= require("../models/commRateModells");


//add commRate
const addCommRate = async function (req, res) {
    const { rate, Uom,Internal_Qty, Print_Qty } = req.body;
    try {
        let commRate = new commRateModells({
            rate,
            Uom,
            Internal_Qty,
            Print_Qty,

        });
        await commRate.save();
        res.status(200).json({ msg: "Comm Rate added successfully", commRate : commRate});
    } catch (error) {
        return res.status(400).json({ msg: "Server error", error: error.message });
    }
};

//get all commRate
const getCommRate = async function (req, res) {
    try {
        const commRate = await commRateModells.find();
        return res.status(200).json(commRate);
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};

//edit commRate
const editCommRate = async function (req, res) {
    try {
        let { _id } = req.params;
        let updateData = req.body;
        let data = await commRateModells.findByIdAndUpdate(_id, updateData, { new: true });
        if (!data) {
            return res.status(404).json({ msg: "user not found" });
        }
        return res.status(200).json({ msg: "Comm Rate updated successfully", data: data });
}catch (error) {
    return res.status(500).json({ msg: error.message });
}
};


//delete CommRate
const deleteCommRate = async function (req, res) {
    try {
        let { _id } = req.params;
        let data = await commRateModells.findByIdAndDelete(_id);
        if (!data) {
            return res.status(404).json({ msg: "Comm Rate not found" });
        }
        return res.status(200).json({ msg: "Comm Rate deleted successfully" });
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};




module.exports = { addCommRate, getCommRate, editCommRate, deleteCommRate };