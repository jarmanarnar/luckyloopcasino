import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.mjs';
import { createAccountApi } from './account-api.mjs';
import { createVerificationProvider } from './verification-provider.mjs';
import { GAMES } from '../public/catalog.js';

const port = Number(process.env.PORT || 4324);
const accountApi = createAccountApi({
  filename: process.env.ACCOUNT_DATABASE_PATH || fileURLToPath(new URL('../.local/accounts.sqlite', import.meta.url)),
  origin: process.env.ACCOUNT_ORIGIN || `http://127.0.0.1:${port}`,
  gameEventSecret: process.env.GAME_EVENT_SECRET,
  games: GAMES,
  verification: createVerificationProvider({ accountSid: process.env.TWILIO_ACCOUNT_SID, authToken: process.env.TWILIO_AUTH_TOKEN,
    serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID, channels: (process.env.VERIFICATION_CHANNELS || '').split(',').map(value => value.trim()) }),
});
const server = createAppServer({ accountApi });
server.on('error', error => { console.error(error.message); accountApi.close(); process.exitCode = 1; });
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`COP COIN account server: ${process.env.ACCOUNT_ORIGIN || `http://127.0.0.1:${port}`}/luckyloopcasino/`));
let stopping = false;
function stop() { if (stopping) return; stopping = true; server.close(() => { accountApi.close(); process.exitCode = 0; }); server.closeIdleConnections(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
