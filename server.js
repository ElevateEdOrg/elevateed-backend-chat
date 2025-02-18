// Import required modules
const express = require("express");
const socketIo = require("socket.io");
const http = require("http");
const cors = require("cors");
require("dotenv").config();

// Initialize the app and server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(cors());
app.use(express.json());

// Set up a basic route to check if the server is running
app.get("/", (req, res) => {
  res.send("Chat service is running!");
});

// WebSocket connection
io.on("connection", (socket) => {
  console.log("A user connected");

  // Handle incoming messages
  socket.on("message", (msg) => {
    console.log("Message received:", msg);

    // Broadcast the message to other clients in the same room
    socket.broadcast.emit("message", msg);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

// Start the server
const port = process.env.PORT || 8002;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
