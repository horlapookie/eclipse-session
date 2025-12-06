import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, Browsers } from '@whiskeysockets/baileys';

const router = express.Router();

// Ensure directory exists
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Remove file/directory
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

    // Validate phone number
    if (!num) {
        return res.status(400).send({ error: 'Phone number is required' });
    }

    // Clean phone number
    num = num.replace(/[^0-9]/g, '');

    // Remove existing session if present
    removeFile(dirs);

    // Create fresh directory
    ensureDir(dirs);
    console.log(`Created session directory: ${dirs}`);

    let retryCount = 0;
    const MAX_RETRIES = 3;
    let requestSent = false;
    let sessionSent = false;

    // Enhanced session initialization function
    async function initiateSession() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(dirs);

            const Um4r719 = makeWASocket({
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'),
                logger: pino({
                    level: 'error',
                }),
                auth: state,
                shouldSyncHistoryMessage: () => false,
                msgRetryCounterMap: {},
                msgRetryCounterStartTimestamp: Date.now(),
            });

            // Handle credentials update
            Um4r719.ev.on('creds.update', saveCreds);

            // Main connection handler
            Um4r719.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;
                console.log('Connection status:', connection);

                if (connection === "connecting") {
                    console.log('Socket connecting...');
                }

                if (connection === "open") {
                    console.log("Socket connection opened successfully");

                    // Request pairing code only once
                    if (!requestSent) {
                        requestSent = true;
                        try {
                            console.log(`Requesting pairing code for: ${num}`);
                            const code = await Um4r719.requestPairingCode(num);
                            console.log(`Pairing code received: ${code}`);

                            if (!res.headersSent) {
                                res.send({ code });
                            }
                        } catch (err) {
                            console.error('Error requesting pairing code:', err.message);
                            if (!res.headersSent) {
                                res.status(500).send({ error: 'Failed to get pairing code: ' + err.message });
                            }
                            removeFile(dirs);
                            await Um4r719.end();
                        }
                    }

                    // Wait for device to complete pairing and login
                    if (requestSent && !sessionSent) {
                        await delay(15000); // Wait for user to enter code on device
                        sessionSent = true;

                        try {
                            console.log('Attempting to send session...');

                            // Send notification
                            await Um4r719.sendMessage(Um4r719.user.id, {
                                text: `Generating your session wait a moment`
                            });
                            console.log("Sent generation notification");

                            await delay(5000);

                            // Read credentials file
                            const credPath = path.join(dirs, 'creds.json');
                            if (!fs.existsSync(credPath)) {
                                throw new Error('Credentials file not found at: ' + credPath);
                            }

                            const sessionGlobal = fs.readFileSync(credPath, 'utf-8');
                            const stringSession = Buffer.from(sessionGlobal).toString('base64');

                            console.log('Session encoded, length:', stringSession.length);

                            // Send the base64 session
                            await Um4r719.sendMessage(Um4r719.user.id, { text: stringSession });
                            console.log("Sent session base64");

                            await delay(1000);

                            // Send confirmation
                            await Um4r719.sendMessage(Um4r719.user.id, {
                                text: 'HORLA-POOKIE Session has been successfully generated!\n\nYour session is above. Dont forget to give us a follow🙏🙏 https://whatsapp.com/channel/0029VbBu7CaLtOjAOyp5kR1i.\n\nGoodluck 🎉\n'
                            });
                            console.log("Sent confirmation message");

                            // Clean up and close
                            await delay(2000);
                            removeFile(dirs);
                            await Um4r719.end();
                        } catch (err) {
                            console.error('Error sending session:', err.message);
                            if (!res.headersSent) {
                                res.status(500).send({ error: 'Failed to send session: ' + err.message });
                            }
                            removeFile(dirs);
                            await Um4r719.end();
                        }
                    }
                }
                else if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log('Connection closed with status:', statusCode);
                    console.log('Full disconnect info:', JSON.stringify(lastDisconnect, null, 2));

                    // 401 = LoggedOut, 428 = Connection error during pairing
                    if (statusCode === 401) {
                        console.log('Device logged out or not authenticated');
                        if (!res.headersSent) {
                            res.status(401).send({ error: 'Device not authenticated' });
                        }
                        removeFile(dirs);
                    }
                    else if (!requestSent && statusCode !== 408) {
                        // Retry if we haven't sent the request yet
                        retryCount++;
                        if (retryCount < MAX_RETRIES) {
                            console.log(`Retrying connection... Attempt ${retryCount}/${MAX_RETRIES}`);
                            await delay(5000);
                            initiateSession();
                        } else {
                            console.log('Max retries reached');
                            if (!res.headersSent) {
                                res.status(500).send({ error: 'Unable to connect after multiple attempts' });
                            }
                            removeFile(dirs);
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err.message);
            if (!res.headersSent) {
                res.status(503).send({ error: 'Service error: ' + err.message });
            }
            removeFile(dirs);
        }
    }

    await initiateSession();
});

export default router;
