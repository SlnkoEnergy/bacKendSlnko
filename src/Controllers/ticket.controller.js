const projectModel = require("../models/project.model");
const ticketModel = require("../models/ticket.model");
const TicketCounterSchema = require("../models/ticketCounter.controller");

const getProjectByNumber = async (req, res) => {
    try {
        let { number } = req.body;

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
        console.log(number);
        const data = await projectModel.find({ number: number });

        if (!data || data.length === 0) {
            return res.status(404).json({ message: "No projects found for this number" });
        }

        res.status(200).json({
            message: "Projects retrieved successfully",
            data,
        });
    } catch (error) {
        console.error("Error fetching project by number:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};


const createComplaint = async (req, res) => {
    try {
        const {
            project_id,
            description,
            material,
            short_description,
        } = req.body;

        const STATE_CODES = {
            "Andhra Pradesh": "AP",
            "Arunachal Pradesh": "AR",
            "Assam": "AS",
            "Bihar": "BH",
            "Chhattisgarh": "CG",
            "Goa": "GA",
            "Gujarat": "GJ",
            "Haryana": "HR",
            "Himachal Pradesh": "HP",
            "Jharkhand": "JH",
            "Karnataka": "KA",
            "Kerala": "KL",
            "Madhya Pradesh": "MP",
            "Maharashtra": "MH",
            "Manipur": "MN",
            "Meghalaya": "ML",
            "Mizoram": "MZ",
            "Nagaland": "NL",
            "Odisha": "OD",
            "Punjab": "PB",
            "Rajasthan": "RJ",
            "Sikkim": "SK",
            "Tamil Nadu": "TN",
            "Telangana": "TS",
            "Tripura": "TR",
            "Uttar Pradesh": "UP",
            "Uttarakhand": "UK",
            "West Bengal": "WB",
        };

        if (!project_id) {
            return res.status(400).json({ message: "project_id is required" });
        }

        const projectData = await projectModel.findById(project_id).lean();
        if (!projectData) {
            return res.status(404).json({ message: "Project not found" });
        }

        const projectState = (projectData.state || "").trim();
        const stateCode = STATE_CODES[projectState];
        if (!stateCode) {
            return res.status(400).json({ message: `Unknown/unsupported state: ${projectState}` });
        }

        const counter = await TicketCounterSchema.findOneAndUpdate(
            { number: projectData.number },
            { $inc: { count: 1 } },
            { new: true, upsert: true }
        );

        const ticket_id = `Ticket-${stateCode}-${String(counter.count).padStart(3, "0")}`;

        const ticket = new ticketModel({
            project_id,
            description,
            material,
            short_description,
            ticket_id,
        });

        const saved = await ticket.save();
        return res.status(201).json({
            message: "Complaint created",
            data: saved,
        });

    } catch (error) {
        console.error("Error creating complaint:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

const updateTicketStatus = async (req, res) => {
    try {

        const { id } = req.params;
        const { status, remarks } = req.body;

        if (!id) {
            return res.status(404).json({
                message: "ID Not Found",
            });
        }

        if (!status) {
            return res.status(404).json({
                message: "Status is required",
            })
        }

        const ticket = await ticketModel.findById(id);

        if (!ticket) {
            return res.status(404).json({
                message: "Ticket Not Found",
            })
        }

        const newStatusEntry = {
            status,
            remarks,
            user_id: req.user.user_id,
            updatedAt: new Date()
        }

        ticket.current_status = newStatusEntry;

        ticket.status_history.push(newStatusEntry)

        await ticket.save();

        res.status(200).json({
            message: "Ticket Status Updated Successfully",
            data: ticket,
        });

    } catch (error) {

        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
        })
    }
}

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
            sort = "-createdAt"
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        const filter = {};

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), "i");

            filter.$or = [
                { ticket_id: searchRegex },
                { short_description: searchRegex }
            ]
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
            ticketModel.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate({ path: "project_id", select: "name code state site_address" })
                .populate({ path: "material", select: "name" })
                .lean(),

            ticketModel.countDocuments(filter),
        ])

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
            }
        });



    } catch (error) {
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message
        })
    }
};

module.exports = {
    getProjectByNumber,
    createComplaint,
    updateTicketStatus,
    getAllTicket
}