const mongoose = require("mongoose");
const handoversheetSchema = new mongoose.Schema(
  {


    id: { type: String , default:""},


    customer_details: {
      project_id: { type: String },
      project_name: { type: String },
      epc_developer: { type: String },
      site_address_pincode: { type: String },
      site_google_coordinates: { type: String },
      contact_no: { type: String },
      gst_no: { type: String },
      billing_address: { type: String },
    },

    order_details: {
      type_business: { type: String },
      tender_name: { type: String },
      discom_name: { type: String },
      design_date: { type: String },
      
    },

    project_detail:{
        project_type:{type:String},
        module_make_capacity:{type:String},
        module_make:{type:String,default:""},
        module_capacity:{type:String,default:""},
        module_type:{type:String,default:""},
        module_model_no:{type:String,default:""},
        evacuation_voltage:{type:String},
        inverter_make_capacity:{type:String},
        inverter_make:{type:String,default:""},
        inverter_type:{type:String,default:""},
        inverter_size:{type:String,default:""},
        inverter_model_no:{type:String,default:""},
        work_by_slnko:{type:String},
        topography_survey:{type:String},
        soil_test:{type:String},
        purchase_supply_net_meter:{type:String},
        liaisoning_net_metering:{type:String},
        ceig_ceg:{type:String},
        project_completion_date:{type:String},
        proposed_dc_capacity:{type:String},
        transmission_line:{type:String},
        substation_name:{type:String},
        overloading:{type:String},
    },

    commercial_details: {
     type:{type:String},
     subsidy_amount:{type:String},
    },

    attached_details: {
        taken_over_by:{type:String},
        cam_member_name:{type:String},
        loa_number:{type:String},
        ppa_number:{type:String},
        submitted_by_BD: { type: String },
        
  },
  status: {
    type: { type: String, default: "" },
  }
 
    },{ timestamps: true }
);

module.exports = mongoose.model("handoversheet", handoversheetSchema);