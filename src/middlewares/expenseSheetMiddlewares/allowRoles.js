const allowRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      console.log('Access denied. User role:', userRole);
      return res.status(403).json({ message: "Access denied. Please check your role." });
    }
    next();
  };
};

module.exports = allowRoles