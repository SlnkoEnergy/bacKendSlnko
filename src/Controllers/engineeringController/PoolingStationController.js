const poolingModells = require("../../Modells/EngineeringModells/PoolingStationModells");


//add pooling station
const addPoolingStation = async (req, res) => {
  try {
    const { category, itemName, rating, technicalSpecification, status, submittedBy } = req.body;

    const newPoolingStation = new poolingModells({
      category,
      itemName,
      rating,
      technicalSpecification,
      status,
      submittedBy
    });

    await newPoolingStation.save();
    res.status(201).json({ message: "Pooling Station added successfully", data: newPoolingStation });
  } catch (error) {
    res.status(500).json({ message: "Error adding Pooling Station", error: error.message });
  }
};


//get all pooling stations
const getAllPoolingStations = async (req, res) => {
  try {
    const poolingStations = await poolingModells.find();
    res.status(200).json({ message: "Pooling Stations retrieved successfully", data: poolingStations });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving Pooling Stations", error: error.message });
  }
};

module.exports = { 
    addPoolingStation,
    getAllPoolingStations
};