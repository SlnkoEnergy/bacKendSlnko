const hanoversheetmodells = require("../Modells/handoversheetModells");


const createhandoversheet = async function (req, res) {
  try {
    const {
      id,
      p_id,
      customer_details,
      order_details,
      project_detail,
      commercial_details,
      attached_details,
      invoice_detail,
      submitted_by,
    } = req.body;
  
     const handoversheet = new hanoversheetmodells({
      id,
      p_id,
      customer_details,
      order_details,
      project_detail,
      commercial_details,
      attached_details,
      invoice_detail,
      status_of_handoversheet: "draft",
      submitted_by,
    });
    await handoversheet.save();
   

    res.status(200).json({
      message: "Data saved successfully",
      handoversheet,
     
      
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get  bd handover sheet data
const gethandoversheetdata = async function (req, res) {
  try {
    let page = req.query.page ;
    let getbdhandoversheet = await hanoversheetmodells.find().skip((page - 1) * 10).limit(100);
    res
      .status(200)
      .json({ message: "Data fetched successfully", Data: getbdhandoversheet });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//edit handover sheet data
const edithandoversheetdata = async function (req, res) {
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
}};


// update status of handovesheet
const updatestatus = async function (req, res) {
  try {
     const  _id  = req.params._id;
    
     
    
    const { status_of_handoversheet } = req.body;

  

    const updatedHandoversheet = await hanoversheetmodells.findOneAndUpdate(
      { _id: _id },
      { status_of_handoversheet },
      { new: true }
    );

    if (!updatedHandoversheet) {
      return res.status(404).json({ message: "Handoversheet not found" });
    }

    res.status(200).json({
      message: "Status updated successfully",
      Data: updatedHandoversheet,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkid = async function (req, res) {
 try {
    let _id = req.params._id;
   



  let checkid = await hanoversheetmodells.findOne({ _id: _id });
    if (checkid) {
      return res.status(200).json({ status: true });
    } else {
      return res.status(404).json({ status: false });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//get bd handover sheet data by id
const getbyid = async function (req, res) {
  try {
    let id = req.params._id;
    if (!id) {
      return res.status(400).json({ message: "id not found" });
    }
    let getbdhandoversheet = await hanoversheetmodells.findById(id);
    if (!getbdhandoversheet) {
      return res.status(404).json({ message: "Data not found" });
    } 
    res
      .status(200)
      .json({ message: "Data fetched successfully", Data: getbdhandoversheet });
    }catch (error) {   
    res.status(500).json({ message: error.message });
  }};











  


module.exports = {
  createhandoversheet,
  gethandoversheetdata,
  edithandoversheetdata,
  updatestatus,
  checkid,
    getbyid,

 
};
