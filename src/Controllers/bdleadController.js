const lead= require("../Modells/bdleadsModells");

const createlead = async function (req, res) {
  try {
    const leads = await lead.create(req.body);
    res.status(201).json({ message: "Lead created", leads });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const all_bd_lead = async function (req, res) {
  try {
    // Read search params (or empty string if not provided)
    const searchName = req.query.name || '';
    const searchStatus = req.query.current_status || '';
    const searchState = req.query.state || '';
    const searchMobile = req.query.mobile || '';

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Search filter
    const filter = {
      name: { $regex: searchName, $options: 'i' },
      'current_status.name': { $regex: searchStatus, $options: 'i' },
      'address.state': { $regex: searchState, $options: 'i' },
    };

    // For mobile array field
    if (searchMobile) {
      filter['contact_details.mobile'] = { $elemMatch: { $regex: searchMobile, $options: 'i' } };
    }

    // Get leads with filter and pagination
    const leads = await lead.find(filter).skip(skip).limit(limit);

    // Get total count for pagination
    const totalCount = await lead.countDocuments(filter);

    // Return response
    res.status(200).json({
      msg: "All leads data",
      page,
      limit,
      totalCount,
      data: leads
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// get lead by id 

const get_lead_by_id = async function (req,res) {
    try {
        const  _id  = req.params._id;
        const bdleadData = await lead.findById(_id);
        if (!bdleadData) {
        return res.status(404).json({ msg: "Lead not found" });
        }
        res.status(200).json({ msg: "Lead data", data: bdleadData });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

// Update lead by id
const update_lead = async function (req,res) {
    try {
        const  _id  = req.params._id;
        let data = req.body;
        const bdleadData = await lead.findByIdAndUpdate(_id, data, { new: true });
        if (!bdleadData) {
        return res.status(404).json({ msg: "Lead not found" });
        }
        res.status(200).json({ msg: "Lead data updated", data: bdleadData });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    }
};

// Delete lead by id
const delete_lead = async function (req,res) {
    try {
        const  _id  = req.params._id;
        const bdleadData = await lead.findByIdAndDelete(_id);
        if (!bdleadData) {
        return res.status(404).json({ msg: "Lead not found" });
        }
        res.status(200).json({ msg: "Lead data deleted"});
    } catch (error) {
        res.status(500).json({ message: "Internal server error"+ error });
    }
};


  const updateLeadStatus = async function (req, res) {
    try {
    const leads = await lead.findById(req.params._id);
    if (!leads) return res.status(404).json({ error: "Lead not found" });
    leads.status_history.push(req.body);
  
    await leads.save();
    res.status(200).json(leads);
  } catch (err) {
    res.status(400).json({ error: err.message });
    
}}








module.exports = {
  createlead,
  all_bd_lead,
  get_lead_by_id,
  update_lead,
  delete_lead,
  updateLeadStatus
 
 
};