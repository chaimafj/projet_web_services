require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  vehicle: process.env.VEHICLE_SERVICE_URL || "http://localhost:4002",
  traffic: process.env.TRAFFIC_SERVICE_URL || "http://localhost:4003",
  incident: process.env.INCIDENT_SERVICE_URL || "http://localhost:4004",
  notification: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4005"
};

async function requestService(baseUrl, path, options = {}, token) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = token;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Service request failed");
  }

  return data;
}

const typeDefs = `#graphql
  type AuthPayload {
    token: String!
    role: String!
  }

  type User {
    id: Int!
    email: String!
    role: String!
    createdAt: String!
  }

  type Vehicle {
    id: Int!
    plateNumber: String!
    brand: String!
    model: String!
    createdAt: String!
  }

  type Position {
    id: Int!
    vehicleId: Int!
    latitude: Float!
    longitude: Float!
    speed: Float
    timestamp: String!
  }

  type Zone {
    id: Int!
    name: String!
    maxCapacity: Int!
    currentCount: Int!
    trafficLevel: String!
    createdAt: String!
    updatedAt: String!
  }

  type Incident {
    id: Int!
    title: String!
    description: String!
    zoneName: String!
    type: String!
    status: String!
    createdAt: String!
    updatedAt: String!
  }

  type Notification {
    id: Int!
    userEmail: String!
    message: String!
    read: Boolean!
    createdAt: String!
  }

  type Query {
    vehicles: [Vehicle!]!
    vehicle(id: Int!): Vehicle!
    vehiclePositions(vehicleId: Int!): [Position!]!
    zones: [Zone!]!
    congestedZones: [Zone!]!
    incidents: [Incident!]!
    notifications(userEmail: String): [Notification!]!
  }

  type Mutation {
    register(email: String!, password: String!, role: String): User!
    login(email: String!, password: String!): AuthPayload!

    addVehicle(plateNumber: String!, brand: String!, model: String!): Vehicle!
    addVehiclePosition(vehicleId: Int!, latitude: Float!, longitude: Float!, speed: Float): Position!

    createZone(name: String!, maxCapacity: Int!): Zone!
    measureDensity(zoneId: Int!, currentCount: Int!): Zone!

    declareIncident(title: String!, description: String!, zoneName: String!, type: String!): Incident!
    updateIncidentStatus(incidentId: Int!, status: String!): Incident!

    sendNotification(userEmail: String!, message: String!): Notification!
    markNotificationRead(notificationId: Int!): Notification!
  }
`;

const resolvers = {
  Query: {
    vehicles: (_, __, ctx) => requestService(SERVICES.vehicle, "/vehicles", {}, ctx.token),
    vehicle: (_, { id }, ctx) => requestService(SERVICES.vehicle, `/vehicles/${id}`, {}, ctx.token),
    vehiclePositions: (_, { vehicleId }, ctx) =>
      requestService(SERVICES.vehicle, `/vehicles/${vehicleId}/positions`, {}, ctx.token),
    zones: (_, __, ctx) => requestService(SERVICES.traffic, "/traffic/zones", {}, ctx.token),
    congestedZones: (_, __, ctx) => requestService(SERVICES.traffic, "/traffic/congested", {}, ctx.token),
    incidents: (_, __, ctx) => requestService(SERVICES.incident, "/incidents", {}, ctx.token),
    notifications: (_, { userEmail }, ctx) => {
      const q = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : "";
      return requestService(SERVICES.notification, `/notifications${q}`, {}, ctx.token);
    }
  },
  Mutation: {
    register: (_, args) =>
      requestService(SERVICES.auth, "/auth/register", {
        method: "POST",
        body: JSON.stringify(args)
      }),
    login: (_, { email, password }) =>
      requestService(SERVICES.auth, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      }),

    addVehicle: (_, args, ctx) =>
      requestService(
        SERVICES.vehicle,
        "/vehicles",
        {
          method: "POST",
          body: JSON.stringify(args)
        },
        ctx.token
      ),
    addVehiclePosition: (_, { vehicleId, ...payload }, ctx) =>
      requestService(
        SERVICES.vehicle,
        `/vehicles/${vehicleId}/positions`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        ctx.token
      ),

    createZone: (_, args, ctx) =>
      requestService(
        SERVICES.traffic,
        "/traffic/zones",
        {
          method: "POST",
          body: JSON.stringify(args)
        },
        ctx.token
      ),
    measureDensity: (_, { zoneId, currentCount }, ctx) =>
      requestService(
        SERVICES.traffic,
        `/traffic/zones/${zoneId}/measure`,
        {
          method: "POST",
          body: JSON.stringify({ currentCount })
        },
        ctx.token
      ),

    declareIncident: (_, args, ctx) =>
      requestService(
        SERVICES.incident,
        "/incidents",
        {
          method: "POST",
          body: JSON.stringify(args)
        },
        ctx.token
      ),
    updateIncidentStatus: (_, { incidentId, status }, ctx) =>
      requestService(
        SERVICES.incident,
        `/incidents/${incidentId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status })
        },
        ctx.token
      ),

    sendNotification: (_, args, ctx) =>
      requestService(
        SERVICES.notification,
        "/notifications",
        {
          method: "POST",
          body: JSON.stringify(args)
        },
        ctx.token
      ),
    markNotificationRead: (_, { notificationId }, ctx) =>
      requestService(
        SERVICES.notification,
        `/notifications/${notificationId}/read`,
        {
          method: "PATCH"
        },
        ctx.token
      )
  }
};

async function start() {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  app.get("/health", (req, res) => {
    res.json({ service: "graphql-gateway", status: "ok" });
  });

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => ({
        token: req.headers.authorization
      })
    })
  );

  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`GraphQL gateway listening on ${port}`);
  });
}

start().catch((error) => {
  console.error("Gateway failed to start", error);
  process.exit(1);
});
