const fs = require('fs');

let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

const webhookSearchTarget = `          const { resolveAccount, insertPendingRow } = require('../services/messageSender');
          const { enqueueSend } = require('../queue/sendQueue');
          const { account, error } = await resolveAccount({});
          
          if (!error && account) {
            if (btnId.startsWith('category_') || btnId.startsWith('basefish_')) {`;

const webhookReplacement = `          const { resolveAccount, insertPendingRow } = require('../services/messageSender');
          const { enqueueSend } = require('../queue/sendQueue');
          const { account, error } = await resolveAccount({});
          console.log('[DEBUG-2] resolveAccount returned:', { hasAccount: !!account, error });
          
          if (!error && account) {
            if (btnId.startsWith('category_') || btnId.startsWith('basefish_')) {`;

code = code.replace(webhookSearchTarget, webhookReplacement);
fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('debug patch 2 applied');
