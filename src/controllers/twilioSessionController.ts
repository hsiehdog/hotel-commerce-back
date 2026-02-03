import { Request, Response } from "express";
import { listSessions } from "../services/twilioMediaStreamService";

export const listTwilioSessions = (_req: Request, res: Response): void => {
  const sessions = listSessions();
  res.json({ data: sessions });
};
