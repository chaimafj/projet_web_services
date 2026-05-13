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

const zoneSchema = z.object({
  name: z.string().min(2),
  maxCapacity: z.number().int().positive()
});

const densitySchema = z.object({
  currentCount: z.number().int().nonnegative()
});

function classifyTraffic(currentCount, maxCapacity) {
  const ratio = maxCapacity === 0 ? 0 : currentCount / maxCapacity;
  if (ratio < 0.4) return "LOW";
  if (ratio < 0.8) return "MEDIUM";
  return "HIGH";
}

app.get("/health", (req, res) => {
  res.json({ service: "traffic-service", status: "ok" });
});

app.post("/traffic/zones", requireAuth, async (req, res, next) => {
  try {
    const payload = zoneSchema.parse(req.body);
    const zone = await prisma.zone.create({ data: payload });
    return res.status(201).json(zone);
  } catch (error) {
    next(error);
  }
});

app.post("/traffic/zones/:id/measure", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = densitySchema.parse(req.body);
    const zone = await prisma.zone.findUnique({ where: { id } });

    if (!zone) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const trafficLevel = classifyTraffic(payload.currentCount, zone.maxCapacity);

    const updated = await prisma.zone.update({
      where: { id },
      data: {
        currentCount: payload.currentCount,
        trafficLevel
      }
    });

    return res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.get("/traffic/zones", requireAuth, async (req, res, next) => {
  try {
    const zones = await prisma.zone.findMany({ orderBy: { id: "desc" } });
    return res.json(zones);
  } catch (error) {
    next(error);
  }
});

app.get("/traffic/congested", requireAuth, async (req, res, next) => {
  try {
    const zones = await prisma.zone.findMany({ where: { trafficLevel: "HIGH" } });
    return res.json(zones);
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

const port = Number(process.env.PORT || 4003);
app.listen(port, () => {
  console.log(`Traffic service listening on ${port}`);
});
