require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();
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

app.post("/incidents", requireAuth, async (req, res, next) => {
  try {
    const payload = incidentSchema.parse(req.body);
    const incident = await prisma.incident.create({ data: payload });
    return res.status(201).json(incident);
  } catch (error) {
    next(error);
  }
});

app.get("/incidents", requireAuth, async (req, res, next) => {
  try {
    const incidents = await prisma.incident.findMany({ orderBy: { id: "desc" } });
    return res.json(incidents);
  } catch (error) {
    next(error);
  }
});

app.patch("/incidents/:id/status", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = statusSchema.parse(req.body);

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: { status: payload.status }
    });

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
