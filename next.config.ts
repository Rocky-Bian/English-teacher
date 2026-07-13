import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "node-edge-tts", "ws"],
  allowedDevOrigins: ["192.168.2.122", "MACdeMacBook-Air.local"],
};

export default nextConfig;
