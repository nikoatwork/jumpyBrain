// Dedicated support relay. No memory root, QMD, or browser mail credentials.
import http from 'node:http';
import { createAgentMailSender, createFeedbackHandler } from '../dist/adapters/http-server/feedback-delivery.js';

const deliveryConfigured = Boolean(process.env.AGENTMAIL_API_KEY?.trim() && process.env.AGENTMAIL_SENDING_INBOX?.trim());
const handle = createFeedbackHandler(deliveryConfigured ? createAgentMailSender({
  apiKey: process.env.AGENTMAIL_API_KEY || '', inbox: process.env.AGENTMAIL_SENDING_INBOX || '',
}) : undefined);
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ ok: true, deliveryConfigured })); return;
  }
  if (request.url !== '/feedback') { response.writeHead(404); response.end(); return; }
  void handle(request, response).catch(() => { response.destroy(); });
});
server.requestTimeout = 20_000;
server.headersTimeout = 20_000;
server.listen(Number(process.env.PORT || 3002), process.env.HOST || '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
