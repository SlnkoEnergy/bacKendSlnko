const mongoose = require("mongoose");
const handoversheetSchema = new mongoose.Schema(
  {
    id: { type:String},
    p_id: { type: Number, default: " ", },

    customer_details: {
      code: { type: String },
      name: { type: String, required: true },
      customer: { type: String, default: " ", required: true },
      epc_developer: { type: String, required: true },
      site_address: {
        village_name: { type: String  },
        district_name: { type: String  },
      },
      number: { type: Number, required: true },
      p_group: { type: String },
      state: { type: String, required: true },
      alt_number: { type: Number },
     
      email: { type: String },
      pan_no: { type: String },
      adharNumber_of_loa_holder: { type: String },
    },

    order_details: {
      type_business: { type: String, required: true },
      discom_name: { type: String },
      design_date: { type: String },
      feeder_code: { type: String },
      feeder_name: { type: String },
    },
    
    project_detail: {
      project_component: {
        type: String,
       
      },
      project_component_other: {
        type: String,
      },
      project_type: { type: String, required: true },
      module_type: { type: String, },
      module_capacity: { type: String},
      evacuation_voltage: { type: String },
      work_by_slnko: { type: String, required: true },
      liaisoning_net_metering: { type: String, required: true },
      ceig_ceg: { type: String, required: true },
      proposed_dc_capacity: { type: String, required: true },
      distance: { type: String, required: true },
      overloading: { type: String, required: true },
      project_kwp: { type: String, required: true },
      transmission_scope: { type: String, required: true },
      loan_scope: { type: String, required: true },
      
      module_make_capacity: { type: String, },
      module_make: { type: String,  },
      module_category: { type: String },
      inverter_make_capacity: { type: String,},
      inverter_make: { type: String, },
      inverter_type: { type: String, },
      topography_survey: { type: String },
      purchase_supply_net_meter: { type: String },
      project_completion_date: { type: String},
      tarrif: { type: String },
      land: { type: String },
      agreement_date: { type: String },
    },
    
    commercial_details: {
      type: { type: String, required: true }},
      
      other_details: {
        cam_member_name: { type: String},
        loa_number: { type: String },
        ppa_number: { type: String },
        submitted_by_BD: { type: String },
        service: { type: String, required: true },
        slnko_basic: { type: String, required: true },
        billing_type: {
          type: String,
        },
        project_status: { type: String },
        remark: { type: String, required: true },
        remarks_for_slnko: { type: String, required: true },
      },
      invoice_detail: {
        invoice_recipient: { type: String },
        invoicing_GST_no: { type: String },
        invoicing_address: { type: String },
      delivery_address: { type: String },
      msme_reg: { type: String },
    },
    status_of_handoversheet: { type: String, default: " " },
    submitted_by: { type: String, default: "" },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("handoversheet", handoversheetSchema);
