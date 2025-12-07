import { makeid } from './gen-id.js';
import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { fileURLToPath } from 'url';
import path from 'path';
import makeWASocket, {
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let router = express.Router();

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    if (!num) {
        return res.send({ code: "❗ Phone number required" });
    }

    num = num.replace(/[^0-9]/g, '');

    async function GIFTED_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS('Chrome')
            });

            let pairingCodeRequested = false;

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if ((connection === "connecting" || qr) && !pairingCodeRequested && !sock.authState.creds.registered) {
                    pairingCodeRequested = true;
                    try {
                        await delay(2000);
                        const code = await sock.requestPairingCode(num);
                        console.log(`Pairing code generated for ${num}: ${code}`);
                        if (!res.headersSent) {
                            res.send({ code });
                        }
                    } catch (err) {
                        console.log("Error requesting pairing code:", err.message);
                        if (!res.headersSent) {
                            res.send({ code: "❗ Failed to generate code. Try again." });
                        }
                        await removeFile('./temp/' + id);
                    }
                }

                if (connection === "open") {
                    console.log(`Connection opened for ${num}`);
                    await delay(3000);

                    try {
                        const filePath = path.join(__dirname, 'temp', id, 'creds.json');
                        let rawData = fs.readFileSync(filePath);
                        let sessionBase64 = Buffer.from(rawData).toString('base64');
                        let md = "nexus~" + sessionBase64;

                        let codeMsg = await sock.sendMessage(sock.user.id, { text: md });

                        let desc = `*Session generated!*
- Keep your code safe.
- Join channel: https://whatsapp.com/channel/0029Vad7YNyJuyA77CtIPX0x
- Repo: https://github.com/officialPkdriller/NEXUS-AI

*© PKDRILLER*`;

                        await sock.sendMessage(
                            sock.user.id,
                            {
                                text: desc,
                                contextInfo: {
                                    externalAdReply: {
                                        title: "Pkdriller",
                                        thumbnailUrl: "https://i.postimg.cc/3RrYq2xP/28ed8a29-7bae-4747-b11c-1fd04d0ee9bf.jpg",
                                        sourceUrl: "https://whatsapp.com/channel/0029Vad7YNyJuyA77CtIPX0x",
                                        mediaType: 1,
                                        renderLargerThumbnail: true
                                    }
                                }
                            },
                            { quoted: codeMsg }
                        );

                        console.log(`Session sent to ${sock.user.id}`);
                    } catch (err) {
                        console.log("Error sending session:", err.message);
                    }

                    await delay(1000);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                }

                if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`Connection closed with status: ${statusCode}`);
                    
                    if (statusCode === DisconnectReason.restartRequired) {
                        console.log("Restart required, reconnecting...");
                        await delay(1000);
                        GIFTED_MD_PAIR_CODE();
                    } else if (statusCode !== DisconnectReason.loggedOut && statusCode !== 401) {
                        await removeFile('./temp/' + id);
                    }
                }
            });

        } catch (err) {
            console.log("Error in GIFTED_MD_PAIR_CODE:", err.message);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                res.send({ code: "❗ Service Unavailable" });
            }
        }
    }

    return await GIFTED_MD_PAIR_CODE();
});

export default router;
