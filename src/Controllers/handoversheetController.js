const hanoversheetmodells= require("../Modells/handoversheetModells");
const projectModels =require("../Modells/projectModells");

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
         // Auto-generate p_id by finding the latest project
    const latestProject = await projectModels.findOne().sort({ p_id: -1 });
    const newPid = latestProject && latestProject.p_id ? latestProject.p_id + 1 : 1;

    // Save to projectmodells
    const projectData = new projectModels({
      p_id: newPid,
      customer: customer_details?.customer || "",
      name: customer_details?.name || "",
      p_group: customer_details?.p_group || "",
      email: customer_details?.email || "",
      number: customer_details?.number || "",
      alt_number: customer_details?.alt_number || "",
      billing_address: {
        village_name: customer_details?.billing_address?.village_name || "",
        district_name: customer_details?.billing_address?.district_name || "",
      },
      site_address: {
        village_name: customer_details?.site_address?.village_name || "",
        district_name: customer_details?.site_address?.district_name || "",
      },
      state: customer_details?.state || "",
      project_category: project_detail?.project_category || "",
      project_kwp: project_detail?.project_kwp || "",
      distance: project_detail?.distance || "",
      tarrif: project_detail?.tarrif || "",
      land: project_detail?.land || "",
      code: customer_details?.code || "",
      project_status: "",
      updated_on: new Date().toISOString(),
      service: attached_details?.service || "",
      submitted_by: req?.user?.name , // Adjust based on your auth
      billing_type: attached_details?.billing_type || "",
    });

    await projectData.save();

    res.status(200).json({
      message: "Data saved successfully",
      handoversheet,
      project: projectData,
    });
    
        
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
