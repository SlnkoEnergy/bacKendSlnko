const commScmRateModells = require("../models/commScmRateModells");
const commScmRateHistoryModells = require("../models/commScmRateHistoryModells");  

//add commScmRate
const addCommScmRate = async function (req, res) {
  const {
    spv_modules_555,
    spv_modules_580,
    spv_modules_550,
    spv_modules_585,
    // offer_id,
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
    // transmission_line_internal,
    // transmission_line_print,
    ct_pt_11kv_MP,
    ct_pt_33kv_MP,
    ct_pt_11kv_Other,
    ct_pt_33kv_Other,
    abt_meter_11kv_MP,
    abt_meter_33kv_MP,
    abt_meter_11kv_Other,
    abt_meter_33kv_Other,
    vcb_kiosk,
    slnko_charges_scm,
    installation_commissioing, 
    submitted_by_scm,
  } = req.body;
  try {
    let commScmRate = new commScmRateModells({
      spv_modules_555,
      spv_modules_580,
      spv_modules_550,
      spv_modules_585,
      // offer_id,
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
      // transmission_line_internal,
      // transmission_line_print,
      ct_pt_11kv_MP,
      ct_pt_33kv_MP,
      ct_pt_11kv_Other,
      ct_pt_33kv_Other,
      abt_meter_11kv_MP,
      abt_meter_33kv_MP,
      abt_meter_11kv_Other,
      abt_meter_33kv_Other,
      vcb_kiosk,
      slnko_charges_scm,
      installation_commissioing,
      submitted_by_scm,
    });
    await commScmRate.save();
    res
      .status(200)
      .json({
        msg: "Comm Scm Rate added successfully",
        commScmRate: commScmRate,
      });
  } catch (error) {
    return res.status(400).json({ msg: "Server error", error: error.message });
  }
};

//get all commScmRate
const getCommScmRate = async function (req, res) {
  try {
    const commScmRate = await commScmRateModells.find();
    return res.status(200).json(commScmRate);
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

//edit commScmRate
const editCommScmRate = async function (req, res) {
  try {
    let { _id } = req.params;
    let updateData = req.body;
    let data = await commScmRateModells.findByIdAndUpdate(_id, updateData, {
      new: true,
    });
    if (!data) {
      return res.status(404).json({ msg: "user not found" });
    }
    let commScmRateHistory = new commScmRateHistoryModells({
      spv_modules_555: data.spv_modules_555,
      spv_modules_580: data.spv_modules_580,
      spv_modules_550: data.spv_modules_550,
      spv_modules_585: data.spv_modules_585,
      solar_inverter: data.solar_inverter,
      module_mounting_structure: data.module_mounting_structure,
      mounting_hardware: data.mounting_hardware,
      dc_cable: data.dc_cable,
      ac_cable_inverter_accb: data.ac_cable_inverter_accb,
      ac_cable_accb_transformer: data.ac_cable_accb_transformer,
      ac_ht_cable_11KV: data.ac_ht_cable_11KV,
      ac_ht_cable_33KV: data.ac_ht_cable_33KV,
      earthing_station: data.earthing_station,
      earthing_strips: data.earthing_strips,
      earthing_strip: data.earthing_strip,
      lightening_arrestor: data.lightening_arrestor,
      datalogger: data.datalogger,
      auxilary_transformer: data.auxilary_transformer,
      ups_ldb: data.ups_ldb,
      balance_of_system: data.balance_of_system,
      transportation: data.transportation,
      transmission_line_11kv: data.transmission_line_11kv,
      transmission_line_33kv: data.transmission_line_33kv,
      ct_pt_11kv_MP: data.ct_pt_11kv_MP,
      ct_pt_33kv_MP: data.ct_pt_33kv_MP,
      ct_pt_11kv_Other: data.ct_pt_11kv_Other,
      ct_pt_33kv_Other: data.ct_pt_33kv_Other,
      abt_meter_11kv_MP: data.abt_meter_11kv_MP,
      abt_meter_33kv_MP: data.abt_meter_33kv_MP,
      abt_meter_11kv_Other: data.abt_meter_11kv_Other,
      abt_meter_33kv_Other: data.abt_meter_33kv_Other,
      vcb_kiosk: data.vcb_kiosk,
      slnko_charges_scm: data.slnko_charges_scm,
      installation_commissioing: {
        labour_works: data.installation_commissioing.labour_works,
        machinery: data.installation_commissioing.machinery,
        civil_material: data.installation_commissioing.civil_material,
      },
      submitted_by_scm: data.submitted_by_scm,
    });
    await commScmRateHistory.save();


    return res
      .status(200)
      .json({ msg: "Comm Scm Rate updated successfully", data: data });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

module.exports = { addCommScmRate, getCommScmRate, editCommScmRate };
