import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';
import { verifyCaller } from '../services/firebaseAdmin.ts';

/** The same test as isTeam() in firestore.rules. */
export const isTeamEmail = (email: string | undefined, verified: boolean | undefined) =>
  verified === true && !!email && config.teamEmails.includes(email.toLowerCase());

export async function requireTeam(req: Request, res: Response, next: NextFunction) {
  let caller;
  try {
    caller = await verifyCaller(req.headers.authorization);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
    return;
  }
  if (!caller) {
    res.status(401).json({ success: false, error: 'Sesi login tidak valid. Silakan login ulang.' });
    return;
  }
  if (!isTeamEmail(caller.email, caller.email_verified)) {
    res.status(403).json({ success: false, error: 'Akun ini belum terdaftar sebagai tim Marka.' });
    return;
  }
  next();
}
