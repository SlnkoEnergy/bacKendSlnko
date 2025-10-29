const { default: mongoose } = require("mongoose");
const projectModel = require("../models/project.model");
const ticketModel = require("../models/ticket.model");
const tasksModells = require("../models/task.model");
const TicketCounterSchema = require("../models/ticketCounter.controller");
const FormData = require("form-data");
const axios = require("axios");
const materialcategoryModel = require("../models/materialcategory.model");
const getProjectByNumber = async (req, res) => {
  try {
    let { number } = req.query;

    if (!number) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    number = String(number).trim();

    number = number.replace(/\s|[-()]/g, "");

    if (number.startsWith("+91")) {
      number = number.slice(3);
    } else if (number.startsWith("91") && number.length === 12) {
      number = number.slice(2);
    }

    if (number.length !== 10) {
      return res.status(400).json({ message: "Invalid mobile number format" });
    }

    const data = await projectModel
      .find({ number: String(number) })
      .select("name _id")
      .lean();

    if (!data || data.length === 0) {
      return res
        .status(404)
        .json({ message: "No projects found for this number" });
    }

    res.status(200).json({
      message: "Projects retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching project by number:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const createComplaint = async (req, res) => {
  try {
    const { project_id, material, short_description, description } = req.body;

    if (!project_id)
      return res.status(400).json({ message: "project_id is required" });

    const projectData = await projectModel.findById(project_id).lean();
    if (!projectData)
      return res.status(404).json({ message: "Project not found" });

    const STATE_CODES = {
      "Andhra Pradesh": "AP",
      "Arunachal Pradesh": "AR",
      Assam: "AS",
      Bihar: "BH",
      Chhattisgarh: "CG",
      Goa: "GA",
      Gujarat: "GJ",
      Haryana: "HR",
      "Himachal Pradesh": "HP",
      Jharkhand: "JH",
      Karnataka: "KA",
      Kerala: "KL",
      "Madhya Pradesh": "MP",
      Maharashtra: "MH",
      Manipur: "MN",
      Meghalaya: "ML",
      Mizoram: "MZ",
      Nagaland: "NL",
      Odisha: "OD",
      Punjab: "PB",
      Rajasthan: "RJ",
      Sikkim: "SK",
      "Tamil Nadu": "TN",
      Telangana: "TS",
      Tripura: "TR",
      "Uttar Pradesh": "UP",
      Uttarakhand: "UK",
      "West Bengal": "WB",
    };
    const stateCode = STATE_CODES[(projectData.state || "").trim()];
    if (!stateCode) {
      return res
        .status(400)
        .json({ message: `Unknown/unsupported state: ${projectData.state}` });
    }

    const counter = await TicketCounterSchema.findOneAndUpdate(
      { state: projectData.state },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );
    const ticket_id = `T${stateCode}${String(counter.count).padStart(3, "0")}`;

    // ---------------- file uploads ----------------
    const files = Array.isArray(req.files) ? req.files : [];

    const folderPath = `Complaint/${ticket_id}`;
    const uploadedFileMap = {};
    let count = 0;

    for (const file of files) {
      count++;
      const form = new FormData();

      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const uploadUrl = `${process.env.UPLOAD_API}?containerName=protrac&foldername=${folderPath}`;

      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const respData = response.data;
      const url =
        Array.isArray(respData) && respData.length > 0
          ? respData[0]
          : respData.url ||
          respData.fileUrl ||
          (respData.data && respData.data.url) ||
          null;

      if (url) {
        uploadedFileMap[count] = url;
      } else {
        console.warn(`No URL found for uploaded file ${file.originalname}`);
      }
    }

    const documents = Object.values(uploadedFileMap).map((url) => ({
      attachment_url: url,
    }));

    const attachments = Object.values(uploadedFileMap).map((url) => ({
      url,
      updatedAt: new Date,

    }))

    const categoryData = await materialcategoryModel.findById(material).select("name");
    // ---------------- create ticket ----------------
    const ticket = new ticketModel({
      project_id,
      description,
      material,
      short_description,
      ticket_id,
      documents,
      number: projectData.number
    });

    const task = new tasksModells({
      taskCode: ticket_id,
      title: categoryData.name,
      type: "complaint",
      description: short_description,
      project_id,
      priority: "1",
      comments: [
        {
          remarks: description,
          user_id: new mongoose.Types.ObjectId("6839a4086356310d4e15f6fd"),
        },
      ],
      attachments,
      assigned_to: [new mongoose.Types.ObjectId("6839a4086356310d4e15f6fd")], // ✅ array
    });


    await task.save();
    const saved = await ticket.save();

    return res
      .status(201)
      .json({ message: "Complaint Register Successfully", data: saved });
  } catch (error) {
    console.error("Error creating complaint:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const updateTicketStatus = async (req, res) => {
  try {
    const { _id } = req.params;
    const { status, remarks } = req.body;
    console.log(_id);

    if (!_id) {
      return res.status(404).json({
        message: "ID Not Found",
      });
    }

    if (!status) {
      return res.status(404).json({
        message: "Status is required",
      });
    }

    const ticket = await ticketModel.findById(_id);

    if (!ticket) {
      return res.status(404).json({
        message: "Ticket Not Found",
      });
    }

    const newStatusEntry = {
      status,
      remarks,
      user_id: req.user.user_id,
      updatedAt: new Date(),
    };

    ticket.current_status = newStatusEntry;

    ticket.status_history.push(newStatusEntry);

    await ticket.save();

    res.status(200).json({
      message: "Ticket Status Updated Successfully",
      data: ticket,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllTicket = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      from = "",
      to = "",
      material = "",
      sort = "-createdAt",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");

      filter.$or = [
        { ticket_id: searchRegex },
        { short_description: searchRegex },
      ];
    }

    if (status && status.trim()) {
      filter["current_status.status"] = status.trim();
    }

    if (material && material.trim()) {
      filter.material = material;
    }

    const range = {};

    const parseDate = (v) => {
      const d = new Date(v);

      return isNaN(d.getTime()) ? null : d;
    };

    const fromDate = from ? parseDate(from) : null;
    const toDate = to ? parseDate(to) : null;

    if (fromDate) range.$gte = fromDate;
    if (toDate) {
      const end =
        to.length <= 10
          ? new Date(new Date(to).setHours(23, 59, 59, 999))
          : toDate;
      range.$lte = end;
    }
    if (Object.keys(range).length) {
      filter.createdAt = range;
    }

    const [items, total] = await Promise.all([
      ticketModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate({
          path: "project_id",
          select: "name code state site_address",
        })
        .populate({ path: "material", select: "name" })
        .lean(),

      ticketModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      message: "Tickets retrived Successfully",
      data: items,
      meta: {
        page,
        totalPages,
        limit,
        total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getTicketByTicketNo = async (req, res) => {
  try {
    const raw = String(req.query.raw || "").trim();
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Please provide the 'raw' parameter (ticket id or phone number).",
      });
    }

    // --- normalize phone-like inputs ---
    const onlyDigits = raw.replace(/[^\d]/g, ""); // strip non-digits
    let normalizedPhone = onlyDigits;

    // remove India country code if present (supports +91 / 91)
    if (normalizedPhone.startsWith("91") && normalizedPhone.length >= 12) {
      normalizedPhone = normalizedPhone.slice(2);
    }
    // now normalizedPhone might be 10 digits if it's a mobile number

    // --- detect whether raw looks like a ticket id ---
    // Ticket ID heuristic: starts with T- (case-insensitive) or has letters + dashes
    const looksLikeTicketId =
      /^[Tt]-/.test(raw) ||
      /^[A-Za-z].*[-_].*$/.test(raw); // lax fallback, adjust if needed

    // Build query
    let query = {};
    if (looksLikeTicketId) {
      // Case-insensitive exact match for ticket_id
      query = { ticket_id: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    } else if (normalizedPhone.length === 10) {
      // Phone search: support number stored as Number or String
      const asNumber = Number(normalizedPhone);
      query = {
        $or: [{ number: asNumber }, { number: normalizedPhone }],
      };
    } else {
      // Fallback: try an OR on both fields
      const asNumber = Number(onlyDigits);
      query = {
        $or: [
          { ticket_id: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          ...(Number.isFinite(asNumber) && onlyDigits
            ? [{ number: asNumber }, { number: onlyDigits }]
            : []),
        ],
      };
    }

    const tickets = await ticketModel
      .find(query)
      .populate({ path: "project_id", select: "name" })
      .populate({ path: "material", select: "name" })
      .sort({ updatedAt: -1 });

    if (!tickets || tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No tickets found for the provided input.",
        data: [],
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket(s) fetched successfully.",
      data: tickets,
    });
  } catch (error) {
    console.error("Error in getTicketByNo:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

module.exports = {
  getProjectByNumber,
  createComplaint,
  updateTicketStatus,
  getAllTicket,
  getTicketByTicketNo,
};
