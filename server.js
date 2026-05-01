import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';
import { initDb, pool } from './src/db.js';
import { authRouter } from './src/routes/authRoutes.js';
import { dashboardRouter } from './src/routes/dashboardRoutes.js';
import { projectRouter } from './src/routes/projectRoutes.js';
import { taskRouter } from './src/routes/taskRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const clientOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
  : true;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'data:']
    }
  }
}));
app.use(cors({ origin: clientOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'team-task-manager' });
});

app.use('/api/auth', authRouter);
app.use('/api/projects', projectRouter);
app.use('/api', taskRouter);
app.use('/api', dashboardRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: error.errors[0]?.message || 'Validation failed',
      details: error.errors
    });
    return;
  }

  if (error.code === '22P02') {
    res.status(400).json({ message: 'Invalid identifier' });
    return;
  }

  const status = error.status || 500;
  const message = status === 500 ? 'Something went wrong' : error.message;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({ message });
});

async function start() {
  await initDb();
  app.listen(port, () => {
    console.log(`Team Task Manager running on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start application', error);
  pool.end();
  process.exit(1);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

export default app;
