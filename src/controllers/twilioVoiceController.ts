import { Request, Response } from "express";
import { getIncomingVoiceTwiML } from "../services/twilioVoiceService";

export const handleIncomingVoice = (_req: Request, res: Response): void => {
  const twiml = getIncomingVoiceTwiML();

  res.type("text/xml");
  res.send(twiml);
};
