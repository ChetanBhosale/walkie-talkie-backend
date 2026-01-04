/**
 * Audio Handler - Processes incoming audio chunks and publishes to Redis
 */

import RedisService from "../services/RedisService.js";

export interface AudioChunkMessage {
  type: "audio";
  deviceId: string;
  chunk: ArrayBuffer | string; // Base64 encoded or ArrayBuffer
  timestamp: number;
}

const AUDIO_CHANNEL = "walkie-talkie:audio";
const redisService = RedisService.getInstance();

/**
 * Validates audio chunk message format
 */
export function validateAudioChunk(message: any): message is AudioChunkMessage {
  return (
    message &&
    typeof message === "object" &&
    message.type === "audio" &&
    typeof message.deviceId === "string" &&
    message.deviceId.length > 0 &&
    (message.chunk instanceof ArrayBuffer ||
      typeof message.chunk === "string") &&
    typeof message.timestamp === "number"
  );
}

/**
 * Processes incoming audio chunk and publishes to Redis
 */
export async function handleAudioChunk(
  message: AudioChunkMessage,
  senderDeviceId: string
): Promise<void> {
  try {
    // Validate message
    if (!validateAudioChunk(message)) {
      throw new Error("Invalid audio chunk format");
    }

    // Ensure deviceId matches sender
    if (message.deviceId !== senderDeviceId) {
      throw new Error("Device ID mismatch");
    }

    // Convert chunk to base64 if it's ArrayBuffer
    let chunkData: string;
    if (message.chunk instanceof ArrayBuffer) {
      const buffer = Buffer.from(message.chunk);
      chunkData = buffer.toString("base64");
    } else {
      chunkData = message.chunk;
    }

    // Create message payload
    const payload = JSON.stringify({
      type: "audio",
      deviceId: message.deviceId,
      chunk: chunkData,
      timestamp: message.timestamp,
    });

    // Publish to Redis channel
    await redisService.publish(AUDIO_CHANNEL, payload);

    console.log(
      `Audio chunk published from device ${message.deviceId} at ${new Date(message.timestamp).toISOString()}`
    );
  } catch (error) {
    console.error("Error handling audio chunk:", error);
    throw error;
  }
}

export { AUDIO_CHANNEL };

