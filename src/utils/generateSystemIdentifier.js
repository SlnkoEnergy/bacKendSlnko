const os = require("os");
const crypto = require("crypto");

function getSystemIdentifier() {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os
    .cpus()
    .map((cpu) => cpu.model)
    .join("-");
  const mac = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => !iface.internal && iface.mac !== "00:00:00:00:00:00")
    .map((iface) => iface.mac)
    .join("-");

  const raw = `${hostname}-${platform}-${arch}-${cpus}-${mac}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = getSystemIdentifier ;
