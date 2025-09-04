const updateAttachmentUrlStatus = (doc, attachmentField, currentField) => {
  if (!doc.items || !Array.isArray(doc.items)) return;

  doc.items.forEach((item) => {
    const attachments = item[attachmentField];
    if (!attachments || attachments.length === 0) return;

    // Assign the last attachment in the array to currentField
    item[currentField] = attachments[attachments.length - 1];
  });
};

module.exports = updateAttachmentUrlStatus;
