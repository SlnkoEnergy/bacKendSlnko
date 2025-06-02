const adjustmentRequestModells = require("../Modells/adjustmentRequestModells");

//add adjustment request
const addAdjustmentRequest = async (req, res) => {
  try {
    const {
      p_id,
      pay_id,
      name,
      customer,
      p_group,
      pay_type,
      amount_paid,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      adj_type,
      adj_amount,
      remark,
      adj_date,
      submitted_by,
      comment,
    } = req.body;
    const adjustmentRequest = new adjustmentRequestModells({
      p_id,
      pay_id,
      name,
      customer,
      p_group,
      pay_type,
      amount_paid,
      dbt_date,
      paid_for,
      vendor,
      po_number,
      po_value,
      adj_type,
      remark,
      adj_date,
      adj_amount,
      submitted_by,
      comment,
    });
    await adjustmentRequest.save();
    res
      .status(201)
      .json({
        message: "Adjustment request added successfully",
        adjustmentRequest,
      });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" + error });
  }
};

//get all adjustment request

const getAdjustmentRequest = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const adjustmentRequests = await adjustmentRequestModells
      .find()
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    res.status(200).json(adjustmentRequests);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

//Delete adjustment request

const deleteAdjustmentRequest = async (req, res) => {
  try {
    const { _id } = req.params;
    const adjustmentRequest =
      await adjustmentRequestModells.findByIdAndDelete(_id);
    if (!adjustmentRequest) {
      return res.status(404).json({ message: "Adjustment request not found" });
    }
    res
      .status(200)
      .json({
        message: "Adjustment request deleted successfully",
        data: adjustmentRequest,
      });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addAdjustmentRequest,
  getAdjustmentRequest,
  deleteAdjustmentRequest,
};
