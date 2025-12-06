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

    // Validate phone number
    if (!num) {
        return res.status(400).send({ error: 'Phone number is required' });
    }

    // Remove existing session if present
    await removeFile(dirs);

    let retryCount = 0;
    const MAX_RETRIES = 5;

    // Enhanced session initialization function
    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);
        try {
            const Um4r719 = makeWASocket({
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'),
                logger: pino({
                    level: 'silent',
                }),
                auth: state,
                syncFullHistory: true,
            });

            let codeSent = false;

            Um4r719.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (connection === "connecting") {
                    console.log('Connecting...');
                }

                if (connection === "open") {
                    if (!codeSent) {
                        console.log("Connection opened successfully");
                        codeSent = true;
                    }

                    // Wait for user to authenticate on device
                    await delay(5000);

                    try {
                        await Um4r719.sendMessage(Um4r719.user.id, { text: `Generating your session wait a moment` });
                        console.log("Session generation started");
                        await delay(10000);

                        const sessionGlobal = fs.readFileSync(dirs + '/creds.json', 'utf-8');
                        let stringSession = `${Buffer.from(sessionGlobal).toString('base64')}`;

                        // Send the session to the user
                        await Um4r719.sendMessage(Um4r719.user.id, { text: stringSession });

                        // Send confirmation message
                        await Um4r719.sendMessage(Um4r719.user.id, {
                            text: 'HORLA-POOKIE Session has been successfully generated!\n\nYour session is above. Dont forget to give us a follow🙏🙏 https://whatsapp.com/channel/0029VbBu7CaLtOjAOyp5kR1i.\n\nGoodluck 🎉\n'
                        });

                        // Clean up session after use
                        await delay(100);
                        removeFile(dirs);
                        process.exit(0);
                    } catch (err) {
                        console.error('Error sending session:', err);
                    }
                } else if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    // 401 = LoggedOut, don't retry
                    if (statusCode === 401) {
                        console.log('Device logged out');
                        if (!res.headersSent) {
                            res.status(401).send({ error: 'Device logged out or not authenticated' });
                        }
                        removeFile(dirs);
                        process.exit(1);
                    } else if (statusCode !== 408) {
                        // Retry on other errors (not Request Timeout)
                        retryCount++;
                        if (retryCount < MAX_RETRIES) {
                            console.log(`Retrying connection... Attempt ${retryCount}/${MAX_RETRIES}`);
                            await delay(5000);
                            initiateSession();
                        } else {
                            console.log('Max retries reached');
                            if (!res.headersSent) {
                                res.status(500).send({ error: 'Unable to link device after multiple attempts' });
                            }
                            removeFile(dirs);
                            process.exit(1);
                        }
                    }
                }
            });

            Um4r719.ev.on('creds.update', saveCreds);

            // Request pairing code after socket is ready
            Um4r719.ev.on('connection.update', async (s) => {
                const { connection } = s;

                if (connection === "connecting" && !codeSent) {
                    await delay(3000);
                    try {
                        num = num.replace(/[^0-9]/g, '');
                        const code = await Um4r719.requestPairingCode(num);
                        console.log({ num, code });
                        if (!res.headersSent) {
                            res.send({ code });
                        }
                    } catch (err) {
                        console.error('Error requesting pairing code:', err);
                        if (!res.headersSent) {
                            res.status(500).send({ error: 'Unable to generate pairing code: ' + err.message });
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ error: 'Service Unavailable: ' + err.message });
            }
            removeFile(dirs);
            process.exit(1);
        }
    }

    await initiateSession();
});

export default router;
