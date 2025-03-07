const bdModelles =require("../Modells/createBDleadModells");
const initialbdleadModells =require("../Modells/initialBdLeadModells");
const followUpleadMpodells = require("../Modells/followupbdModells");
const initialBdLeadModells = require("../Modells/initialBdLeadModells");

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
        });
       
    
        await followUpData.save();
    
        // Delete from Initial Collection
        await initialData.deleteOne({id:id});
    
        res.status(200).json({ message: "Data moved to FollowUp successfully" , data: followUpData });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
  

};

module.exports = { initialtofollowup };

