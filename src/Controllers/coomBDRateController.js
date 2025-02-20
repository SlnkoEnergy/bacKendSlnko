const CommBDRate = require('../Modells/commBDRateModells');
const CommBdRateHistory = require('../Modells/commBdRateHistoryModells');

//add commBDRate
const addCommBDRate = async function (req, res) {
    const {
        offer_id,
        spv_modules,
       
        module_mounting_structure,
       
        transmission_line,
       
       slnko_charges,
       submitted_by_BD,  } = req.body;
    try {
        let commBDRate = new CommBDRate({
            offer_id,
            spv_modules,
          
            module_mounting_structure,
            transmission_line,
            
            slnko_charges,
            submitted_by_BD,
        });
        await commBDRate.save();
        res.status(200).json({ msg: "Comm Rate added successfully", commBDRate : commBDRate});
    } catch (error) {
        return res.status(400).json({ msg: "Server error", error: error.message });
    }
};
//get all commBDRate

const getCommBDRate = async function (req, res) {
    try {
        const commBDRate = await CommBDRate.find();
        return res.status(200).json(commBDRate);
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};
//edit commBDRate
const editCommBDRate = async function (req, res) {
    try {
        let { _id } = req.params;
        let updateData = req.body;
        let data = await CommBDRate.findByIdAndUpdate(_id, updateData, { new: true });  
        if (!data) {
            return res.status(404).json({ msg: "user not found" });
        }

        let commBdRateHistory = new CommBdRateHistory({
            offer_id: data.offer_id,
            spv_modules: data.spv_modules,
            module_mounting_structure: data.module_mounting_structure,
            transmission_line: data.transmission_line,
            slnko_charges: data.slnko_charges,
            submitted_by_BD: data.submitted_by_BD,
        });
        await commBdRateHistory.save();
        return res.status(200).json({ msg: "Comm Rate updated successfully", data: data });
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};
//delete CommBDRate
const deleteCommBDRate = async function (req, res) {
    try {
        let { _id } = req.params;
        let data = await CommBDRate.findByIdAndDelete(_id);
        if (!data) {
            return res.status(404).json({ msg: "Comm Rate not found" });
        }
        return res.status(200).json({ msg: "Comm Rate deleted successfully" });
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};

//get all commbdRateHistory
const getCommBdRateHistory = async function (req, res) {
    try {
        const commBdRateHistory = await CommBdRateHistory.find();
        return res.status(200).json(commBdRateHistory);
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};

module.exports = {
    addCommBDRate,
    getCommBDRate,
    editCommBDRate,
    deleteCommBDRate,
    getCommBdRateHistory
};