const purchaseRequest = require("../Modells/PurchaseRequest/purchaseRequest");

const statusPriority = {
  draft: 0,
  po_created: 1,
  out_for_delivery: 2,
  delivered: 3,
};

async function updatePurchaseRequestStatus(doc, statusHistoryKey = "status_history", currentStatusKey = "current_status") {
  if (!doc) return;

  const history = doc[statusHistoryKey];
  if (history && history.length > 0) {
    doc[currentStatusKey] = history[history.length - 1];
  } else {
    doc[currentStatusKey] = {
      status: "draft",
      remarks: "",
      user_id: null,
    };
  }

  const prId = doc.pr_id;
  if (!prId) return;

  try {
    const PurchaseOrder = require("../Modells/purchaseOrderModells");

    // Fetch all related POs for the given PR
    const relatedPOs = await PurchaseOrder.find({ pr_id: prId });

    // --- 1. Update individual item status inside `items[]` of PurchaseRequest ---
    const prDoc = await purchaseRequest.findById(prId);
    if (prDoc && Array.isArray(prDoc.items)) {
      const updatedItems = prDoc.items.map((item) => {
        const poForItem = relatedPOs.filter(po =>
          po.item && po.item.toString() === item.item_id.toString()
        );
        if (poForItem.length > 0) {
          const itemStatuses = poForItem.map(po => po.current_status?.status || "draft");
          const uniqueItemStatuses = [...new Set(itemStatuses)];

          if (uniqueItemStatuses.length === 1) {
            return {
              ...item,
              status: `fully_${uniqueItemStatuses[0]}`
            };
          } else {
            const maxStatus = itemStatuses.reduce((a, b) =>
              statusPriority[a] > statusPriority[b] ? a : b
            );
            return {
              ...item,
              status: `partially_${maxStatus}`
            };
          }
        }
        return item; // unchanged if no matching PO found
      });

      prDoc.items = updatedItems;
      await prDoc.save();
    }

    // --- 2. Update main status field ---
    const statuses = relatedPOs.map(po => po.current_status?.status || "draft");
    const uniqueStatuses = [...new Set(statuses)];

    let finalStatus = "";
    if (uniqueStatuses.length === 1) {
      finalStatus = `fully_${uniqueStatuses[0]}`;
    } else {
      let maxStatus = statuses.reduce((a, b) =>
        statusPriority[a] > statusPriority[b] ? a : b
      );
      finalStatus = `partially_${maxStatus}`;
    }

    await purchaseRequest.findByIdAndUpdate(prId, { status: finalStatus });

  } catch (err) {
    console.error("Error updating purchaseRequest status:", err);
  }
}

module.exports = updatePurchaseRequestStatus;
