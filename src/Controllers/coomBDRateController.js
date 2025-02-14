const CommBDRate = require('../Modells/commBDRateModells');

//add commBDRate
const addCommBDRate = async function (req, res) {
    const {
        spv_modules_555,
        spv_modules_580,
        spv_modules_550,
        spv_modules_585,
        
        solar_inverter,
        module_mounting_structure,
        mounting_hardware,
        dc_cable,
        ac_cable_inverter_accb,
        ac_cable_accb_transformer,
        ac_ht_cable_11KV,
        ac_ht_cable_33KV,
        earthing_station,
        earthing_strips,
        earthing_strip,
        lightening_arrestor,
        datalogger,
        auxilary_transformer,
        ups_ldb,
        balance_of_system,
        transportation,
        transmission_line_11kv,
        transmission_line_33kv,
       
        ct_pt_11kv_MP,
        ct_pt_33kv_MP,
        ct_pt_11kv_Other,
        ct_pt_33kv_Other,
        abt_meter_11kv_MP,
        abt_meter_33kv_MP,
        abt_meter_11kv_Other,
        abt_meter_33kv_Other,
        vcb_kiosk,
        slnko_charges,
        installation_commissioing, 
        submitted_by,  } = req.body;
    try {
        let commBDRate = new CommBDRate({
            spv_modules_555,
            spv_modules_580,
            spv_modules_550,
            spv_modules_585,
        
            solar_inverter,
            module_mounting_structure,
            mounting_hardware,
            dc_cable,
            ac_cable_inverter_accb,
            ac_cable_accb_transformer,
            ac_ht_cable_11KV,
            ac_ht_cable_33KV,
            earthing_station,
            earthing_strips,
            earthing_strip,
            lightening_arrestor,
            datalogger,
            auxilary_transformer,
            ups_ldb,
            balance_of_system,
            transportation,
            transmission_line_11kv,
            transmission_line_33kv,
           
            ct_pt_11kv_MP,
            ct_pt_33kv_MP,
            ct_pt_11kv_Other,
            ct_pt_33kv_Other,
            abt_meter_11kv_MP,
            abt_meter_33kv_MP,
            abt_meter_11kv_Other,
            abt_meter_33kv_Other,
            vcb_kiosk,
            slnko_charges,
            installation_commissioing, 
            submitted_by,
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
module.exports = {
    addCommBDRate,
    getCommBDRate,
    editCommBDRate,
    deleteCommBDRate
};