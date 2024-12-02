const itemModells = require( "../Modells/iteamModells");



const additem = async function (req,res) {
    let d = req.body;
    let data = await itemModells.create(d);
    res.status(200).json({msg:"item created",data});
    
};
const getItem =async function (req,res) {
    let d= await itemModells.find();
    res.status(200).json({msg:"item",getItem})    
}

module.exports={
    additem,
    getItem,
}

