const conmmOfferModells =require("../Modells/commOfferModells");


// Create a new commOffer
const createOffer = async function (req,res) {
    try {
        const {
            offer_id,
            client_name,
            village,
            district,
            state,
            pincode,
            ac_capacity,
            dc_capacity,
            scheme,
            component,
            rate,
            timeline,
            module_capacity,
            inverter_capacity,
            evacuation_voltage,
            module_orientation,
            transmission_length,
            transformer,
            column_type,
            prepared_by,
            dc_overloading,
        } = req.body;

        const lastOffer = await conmmOfferModells.findOne().sort({ offer_id: -1 });

        let nextOfferId;
        if (lastOffer && lastOffer.offer_id) {
            // Extract number part from last offer_id (e.g., "comm/offer/00001" -> "00001")
            const lastNumber = parseInt(lastOffer.offer_id.split("/").pop(), 10);
            const nextNumber = (lastNumber + 1).toString().padStart(5, "0"); // Ensures 5-digit format
            nextOfferId = `comm/offer/${nextNumber}`;
        } else {
            nextOfferId = "comm/offer/00001"; // First ID if no records exist
        }


     

        
    // if(existingOffer){
        const createOffer = new conmmOfferModells({
        offer_id: nextOfferId,
        client_name,
        village,
        district,
        state,
        pincode,
        ac_capacity,
        dc_capacity,
        scheme,
        component,
        rate,
        timeline,
        module_capacity,
        inverter_capacity,
        evacuation_voltage,
        module_orientation,
        transmission_length,
        transformer,
        column_type,
        prepared_by,
        dc_overloading,
        });
        const newOffer = await createOffer.save();
        return res.status(200).json(newOffer);
    // } else {
    //     return res.status(400).json({ msg: "Offer ID already exists. Please provide a new Offer ID." });
    // }
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
    
};

const getCommOffer = async function (req, res) {
    try {
        const offers = await conmmOfferModells.find();
        return res.status(200).json(offers);
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};

module.exports = {
    createOffer,
    getCommOffer,
};