require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();
const inMemoryNotifications = [];
let nextNotificationId = 1;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

const notificationSchema = z.object({
  userEmail: z.string().email(),
  message: z.string().min(2)
});

app.get("/health", (req, res) => {
  res.json({ service: "notification-service", status: "ok" });
});

async function createNotification(data) {
  try {
    return await prisma.notification.create({ data });
  } catch (error) {
    const notification = {
      id: nextNotificationId++,
      userEmail: data.userEmail,
      message: data.message,
      read: false,
      createdAt: new Date()
    };
    inMemoryNotifications.push(notification);
    return notification;
  }
}

async function listNotifications(userEmail) {
  try {
    const where = userEmail ? { userEmail } : {};
    return await prisma.notification.findMany({
      where,
      orderBy: { id: "desc" }
    });
  } catch (error) {
    const filtered = userEmail
      ? inMemoryNotifications.filter((notification) => notification.userEmail === userEmail)
      : [...inMemoryNotifications];
    return filtered.sort((left, right) => right.id - left.id);
  }
}

async function findNotificationById(id) {
  try {
    return await prisma.notification.findUnique({ where: { id } });
  } catch (error) {
    return inMemoryNotifications.find((notification) => notification.id === id) || null;
  }
}

async function markNotificationAsRead(id) {
  try {
    return await prisma.notification.update({
      where: { id },
      data: { read: true }
    });
  } catch (error) {
    const notification = inMemoryNotifications.find((item) => item.id === id);
    if (!notification) {
      return null;
    }

    notification.read = true;
    return notification;
  }
}

app.post("/notifications", requireAuth, async (req, res, next) => {
  try {
    const payload = notificationSchema.parse(req.body);
    const notification = await createNotification(payload);
    io.emit("notification:new", notification);
    return res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
});

app.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const userEmail = req.query.userEmail ? String(req.query.userEmail) : undefined;
    const notifications = await listNotifications(userEmail);
    return res.json(notifications);
  } catch (error) {
    next(error);
  }
});

app.patch("/notifications/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const notification = await findNotificationById(id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const updated = await markNotificationAsRead(id);
    if (!updated) {
      return res.status(404).json({ message: "Notification not found" });
    }

    io.emit("notification:read", updated);
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

const port = Number(process.env.PORT || 4005);
server.listen(port, () => {
  console.log(`Notification service listening on ${port}`);
});
