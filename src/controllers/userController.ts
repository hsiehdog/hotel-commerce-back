import { NextFunction, Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { auth } from "../lib/auth";
import { appBaseUrl } from "../config/env";
import { headersFromExpress } from "../utils/http";

const updateNameSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name is too long"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  revokeOtherSessions: z.boolean().optional(),
});

const requireUser = (req: Request, res: ExpressResponse): Express.User | null => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  return req.user;
};

const relayAuthResponse = async (res: ExpressResponse, response: globalThis.Response): Promise<void> => {
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  res.status(response.status);

  if (response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length) {
      res.send(buffer);
      return;
    }
  }

  res.end();
};

export const getProfile = async (req: Request, res: ExpressResponse, next: NextFunction): Promise<void> => {
  try {
    res.json({
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDisplayName = async (req: Request, res: ExpressResponse, next: NextFunction): Promise<void> => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const { name } = updateNameSchema.parse(req.body);

    const result = await auth.api.updateUser({
      headers: headersFromExpress(req.headers),
      body: { name },
    });

    res.json({ status: result?.status ?? true, name });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid request body", errors: error.flatten() });
      return;
    }
    next(error);
  }
};

export const changePassword = async (req: Request, res: ExpressResponse, next: NextFunction): Promise<void> => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const { currentPassword, newPassword, revokeOtherSessions } = changePasswordSchema.parse(req.body);

    const result = await auth.api.changePassword({
      headers: headersFromExpress(req.headers),
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions,
      },
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid request body", errors: error.flatten() });
      return;
    }
    next(error);
  }
};

export const signOut = async (req: Request, res: ExpressResponse, next: NextFunction): Promise<void> => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const response = await auth.handler(
      new Request(new URL("/auth/sign-out", appBaseUrl), {
        method: "POST",
        headers: headersFromExpress(req.headers),
      }),
    );

    await relayAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
};
