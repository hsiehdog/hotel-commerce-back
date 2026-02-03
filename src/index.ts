import app from "./app";
import env from "./config/env";
import { logger } from "./utils/logger";
import { attachTwilioMediaStreamServer } from "./ws/twilioMediaStreamServer";

const server = app.listen(env.PORT, () => {
  logger.info(`API ready on port ${env.PORT}`);
});

attachTwilioMediaStreamServer(server);

const shutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
