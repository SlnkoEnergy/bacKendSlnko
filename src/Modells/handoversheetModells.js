const mongoose = require("mongoose");
const handoversheetSchema = new mongoose.Schema(
  {


    id: { type: String , default:""},
    p_id: { type: Number, default:" " },


    customer_details: {
      // project_id: { type: String },
      code: { type: String },
      // project_name: { type: String },
      name: { type: String },
      customer: { type: String, default:" " },
      
      epc_developer: { type: String },
    // site_address_pincode: { type: String },//repalce with site_address
      site_google_coordinates: { type: String },
      // contact_no: { type: String },
      number: { type: Number },
      gst_no: { type: String },
      // billing_address: { type: String },//repalce with billing_address
      gender_of_Loa_holder: { type: String },
      email: { type: String },
      pan_no: { type: String },
      adharNumber_of_loa_holder: { type: String },
      // alt_contact_no: { type: String },
      alt_number: { type: Number },
      p_group: { type: String },
       
    billing_address: {
      village_name: {
        type: String,
      },
      district_name: {
        type: String,
      },
    },

    site_address: {
      village_name: {
        type: String,
      },
      district_name: {
        type: String,
      },
    },
    state: { type: String },
    },

    order_details: {
      type_business: { type: String },
      tender_name: { type: String },
      discom_name: { type: String },
      design_date: { type: String },
      feeder_code: { type: String },
      feeder_name: { type: String },
      
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
        // transmission_line:{type:String}, // replace with distance
        project_kwp: { type: String },
        distance: { type: String },
        tarrif: { type: String },
        land: { type: String },
        
        substation_name:{type:String},
        overloading:{type:String},
       // proposed_ac_capacity:{type:String},replace with project_kwp
        agreement_date:{type:String},
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
        service: { type: String },
        billing_type: {
          type: String,
        },
        project_status: { type: String },
        
  },
   invoice_detail: {
    
    invoice_recipient: {type: String},
    invoicing_GST_no: {type: String},
    invoicing_address: {type: String},
    delivery_address: {type: String},
  },
    status_of_handoversheet: { type: String, default: "done" },
    submitted_by: { type: String,default:"" },

 
    },{ timestamps: true }
);

module.exports = mongoose.model("handoversheet", handoversheetSchema);