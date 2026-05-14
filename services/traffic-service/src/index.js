require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();
const inMemoryZones = [];
let nextZoneId = 1;
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

async function createZone(data) {
  try {
    return await prisma.zone.create({ data });
  } catch (error) {
    const zone = {
      id: nextZoneId++,
      name: data.name,
      maxCapacity: data.maxCapacity,
      currentCount: 0,
      trafficLevel: "LOW",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    inMemoryZones.push(zone);
    return zone;
  }
}

async function findZoneById(id) {
  try {
    return await prisma.zone.findUnique({ where: { id } });
  } catch (error) {
    return inMemoryZones.find((zone) => zone.id === id) || null;
  }
}

async function updateZoneDensity(id, currentCount, trafficLevel) {
  try {
    return await prisma.zone.update({
      where: { id },
      data: {
        currentCount,
        trafficLevel
      }
    });
  } catch (error) {
    const zone = inMemoryZones.find((item) => item.id === id);
    if (!zone) {
      return null;
    }

    zone.currentCount = currentCount;
    zone.trafficLevel = trafficLevel;
    zone.updatedAt = new Date();
    return zone;
  }
}

async function listZones() {
  try {
    return await prisma.zone.findMany({ orderBy: { id: "desc" } });
  } catch (error) {
    return [...inMemoryZones].sort((left, right) => right.id - left.id);
  }
}

async function listCongestedZones() {
  try {
    return await prisma.zone.findMany({ where: { trafficLevel: "HIGH" } });
  } catch (error) {
    return inMemoryZones.filter((zone) => zone.trafficLevel === "HIGH");
  }
}

app.post("/traffic/zones", requireAuth, async (req, res, next) => {
  try {
    const payload = zoneSchema.parse(req.body);
    const zone = await createZone(payload);
    return res.status(201).json(zone);
  } catch (error) {
    next(error);
  }
});

app.post("/traffic/zones/:id/measure", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const payload = densitySchema.parse(req.body);
    const zone = await findZoneById(id);

    if (!zone) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const trafficLevel = classifyTraffic(payload.currentCount, zone.maxCapacity);

    const updated = await updateZoneDensity(id, payload.currentCount, trafficLevel);
    if (!updated) {
      return res.status(404).json({ message: "Zone not found" });
    }

    return res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.get("/traffic/zones", requireAuth, async (req, res, next) => {
  try {
    const zones = await listZones();
    return res.json(zones);
  } catch (error) {
    next(error);
  }
});

app.get("/traffic/congested", requireAuth, async (req, res, next) => {
  try {
    const zones = await listCongestedZones();
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
