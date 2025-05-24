const mongoose = require("mongoose");
const handoversheetSchema = new mongoose.Schema(
  {
    id: { type:String},
    p_id: { type: Number, default: " ", },

    customer_details: {
      code: { type: String },
      name: { type: String },
      customer: { type: String, default: " " },
      epc_developer: { type: String },
      site_address: {
        village_name: { type: String  },
        district_name: { type: String  },
      },
      number: { type: Number },
      p_group: { type: String },
      state: { type: String },
      alt_number: { type: Number },
     
      email: { type: String },
      pan_no: { type: String },
      adharNumber_of_loa_holder: { type: String },
    },

    order_details: {
      type_business: { type: String },
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
      project_type: { type: String },
      module_type: { type: String, },
      module_capacity: { type: String},
      evacuation_voltage: { type: String },
      work_by_slnko: { type: String },
      liaisoning_net_metering: { type: String },
      ceig_ceg: { type: String },
      proposed_dc_capacity: { type: String },
      distance: { type: String },
      overloading: { type: String },
      project_kwp: { type: String },
      transmission_scope: { type: String },
      loan_scope: { type: String },
      
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
      type: { type: String }},
      
      other_details: {
        cam_member_name: { type: String},
        loa_number: { type: String },
        ppa_number: { type: String },
        submitted_by_BD: { type: String },
        service: { type: String },
        slnko_basic: { type: String },
        billing_type: {
          type: String,
        },
        project_status: { type: String },
        remark: { type: String },
        remarks_for_slnko: { type: String },
        total_gst: { type: String },
      },
      invoice_detail: {
        invoice_recipient: { type: String },
        invoicing_GST_no: { type: String },
        invoicing_address: { type: String },
      delivery_address: { type: String },
      msme_reg: { type: String },
      invoicing_GST_status: { type: String },
    },
    status_of_handoversheet: { type: String, default: " " },
    submitted_by: { type: String, default: "" },
    comment: { type: String, default: "" },
    is_locked: { type: String, default: "locked" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("handoversheet", handoversheetSchema);
