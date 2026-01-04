import RedisService from "./services/RedisService.js";
import { handleAudioChunk, AUDIO_CHANNEL, type AudioChunkMessage } from "./handlers/audioHandler.js";

const PORT = process.env.PORT || 4000;

// Store connected WebSocket clients by device ID
const connectedClients = new Map<string, any>();

// Initialize Redis service
const redisService = RedisService.getInstance();

// Set up Redis subscription for audio broadcasting
async function setupRedisSubscription() {
  try {
    await redisService.connect();
    
    // Subscribe to audio channel and broadcast to all connected clients
    await redisService.subscribe(AUDIO_CHANNEL, (message: string) => {
      try {
        const audioData: AudioChunkMessage = JSON.parse(message);
        
        // Broadcast to all connected clients except the sender
        connectedClients.forEach((ws, deviceId) => {
          if (deviceId !== audioData.deviceId && ws.readyState === 1) { // OPEN = 1
            try {
              ws.send(message);
            } catch (error) {
              console.error(`Error sending to client ${deviceId}:`, error);
            }
          }
        });
      } catch (error) {
        console.error("Error processing Redis message:", error);
      }
    });
    
    console.log(`Subscribed to Redis channel: ${AUDIO_CHANNEL}`);
  } catch (error) {
    console.error("Failed to setup Redis subscription:", error);
    // Continue without Redis - will use direct broadcast as fallback
  }
}

// Initialize Redis subscription
setupRedisSubscription();

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    
    // Check if this is a WebSocket upgrade request
    const upgradeHeader = req.headers.get("upgrade");
    if (upgradeHeader === "websocket") {
      // Handle WebSocket upgrade for any path
      const upgraded = server.upgrade(req);
      
      if (upgraded) {
        console.log(`WebSocket upgrade request from ${url.pathname}`);
        return; // Return undefined to indicate we handled the upgrade
      } else {
        console.error("Failed to upgrade WebSocket connection");
        return new Response("WebSocket upgrade failed", { status: 426 });
      }
    }
    
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    
    // Handle HTTP requests
    return new Response("Walkie Talkie Server is running!", {
      headers: { 
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
  websocket: {
    // Handle new WebSocket connection
    open(ws: any) {
      console.log("New WebSocket connection established");
      // Device ID will be set when client sends first message
    },
    
    // Handle incoming messages
    async message(ws: any, message: string | Buffer) {
      try {
        // Handle binary or text messages
        let data: any;
        
        if (typeof message === "string") {
          data = JSON.parse(message);
        } else {
          // Handle Buffer - convert to string
          const text = message.toString();
          data = JSON.parse(text);
        }
        
        // Handle different message types
        if (data.type === "connect") {
          // Client is connecting with device ID
          const deviceId = data.deviceId;
          if (deviceId) {
            connectedClients.set(deviceId, ws);
            ws.deviceId = deviceId;
            
            // Store session in Redis
            await redisService.setSession(deviceId, {
              connectedAt: Date.now(),
              lastSeen: Date.now(),
            });
            
            // Send confirmation
            ws.send(JSON.stringify({
              type: "connected",
              deviceId: deviceId,
            }));
            
            console.log(`Client connected: ${deviceId}`);
          }
        } else if (data.type === "audio") {
          // Handle audio chunk
          const deviceId = ws.deviceId;
          if (!deviceId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Not connected. Send 'connect' message first.",
            }));
            return;
          }
          
          // Process audio chunk and publish to Redis
          await handleAudioChunk(data as AudioChunkMessage, deviceId);
          
          // Broadcast directly to all connected clients except sender
          const messageStr = JSON.stringify(data);
          connectedClients.forEach((clientWs, clientDeviceId) => {
            if (clientDeviceId !== deviceId && clientWs.readyState === 1) { // OPEN = 1
              try {
                clientWs.send(messageStr);
              } catch (error) {
                console.error(`Error sending to client ${clientDeviceId}:`, error);
              }
            }
          });
        } else if (data.type === "ping") {
          // Heartbeat
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
        try {
          ws.send(JSON.stringify({
            type: "error",
            message: "Invalid message format",
          }));
        } catch (sendError) {
          console.error("Error sending error message:", sendError);
        }
      }
    },
    
    // Handle connection close
    async close(ws: any) {
      const deviceId = ws.deviceId;
      if (deviceId) {
        connectedClients.delete(deviceId);
        await redisService.deleteSession(deviceId);
        console.log(`Client disconnected: ${deviceId}`);
      }
    },
  },
});

console.log(`Walkie Talkie Server running on port ${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
