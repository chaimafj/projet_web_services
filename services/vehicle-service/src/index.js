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

const vehicleSchema = z.object({
  plateNumber: z.string().min(2),
  brand: z.string().min(2),
  model: z.string().min(1)
});

const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional()
});

app.get("/health", (req, res) => {
  res.json({ service: "vehicle-service", status: "ok" });
});

app.post("/vehicles", requireAuth, async (req, res, next) => {
  try {
    const payload = vehicleSchema.parse(req.body);
    const vehicle = await prisma.vehicle.create({ data: payload });
    return res.status(201).json(vehicle);
  } catch (error) {
    next(error);
  }
});

app.get("/vehicles", requireAuth, async (req, res, next) => {
  try {
    const vehicles = await prisma.vehicle.findMany({ orderBy: { id: "desc" } });
    return res.json(vehicles);
  } catch (error) {
    next(error);
  }
});

app.get("/vehicles/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    return res.json(vehicle);
  } catch (error) {
    next(error);
  }
});

app.post("/vehicles/:id/positions", requireAuth, async (req, res, next) => {
  try {
    const vehicleId = Number(req.params.id);
    const payload = positionSchema.parse(req.body);

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const position = await prisma.position.create({
      data: {
        vehicleId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed
      }
    });

    return res.status(201).json(position);
  } catch (error) {
    next(error);
  }
});

app.get("/vehicles/:id/positions", requireAuth, async (req, res, next) => {
  try {
    const vehicleId = Number(req.params.id);
    const positions = await prisma.position.findMany({
      where: { vehicleId },
      orderBy: { timestamp: "desc" }
    });

    return res.json(positions);
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

const port = Number(process.env.PORT || 4002);
app.listen(port, () => {
  console.log(`Vehicle service listening on ${port}`);
});
