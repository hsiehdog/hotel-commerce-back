import { Request, Response } from "express";
import { z } from "zod";
import { logIncomingCallerLineType } from "../services/twilioCallerLookupService";
import { getIncomingVoiceTwiML } from "../services/twilioVoiceService";

const incomingVoiceSchema = z.object({
  From: z.string().optional(),
});

export const handleIncomingVoice = (req: Request, res: Response): void => {
  const parsed = incomingVoiceSchema.safeParse(req.body);
  const from = parsed.success ? parsed.data.From : undefined;

  if (from) {
    logIncomingCallerLineType({ from });
  }

  const twiml = getIncomingVoiceTwiML();

  res.type("text/xml");
  res.send(twiml);
};
