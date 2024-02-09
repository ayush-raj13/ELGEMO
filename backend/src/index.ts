import { Socket } from "socket.io";
import http from "http";
import { Server } from 'socket.io';
import { UserManager } from "./managers/UserManger";

const server = http.createServer(http);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const userManager = new UserManager();

io.on('connection', (socket: Socket) => {
  console.log('a user connected', socket.handshake.query['name']);
  userManager.addUser(socket.handshake.query['name'] as string, socket);
  socket.on("disconnect", () => {
    console.log("user disconnected");
    userManager.removeUser(socket.id);
  })
  socket.on("close", () => {
    console.log("user disconnected");
    userManager.removeUser(socket.id);
  })
  socket.on("leave", () => {
    // remove room
    userManager.userLeft(socket.id);
  })
});

server.listen(3000, () => {
    console.log('listening on *:3000');
});