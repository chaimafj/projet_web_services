require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();
const inMemoryIncidents = [];
let nextIncidentId = 1;
const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    req.user = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || "change-me");
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

const incidentSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  zoneName: z.string().min(2),
  type: z.enum(["ACCIDENT", "ROADWORK", "ROAD_CLOSED", "TRAFFIC_JAM"])
});

const statusSchema = z.object({
  status: z.enum(["REPORTED", "IN_PROGRESS", "RESOLVED"])
});

app.get("/health", (req, res) => {
  res.json({ service: "incident-service", status: "ok" });
});

async function createIncident(data) {
  try {
    return await prisma.incident.create({ data });
  } catch (error) {
    const incident = {
      id: nextIncidentId++,
      title: data.title,
      description: data.description,
      zoneName: data.zoneName,
      type: data.type,
      status: "REPORTED",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    inMemoryIncidents.push(incident);
    return incident;
  }
}

async function listIncidents() {
  try {
    return await prisma.incident.findMany({ orderBy: { id: "desc" } });
  } catch (error) {
    return [...inMemoryIncidents].sort((left, right) => right.id - left.id);
  }
}

async function findIncidentById(id) {
  try {
    return await prisma.incident.findUnique({ where: { id } });
  } catch (error) {
    return inMemoryIncidents.find((incident) => incident.id === id) || null;
  }
}

async function updateIncidentStatus(id, status) {
  try {
    return await prisma.incident.update({
      where: { id },
      data: { status }
    });
  } catch (error) {
    const incident = inMemoryIncidents.find((item) => item.id === id);
    if (!incident) {
      return null;
    }

    incident.status = status;
    incident.updatedAt = new Date();
    return incident;
  }
}

app.post("/incidents", requireAuth, async (req, res, next) => {
  try {
    const payload = incidentSchema.parse(req.body);
    const incident = await createIncident(payload);
    return res.status(201).json(incident);
  } catch (error) {
    next(error);
  }
});

app.get("/incidents", requireAuth, async (req, res, next) => {
  try {
    const incidents = await listIncidents();
    return res.json(incidents);
  } catch (error) {
    next(error);
  }
});

app.patch("/incidents/:id/status", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = statusSchema.parse(req.body);

    const incident = await findIncidentById(id);
    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const updated = await updateIncidentStatus(id, payload.status);
    if (!updated) {
      return res.status(404).json({ message: "Incident not found" });
    }

    return res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", issues: err.issues });
  }

  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
});

const port = Number(process.env.PORT || 4004);
app.listen(port, () => {
  console.log(`Incident service listening on ${port}`);
});
