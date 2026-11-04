import { Router } from 'express';
import type { Request, Response } from 'express';

/** Mounted at /api/health */
export const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true });
});
