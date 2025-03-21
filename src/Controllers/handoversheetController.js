const hanoversheetmodells= require("../Modells/handoversheetModells");

const createhandoversheet = async function (req,res) {
    try {
        const{customer_details, order_details, project_detail, commercial_details, attached_details }=req.body;
        const handoversheet = new hanoversheetmodells({
            customer_details,
            order_details,
            project_detail,
            commercial_details,
            attached_details,
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

 module.exports = {
     createhandoversheet,
     gethandoversheetdata,
 };
