const invetermasterModells =require("../Modells/inveterMasterModells");


const addinveterMaster = async function (req, res) {
    try {
        const {
            inveter_model,
            inveter_size,
            inveter_type,
            inveter_make,
            max_pv_input_voltage,
            mpp_voltage_range,
            mppt,
            pre_mppt_input,
            total_input,
            max_pv_input_current_per_mppt,
            max_dc_short_circuit_current_per_mppt,
            ac_output_power,
            max_ac_output_current,
            nominal_ac_voltage,
            status,
            submitted_by
        } = req.body;

        const newInverter = new invetermasterModells({
            inveter_model,
            inveter_size,
            inveter_type,
            inveter_make,
            max_pv_input_voltage,
            mpp_voltage_range,
            mppt,
            pre_mppt_input,
            total_input,
            max_pv_input_current_per_mppt,
            max_dc_short_circuit_current_per_mppt,
            ac_output_power,
            max_ac_output_current,
            nominal_ac_voltage,
            status,
            submitted_by
        });

        const savedInverter = await newInverter.save();
        res.status(200).json({ msg:"master inveter added sucessfilly" ,data:savedInverter});
        

    } catch (error) {   
        res.status(500).json({ message: error.message });
        
    }
};

//get all inveter master data
const getinveterMasterdata = async function (req, res) {
    try {
        let getinveterMaster = await invetermasterModells.find();
        res.status(200).json({ message: "Data fetched successfully", data: getinveterMaster });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
module.exports = {
    addinveterMaster,
    getinveterMasterdata,
}