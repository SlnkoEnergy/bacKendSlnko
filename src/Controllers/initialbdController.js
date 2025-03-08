const bdModelles = require("../Modells/createBDleadModells");
const initialbdleadModells = require("../Modells/initialBdLeadModells");
const followUpleadMpodells = require("../Modells/followupbdModells");
//const initialBdLeadModells = require("../Modells/initialBdLeadModells");
//const followUpBdleadModells = require("../Modells/followupbdModells");
const deadleadModells = require("../Modells/deadleadModells");
const warmleadModells = require("../Modells/warmbdLeadModells");
const wonleadModells = require("../Modells/wonleadModells");

// initial to followup lead
const initialtofollowup = async function (req, res) {
  try {
    const { id } = req.body;

    // Find Initial Data
    const initialData = await initialbdleadModells.findOne({ id: id });
    if (!initialData) {
      return res.status(404).json({ message: "Data not found" });
    }

    // Check if loi is "Yes"
    if (initialData.loi !== "Yes") {
      return res.status(400).json({ message: "LOI is not Yes, cannot move" });
    }
    if (initialData.loa === "Yes" && initialData.ppa === "Yes") {
      return res
        .status(400)
        .json({ message: "LOA and PPA are Yes, cannot move to follow-up" });
    }

    // Move to FollowUp Collection
    const followUpData = new followUpleadMpodells({
      id: initialData.id,
      c_name: initialData.c_name,
      email: initialData.email,
      mobile: initialData.mobile,
      alt_mobile: initialData.alt_mobile,
      company: initialData.company,
      village: initialData.village,
      district: initialData.district,
      state: initialData.state,
      scheme: initialData.scheme,
      capacity: initialData.capacity,
      distance: initialData.distance,
      tarrif: initialData.tarrif,
      land: {
        available_land: initialData.land.available_land,
        land_type: initialData.land.land_type,
      },
      entry_date: initialData.entry_date,
      interest: initialData.interest,
      comment: initialData.comment,
      loi: initialData.loi,
      ppa: initialData.ppa,
      loa: initialData.loa,
      other_remarks: initialData.other_remarks,
      submitted_by: initialData.submitted_by,
      token_money: initialData.token_money,
      group: initialData.group,
      reffered_by: initialData.reffered_by,
      source: initialData.source,
      remark: initialData.remark,
    });

    await followUpData.save();

    // Delete from Initial Collection
    await initialData.deleteOne({ id: id });

    res
      .status(200)
      .json({
        message: "Data moved to FollowUp successfully",
        data: followUpData,
      });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
//get all follow up lead

const getallfollowup = async function (req, res) {
  try {
    const followUpData = await followUpleadMpodells.find();
    res.status(200).json({ data: followUpData });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// inital to warm lead
const initaltowarmup = async function (req, res) {
  try {
    const { id } = req.body;

    // Find Initial Data
    const initialData = await initialbdleadModells.findOne({ id: id });
    if (!initialData) {
      return res.status(404).json({ message: "Data not found" });
    }

    // Check if loi is "Yes"
    if (initialData.ppa !== "Yes" && initialData.loa !== "Yes") {
      return res.status(400).json({
        message: "At least one of PPA or LOA must be Yes",
      });
    }
    

    // Move to FollowUp Collection
    const warmUpData = new warmleadModells({
      id: initialData.id,
      c_name: initialData.c_name,
      email: initialData.email,
      mobile: initialData.mobile,
      alt_mobile: initialData.alt_mobile,
      company: initialData.company,
      village: initialData.village,
      district: initialData.district,
      state: initialData.state,
      scheme: initialData.scheme,
      capacity: initialData.capacity,
      distance: initialData.distance,
      tarrif: initialData.tarrif,
      land: {
        available_land: initialData.land.available_land,
        land_type: initialData.land.land_type,
      },
      entry_date: initialData.entry_date,
      interest: initialData.interest,
      comment: initialData.comment,
      loi: initialData.loi,
      ppa: initialData.ppa,
      loa: initialData.loa,
      other_remarks: initialData.other_remarks,
      submitted_by: initialData.submitted_by,
      token_money: initialData.token_money,
      group: initialData.group,
      reffered_by: initialData.reffered_by,
      source: initialData.source,
      remark: initialData.remark,
    });

    await warmUpData.save();

    // Delete from Initial Collection
    await initialData.deleteOne({ id: id });

    res
      .status(200)
      .json({ message: "Data moved to warmup successfully", data: warmUpData });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// initial to dead lead
const initialtodead = async function (req, res) {
  try {
    const { id } = req.body;

    // Find Initial Data
    const initialData = await initialbdleadModells.findOne({ id: id });
    if (!initialData) {
      return res.status(404).json({ message: "Data not found" });
    }

    // Check if loi is "Yes"
    if (
      initialData.other_remarks.trim() !== "" &&
      initialData.remark.trim() !== ""
    ) {
      return res.status(400).json({ message: "remark is not found" });
    }

    // Move to FollowUp Collection
    const followUpData = new deadleadModells({
      id: initialData.id,
      c_name: initialData.c_name,
      email: initialData.email,
      mobile: initialData.mobile,
      alt_mobile: initialData.alt_mobile,
      company: initialData.company,
      village: initialData.village,
      district: initialData.district,
      state: initialData.state,
      scheme: initialData.scheme,
      capacity: initialData.capacity,
      distance: initialData.distance,
      tarrif: initialData.tarrif,
      land: {
        available_land: initialData.land.available_land,
        land_type: initialData.land.land_type,
      },
      entry_date: initialData.entry_date,
      interest: initialData.interest,
      comment: initialData.comment,
      loi: initialData.loi,
      ppa: initialData.ppa,
      loa: initialData.loa,
      other_remarks: initialData.other_remarks,
      submitted_by: initialData.submitted_by,
      token_money: initialData.token_money,
      group: initialData.group,
      reffered_by: initialData.reffered_by,
      source: initialData.source,
      remark: initialData.remark,
    });

    await followUpData.save();

    // Delete from Initial Collection
    await initialData.deleteOne({ id: id });

    res
      .status(200)
      .json({
        message: "Data moved to FollowUp successfully",
        data: followUpData,
      });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//get all dead lead
const getalldead = async function (req, res) {
  try {
    const deaddata = await deadleadModells.find();
    res.status(200).json({ data: deaddata });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//initial to won

const initialtowon = async function (req, res) {
  try {
    const { id } = req.body;

    // Find Initial Data
    const initialData = await initialbdleadModells.findOne({ id: id });

    if (!initialData.token_money || initialData.token_money.trim() === "") {
      return res.status(400).json({ message: "Token money not received" });
    }

   // Move to FollowUp Collection
    const followUpData = new wonleadModells({
      id: initialData.id,
      c_name: initialData.c_name,
      email: initialData.email,
      mobile: initialData.mobile,
      alt_mobile: initialData.alt_mobile,
      company: initialData.company,
      village: initialData.village,
      district: initialData.district,
      state: initialData.state,
      scheme: initialData.scheme,
      capacity: initialData.capacity,
      distance: initialData.distance,
      tarrif: initialData.tarrif,
      land: {
        available_land: initialData.land.available_land,
        land_type: initialData.land.land_type,
      },
      entry_date: initialData.entry_date,
      interest: initialData.interest,
      comment: initialData.comment,
      loi: initialData.loi,
      ppa: initialData.ppa,
      loa: initialData.loa,
      other_remarks: initialData.other_remarks,
      submitted_by: initialData.submitted_by,
      token_money: initialData.token_money,
      group: initialData.group,
      reffered_by: initialData.reffered_by,
      source: initialData.source,
      remark: initialData.remark,
    });

    await followUpData.save();

    // Delete from Initial Collection
    await initialData.deleteOne({ id: id });

    res
      .status(200)
      .json({
        message: "Data moved to FollowUp successfully",
        data: followUpData,
      });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//get alll won lead
const getallwon = async function (req, res) {
  try {
    const wondata = await wonleadModells.find();
    res.status(200).json({ data: wondata });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//followup to warm, dead, won

const followuptoall = async function (req, res) {
  try {
    const { id } = req.body;

    // Find Follow-Up Data
    const followUpData = await followUpleadMpodells.findOne({ id });
    if (!followUpData) {
      return res.status(404).json({ message: "Data not found" });
    }

    // Validate conditions for moving data
    if (
      followUpData.loi !== "Yes" ||
      (followUpData.ppa !== "Yes" && followUpData.loa !== "Yes")
    ) {
      return res
        .status(400)
        .json({
          message: "LOI must be Yes and at least one of PPA or LOA must be Yes",
        });
    }

    // Move to Warmup Collection
    const warmupData = new warmleadModells({ ...followUpData.toObject() });
    await warmupData.save();
    await followUpData.deleteOne({ id });

    res
      .status(200)
      .json({ message: "Data moved to warmup successfully", data: warmupData });

    // Move to Dead Collection if remark conditions are met
    if (
      followUpData.other_remarks.trim() !== "" &&
      followUpData.remark.trim() !== ""
    ) {
      const deadData = new deadleadModells({ ...followUpData.toObject() });
      await deadData.save();
      await followUpData.deleteOne({ id });
      res
        .status(200)
        .json({ message: "Data moved to dead successfully", data: deadData });
    }

    // Move to Won Collection if token money is valid
    if (followUpData.token_money && followUpData.token_money.trim() !== "") {
      const wonData = new wonleadModells({ ...followUpData.toObject() });
      await wonData.save();
      await followUpData.deleteOne({ id });
      res
        .status(200)
        .json({ message: "Data moved to won successfully", data: wonData });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  initialtofollowup,
  initaltowarmup,
  initialtodead,
  initialtowon,
  getallfollowup,
  getallwon,
  getalldead,
  followuptoall,
};
