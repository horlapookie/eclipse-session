const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    async function GIFTED_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            const browsers = ["Safari"];
            const randomItem = browsers[Math.floor(Math.random() * browsers.length)];

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS(randomItem)
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(5000);

                    const filePath = __dirname + `/temp/${id}/creds.json`;

                    // ✅ Read creds.json and convert to Base64
                    let rawData = fs.readFileSync(filePath);
                    let sessionBase64 = Buffer.from(rawData).toString('base64');

                    // ✅ Your custom session format
                    let md = "nexus~" + sessionBase64;

                    // send session to user's own WhatsApp
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

                    await delay(10);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                    console.log(`👤 ${sock.user.id} Connected ✅ Restarting process...`);
                    await delay(10);
                    process.exit();

                } else if (
                    connection === "close" &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output?.statusCode !== 401
                ) {
                    await delay(10);
                    GIFTED_MD_PAIR_CODE();
                }
            });

        } catch (err) {
            console.log("service restarted");
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
            }
        }
    }

    return await GIFTED_MD_PAIR_CODE();
});

module.exports = router;
