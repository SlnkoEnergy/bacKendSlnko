const os = require("os");
const axios = require("axios");

async function getSystemIdentifier() {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus().map(cpu => cpu.model).join("-");
  const interfaces = Object.values(os.networkInterfaces()).flat();
  const externalIfaces = interfaces.filter(
    iface => !iface.internal && iface.mac !== "00:00:00:00:00:00"
  );

  const mac = externalIfaces.map(iface => iface.mac).join("-");
  const ip = externalIfaces.map(iface => iface.address).join("-");

  const device_id = `${hostname}-${platform}-${arch}-${cpus}-${mac}-${ip}`;

  return {
    device_id,
    ip
  };
}

module.exports = getSystemIdentifier;
