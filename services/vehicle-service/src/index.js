require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();
const inMemoryVehicles = [];
const inMemoryPositions = [];
let nextVehicleId = 1;
let nextPositionId = 1;
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

async function createVehicle(data) {
  try {
    return await prisma.vehicle.create({ data });
  } catch (error) {
    const vehicle = {
      id: nextVehicleId++,
      plateNumber: data.plateNumber,
      brand: data.brand,
      model: data.model,
      createdAt: new Date()
    };
    inMemoryVehicles.push(vehicle);
    return vehicle;
  }
}

async function listVehicles() {
  try {
    return await prisma.vehicle.findMany({ orderBy: { id: "desc" } });
  } catch (error) {
    return [...inMemoryVehicles].sort((left, right) => right.id - left.id);
  }
}

async function findVehicleById(id) {
  try {
    return await prisma.vehicle.findUnique({ where: { id } });
  } catch (error) {
    return inMemoryVehicles.find((vehicle) => vehicle.id === id) || null;
  }
}

async function createVehiclePosition(vehicleId, payload) {
  try {
    return await prisma.position.create({
      data: {
        vehicleId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed
      }
    });
  } catch (error) {
    const position = {
      id: nextPositionId++,
      vehicleId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed ?? null,
      timestamp: new Date()
    };
    inMemoryPositions.push(position);
    return position;
  }
}

async function listVehiclePositions(vehicleId) {
  try {
    return await prisma.position.findMany({
      where: { vehicleId },
      orderBy: { timestamp: "desc" }
    });
  } catch (error) {
    return inMemoryPositions
      .filter((position) => position.vehicleId === vehicleId)
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  }
}

app.post("/vehicles", requireAuth, async (req, res, next) => {
  try {
    const payload = vehicleSchema.parse(req.body);
    const vehicle = await createVehicle(payload);
    return res.status(201).json(vehicle);
  } catch (error) {
    next(error);
  }
});

app.get("/vehicles", requireAuth, async (req, res, next) => {
  try {
    const vehicles = await listVehicles();
    return res.json(vehicles);
  } catch (error) {
    next(error);
  }
});

app.get("/vehicles/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const vehicle = await findVehicleById(id);
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

    const vehicle = await findVehicleById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const position = await createVehiclePosition(vehicleId, payload);

    return res.status(201).json(position);
  } catch (error) {
    next(error);
  }
});

app.get("/vehicles/:id/positions", requireAuth, async (req, res, next) => {
  try {
    const vehicleId = Number(req.params.id);
    const positions = await listVehiclePositions(vehicleId);

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
