const bosModells =require("../../Modells/EngineeringModells/BOSModells");

const addbos = async function (req,res) {
    try {
        const { category, itemName, rating, technicalSpecification, tentativeMake, status, submittedBy } = req.body;
        const bos = new bosModells({
            category,
            itemName,
            rating,
            technicalSpecification,
            tentativeMake,
            status,
            submittedBy
        });
        await bos.save();
        res.status(200).json({ message: "BOS data added successfully" , data: bos });
    } catch (error) {
        console.error("Error adding BOS data:", error);
        res.status(500).json({ message: "Internal server error" });
    }   
    
};

//get bos modells data
const getbos = async function (req,res) {
    try {
        const bos = await bosModells.find();
        res.status(200).json({msg:"BOS Master Data",data:bos});
    } catch (error) {
        console.error("Error fetching BOS data:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

module.exports={
    addbos,
    getbos,
}