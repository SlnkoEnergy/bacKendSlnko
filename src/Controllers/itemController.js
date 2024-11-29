const itemModells = require( "../Modells/iteamModells");



const additem = async function (req,res) {
    let d = req.body;
    let data = await itemModells.create(d);
    res.status(200).json({msg:"item created",data});
    
}

module.exports={
    additem,
}

