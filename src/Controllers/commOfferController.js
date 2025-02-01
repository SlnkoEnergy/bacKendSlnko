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
            module_type,
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
        module_type,
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
    
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
    
};


// Get all commOffers
const getCommOffer = async function (req, res) {
    try {
        const offers = await conmmOfferModells.find();
        return res.status(200).json(offers);
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
};


//edit commOffer

const editOffer = async function (req, res) {
try {
    let { _id } = req.params;
    let updateData = req.body;
    let data = await conmmOfferModells.findByIdAndUpdate( _id,
      updateData ,
        { new: true }
    );
    if(!data) {
        return res.status(404).json({ msg: "user not found" });
    }
    return res.status(200).json({ msg: "Offer updated successfully", data: data });

} catch (error) {
    return res.status(500).json({ msg: error.message });    
    
}
};

// Delete a commOffer

const deleteOffer = async function (req, res) {
    try {
        let {_id} = req.params;
        let data = await conmmOfferModells.findByIdAndDelete(_id);
        if (!data) {
            return res.status(404).json({ msg: "Offer not found" });
        }
        return res.status(200).json({ msg: "Offer deleted successfully", data:data });
    } catch (error) {
        return res.status(500).json({ msg: error.message });
    }
}

module.exports = {
    createOffer,
    getCommOffer,
    editOffer,  
    deleteOffer,
};