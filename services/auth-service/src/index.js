require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();
const inMemoryUsers = [];
let nextInMemoryUserId = 1;
const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "OPERATOR"]).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

function hasPrismaUserModel() {
  return Boolean(prisma.user && typeof prisma.user.findUnique === "function");
}

async function findUserByEmail(email) {
  if (hasPrismaUserModel()) {
    return prisma.user.findUnique({ where: { email } });
  }

  return inMemoryUsers.find((user) => user.email === email) || null;
}

async function createUser(data) {
  if (hasPrismaUserModel()) {
    return prisma.user.create({ data });
  }

  const user = {
    id: nextInMemoryUserId++,
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role,
    createdAt: new Date()
  };
  inMemoryUsers.push(user);
  return user;
}

app.get("/health", async (req, res) => {
  res.json({ service: "auth-service", status: "ok" });
});

app.post("/auth/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const existing = await findUserByEmail(payload.email);
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await createUser({
      email: payload.email,
      passwordHash,
      role: payload.role || "OPERATOR"
    });

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await findUserByEmail(payload.email);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: "1h" }
    );

    return res.json({ token, role: user.role });
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

const port = Number(process.env.PORT || 4001);
app.listen(port, () => {
  console.log(`Auth service listening on ${port}`);
});
