const hanoversheetmodells= require("../Modells/handoversheetModells");

const createhandoversheet = async function (req,res) {
    try {
        const{id,customer_details, order_details, project_detail, commercial_details, attached_details}=req.body;
        // const { loa_number, ppa_number } = attached_details;

        // Update the query to properly access the fields in attached_details
        let checkid = await hanoversheetmodells.findOne({ id:id});

        // If a document with the same id and matching loa/ppa exists, return an error
        if (checkid) {
            return res.status(400).json({ message: " lead id already exists " });
        }
        
        const handoversheet = new hanoversheetmodells({
            id,
            customer_details,
            order_details,
            project_detail,
            commercial_details,
            attached_details,
            status_of_handoversheet:"done", 
        });
        await handoversheet.save();
        res.status(200).json({message:"Data saved successfully",Data:handoversheet});
        
    } catch (error) {
        res.status(500).json({message:error.message});
        
    }
    
};
const gethandoversheetdata = async function (req,res) {
    try {
        let gethandoversheet = await hanoversheetmodells.find();
        res.status(200).json({message:"Data fetched successfully",Data:gethandoversheet});
        
    } catch (error) {
        res.status(500).json({message:error.message});
        
    }
    
};

//edit handover sheet data
const edithandoversheetdata = async function (req,res) {
    try {
        let id=req.params._id;
        let data= req.body;
        if(!id){
            res.status(400).json({message:"id not found"});
        }
        let edithandoversheet = await hanoversheetmodells.findByIdAndUpdate(id,data,{new:true});
        res.status(200).json({message:"hand over sheet edited  successfully",Data:edithandoversheet});
    } catch (error) {
        res.status(500).json({message:error.message});
        
    }
};

 module.exports = {
     createhandoversheet,
     gethandoversheetdata,
     edithandoversheetdata,
 };
