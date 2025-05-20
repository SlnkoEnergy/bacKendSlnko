const lead= require("../Modells/bdleadsModells");

const createlead = async function (req, res) {
  try {
    const {
        id,
      c_name,
      email,
      mobile,
      alt_mobile,
      company,
      village,
      district,
      state,
      scheme,
      capacity,
      distance,
      tarrif,
      land,
      entry_date,
      interest,
      comment,
      loi,
      ppa,
      loa,
      other_remarks,
      submitted_by,
      token_money,
      group,
      reffered_by,
      source,
      stage,
    } = req.body;

    const bdlead = new lead({
       id:id,
     c_name: c_name,
      email: email,
      mobile: mobile,
      alt_mobile: alt_mobile,
      company: company,
      village: village,
      district: district,
      state: state,
      scheme: scheme,
      capacity: capacity,
      distance: distance,
      tarrif: tarrif,
      land: land,
      entry_date: entry_date,
      interest: interest,
      comment: comment,
      loi: loi,
      ppa: ppa,
      loa: loa,
      other_remarks: other_remarks,
      submitted_by: submitted_by,
      token_money: token_money,
      group: group,
      reffered_by: reffered_by,
      source: source,
      stage: stage,
    });
    await bdlead.save();
    res.status(200).json({ msg: "Lead created successfully", bdlead: bdlead });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" + error});
  }
};



const all_bd_lead = async function (req, res) {
  try {
    const all_lead =await lead.find();
    if (!all_lead) {
      return res.status(404).json({ msg: "No leads found" });
    }
    res.status(200).json({ msg: "All leads data", data: all_lead });
}
    catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

// get lead by id 

const get_lead_by_id = async function (req,res) {
    try {
        const  _id  = req.params._id;
        const bdleadData = await lead.findById(_id);
        if (!bdleadData) {
        return res.status(404).json({ msg: "Lead not found" });
        }
        res.status(200).json({ msg: "Lead data", data: bdleadData });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

// Update lead by id
const update_lead = async function (req,res) {
    try {
        const  _id  = req.params._id;
        let data = req.body;
        const bdleadData = await lead.findByIdAndUpdate(_id, data, { new: true });
        if (!bdleadData) {
        return res.status(404).json({ msg: "Lead not found" });
        }
        res.status(200).json({ msg: "Lead data updated", data: bdleadData });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

// Delete lead by id
const delete_lead = async function (req,res) {
    try {
        const  _id  = req.params._id;
        const bdleadData = await lead.findByIdAndDelete(_id);
        if (!bdleadData) {
        return res.status(404).json({ msg: "Lead not found" });
        }
        res.status(200).json({ msg: "Lead data deleted"});
    } catch (error) {
        res.status(500).json({ message: "Internal server error"+ error });
    }
};




module.exports = {
  createlead,
  all_bd_lead,
  get_lead_by_id,
  update_lead,
  delete_lead,
};