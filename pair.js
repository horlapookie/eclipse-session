import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } from '@whiskeysockets/baileys';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);
    
    // Remove existing session if present
    await removeFile(dirs);

    let retryCount = 0;
    const MAX_RETRIES = 5;

    // Enhanced session initialization function
    async function initiateSession() {
      const { state, saveCreds } = await useMultiFileAuthState(dirs)
try {
      const Um4r719 = makeWASocket({
        printQRInTerminal: false,
        version: [2, 3000, 1027934701],
        logger: pino({
          level: 'silent',
        }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: state,
      });

            if (!Um4r719.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await Um4r719.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            Um4r719.ev.on('creds.update', saveCreds);

            Um4r719.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await Um4r719.sendMessage(Um4r719.user.id, { text: `Generating your session wait a moment`});
                    console.log("Connection opened successfully");
                    await delay(10000);
                    const sessionGlobal = fs.readFileSync(dirs + '/creds.json', 'utf-8');

                    // Create session string with HORLAMHI prefix
                    let stringSession = `HORLAMHI~${Buffer.from(sessionGlobal).toString('base64')}`;

                    // Send the session to the user
                    await Um4r719.sendMessage(Um4r719.user.id, { text: stringSession });

                    // Send confirmation message
                    await Um4r719.sendMessage(Um4r719.user.id, { 
                        text: 'HORLAMHI Session has been successfully generated!\n\nYour session is above.\n\nGoodluck 🎉\n' 
                    });

                    // Clean up session after use
                    await delay(100);
                    removeFile(dirs);
                    process.exit(0);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    retryCount++;

                    if (retryCount < MAX_RETRIES) {
                        console.log(`Retrying connection... Attempt ${retryCount}/${MAX_RETRIES}`);
                        await delay(10000);
                        initiateSession();
                    } else {
                        console.log('Max retries reached, stopping reconnection attempts.');
                        await res.status(500).send({ message: 'Unable to reconnect after multiple attempts.' });
                    }
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

export default router;
