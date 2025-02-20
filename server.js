import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import pool from "./db.js";

dotenv.config();

const app = express();
const server = createServer(app);

// Enable CORS
app.use(cors());
app.use(express.json());

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow frontend to connect
    methods: ["GET", "POST"],
  },
});

const users = new Map(); // Map to store users and their socket IDs

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Register user with their socket ID
  socket.on("register_user", (userId) => {
    users.set(userId, socket.id);
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  // Listen for chat messages
  socket.on("send_message", async (data) => {
    const { senderId, receiverId, message } = data;
    console.log("Message received:", data);
    try {
      let chatResult = await pool.query(
        "SELECT id FROM chats WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)",
        [senderId, receiverId]
      );

      let chatId;
      if (chatResult.rows.length === 0) {
        chatResult = await pool.query(
          "INSERT INTO chats (user1_id, user2_id) VALUES ($1, $2) RETURNING id",
          [senderId, receiverId]
        );
      }

      chatId = chatResult.rows[0].id;

      await pool.query(
        "INSERT INTO messages (chat_id, sender_id, message) VALUES ($1, $2, $3)",
        [chatId, senderId, message]
      );

      console.log("Message saved to database");

      // Emit message to the sender
      const receiverSocketId = users.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receive_message", {
          senderId,
          message,
        });
      }
    } catch (error) {
      console.error("Error saving message to database", error);
    }

    // Emit message to the receiver
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    users.forEach((socketId, userId) => {
      if (socketId === socket.id) {
        users.delete(userId);
      }
    });
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.get("/list/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.id AS chat_id, 
              u1.id AS user1_id, u1.full_name AS user1_name, 
              u2.id AS user2_id, u2.full_name AS user2_name, 
              c.created_at 
       FROM chats c
       JOIN users u1 ON c.user1_id = u1.id
       JOIN users u2 ON c.user2_id = u2.id
       WHERE c.user1_id = $1 OR c.user2_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No chats found" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching chats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/history/:chatId", async (req, res) => {
  const { chatId } = req.params;

  try {
    const result = await pool.query(
      `SELECT m.id AS message_id, 
              m.sender_id, 
              u.full_name AS sender_name, 
              m.message, 
              m.sent_at, 
              m.status
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1
       ORDER BY m.sent_at ASC`,
      [chatId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Basic API Route
app.get("/", (req, res) => {
  res.send("ElevateEd Chat Service Running...");
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
