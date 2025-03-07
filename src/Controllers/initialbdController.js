const bdModelles =require("../Modells/createBDleadModells");
const initialbdleadModells =require("../Modells/initialBdLeadModells");
const followUpleadMpodells = require("../Modells/followupbdModells");
const initialBdLeadModells = require("../Modells/initialBdLeadModells");
const followUpBdleadModells = require("../Modells/followupbdModells");
const deadleadModells =require("../Modells/deadleadModells");
const warmleadModells =require("../Modells/warmbdLeadModells");
const wonleadModells =require("../Modells/wonleadModells");



// initial to followup lead
const initialtofollowup = async function (req, res) {
    try {
        const { id } = req.body;
    
        // Find Initial Data
        const initialData = await initialbdleadModells.findOne({id: id});
        if (!initialData) {
          return res.status(404).json({ message: "Data not found" });
        }
   
    
        // Check if loi is "Yes"
        if (initialData.loi !== "Yes") {
          return res.status(400).json({ message: "LOI is not Yes, cannot move" });
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
        await initialData.deleteOne({id:id});
    
        res.status(200).json({ message: "Data moved to FollowUp successfully" , data: followUpData });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
  

};

// inital to warm lead
const initaltowarmup = async function (req, res) {
    try {
        const { id } = req.body;
    
        // Find Initial Data
        const initialData = await initialbdleadModells.findOne({id: id});
        if (!initialData) {
          return res.status(404).json({ message: "Data not found" });
        }
   
    
        // Check if loi is "Yes"
        if (initialData.loi !== "Yes" || (initialData.ppa !== "Yes" && initialData.loa !== "Yes")) {
          return res.status(400).json({ message: "LOI must be Yes and at least one of PPA or LOA must be Yes" });
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
        await initialData.deleteOne({id:id});
    
        res.status(200).json({ message: "Data moved to warmup successfully" , data: followUpData });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
};


// initial to dead lead
const initialtodead = async function (req, res) {
    try {
        const { id } = req.body;
    
        // Find Initial Data
        const initialData = await initialbdleadModells.findOne({id: id});
        if (!initialData) {
          return res.status(404).json({ message: "Data not found" });
        }
   
    
        // Check if loi is "Yes"
        if (initialData.other_remarks!== " " && initialData.remark !== " ") {
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
        await initialData.deleteOne({id:id});
    
        res.status(200).json({ message: "Data moved to FollowUp successfully" , data: followUpData });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
};

//initial to won

const initialtowon = async function (req, res) {

    try {
        const { id } = req.body;
    
        // Find Initial Data
        const initialData = await initialbdleadModells.findOne({id: id});
        if (!initialData) {
          return res.status(404).json({ message: "Data not found" });
        }
   
    
        // Check if loi is "Yes"
        if (initialData.token_money!== " ") {
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
        await initialData.deleteOne({id:id});
    
        res.status(200).json({ message: "Data moved to FollowUp successfully" , data: followUpData });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
}


module.exports = { initialtofollowup, initaltowarmup, initialtodead,initialtowon };

