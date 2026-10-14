import serverless from 'serverless-http';
import express from 'express';
import { apiRouter } from '../../server/routes';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/.netlify/functions/api', apiRouter);
app.use('/api', apiRouter);

export const handler = serverless(app);
