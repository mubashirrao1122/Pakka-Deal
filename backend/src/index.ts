import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
dotenv.config();

import healthRouter from './routes/health';
import dealsRouter from './routes/deals';
import aiRouter from './routes/ai';
import ipfsRouter from './routes/ipfs';
import usersRouter from './routes/users';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ──
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

// ── Body parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request logging ──
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Routes ──
app.use('/health', healthRouter);
app.use('/deals', dealsRouter);
app.use('/ai', aiRouter);
app.use('/ipfs', ipfsRouter);
app.use('/users', usersRouter);

// ── 404 handler ──
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global error handler ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start server ──
app.listen(PORT, () => {
  console.log('');
  console.log(`  Port:      ${PORT}`);
  console.log(`  Database:  ${process.env.DATABASE_URL ? 'configured' : 'NOT SET'}`);
  console.log(`  Relayer:   ${process.env.RELAYER_PRIVATE_KEY ? 'configured' : 'NOT SET'}`);
  console.log(`  AI Engine: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'NOT SET'}`);
  console.log(`  IPFS:      ${process.env.PINATA_API_KEY ? 'configured' : 'NOT SET'}`);
  console.log('');
});

export default app;
