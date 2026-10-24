// handlers/message.js — runs on each `message` update. The file name is the
// Telegram update type; the platform calls the default export with the matching
// payload (here, a Message). The full update is available as `ctx.update`.

import { api } from 'sdk';
import { miniAppUrl } from '../lib/miniapp.js';
import { collectMessage } from '../lib/otc.js';

export default async function (message, ctx = {}) {
  // Group monitoring is always silent, including commands and service messages.
  if (message.chat?.type !== 'private') {
    await collectMessage(message, ctx.update?.update_id);
    return;
  }

  const command = message.text?.split(/\s/)[0].split('@')[0].toLowerCase();
  if (command === '/start' || command === '/app' || command === '/top') {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: 'Open the Mini App to explore OTCs.',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open Mini App ↗', web_app: { url: miniAppUrl } }],
        ],
      },
    });
    return;
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text: 'Use the Mini App to browse OTCs or add your group.',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Open Mini App ↗', web_app: { url: miniAppUrl } }],
      ],
    },
  });
}
