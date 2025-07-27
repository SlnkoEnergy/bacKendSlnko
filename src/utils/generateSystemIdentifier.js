
async function getSystemIdentifier() {
   let device_id = req.cookies.device_id;
  if (!device_id) {
    device_id = uuidv4();
    res.cookie("device_id", device_id, { httpOnly: true, maxAge: 31536000000 });
  }
  
  const externalIfaces = interfaces.filter(
    iface => !iface.internal && iface.mac !== "00:00:00:00:00:00"
  );

  const ip = externalIfaces.map(iface => iface.address).join("-");

  return {
    device_id,
    ip
  };
}

module.exports = getSystemIdentifier;
