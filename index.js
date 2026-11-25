/**
 * Shop Telegram Bot - có Reseller
 */
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN || '9174341797:AAFsyiFSXwisG-UFvFmbiP_vHTWURBcLkfI';
const BIN_ID = process.env.BIN_ID || '6b065e37ffd5d16053dc0c74';
const MASTER_KEY = process.env.MASTER_KEY || '$2a$10$E3TfVjjxGA2Dy1881YzVOO.kjLRnQigWfUWmK5vj3Ny8h2gCbTl9e';

const API = 'https://api.jsonbin.io/v3/b/' + BIN_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('Bot started');

// Bàn phím cố định - 2 nút cùng 1 hàng cho đẹp
const mainKeyboard = {
  keyboard: [[{ text: '🛒 Mua hàng' }, { text: '🔙 Quay lại' }]],
  resize_keyboard: true,
  is_persistent: true
};

async function getData() {
  const res = await fetch(API + '/latest', {
    headers: { 'X-Master-Key': MASTER_KEY }
  });
  if (!res.ok) throw new Error('JSONBin lỗi ' + res.status);
  const json = await res.json();
  const data = json.record || { products: [], orders: [], config: {}, users: [] };
  if (!data.products) data.products = [];
  if (!data.orders) data.orders = [];
  if (!data.config) data.config = {};
  if (!data.users) data.users = [];
  if (!data.config.resellers) data.config.resellers = [];
  if (!data.config.bank) {
    data.config.bank = {
      bin: '970454',
      account: '99ZP26154M42407211',
      name: 'ZALOPAY_PHAM THI HUE'
    };
  }
  return data;
}

async function saveData(data) {
  const res = await fetch(API, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': MASTER_KEY,
      'X-Bin-Versioning': 'false'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Lưu JSONBin lỗi ' + res.status);
}

function isReseller(data, userId) {
  const list = (data.config && data.config.resellers) || [];
  return list.some(r => String(r) === String(userId) || String(r.id) === String(userId));
}

function getPrice(type, asReseller) {
  if (asReseller && type.resellerPrice != null && type.resellerPrice > 0) {
    return type.resellerPrice;
  }
  return type.price;
}

async function trackUser(from) {
  try {
    const data = await getData();
    const exists = data.users.find(u => u.id === from.id);
    if (!exists) {
      data.users.push({
        id: from.id,
        username: from.username || '',
        name: [from.first_name, from.last_name].filter(Boolean).join(' '),
        joinedAt: new Date().toISOString()
      });
      await saveData(data);
    }
  } catch (e) {
    console.error('trackUser:', e.message);
  }
}

function formatMoney(n) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
}

// Gạch ngang chữ (Unicode) — dùng trong nút Telegram
function strikeText(s) {
  return String(s).split('').map(function(c) { return c + '̶'; }).join('');
}

function formatMoneyShort(n) {
  if (n >= 1000) return new Intl.NumberFormat('vi-VN').format(n / 1000) + 'k';
  return formatMoney(n);
}

function makeOrderId() {
  return 'DH' + Date.now().toString().slice(-8);
}

function vietQRUrl(bank, amount, addInfo) {
  const accName = encodeURIComponent(bank.name || '');
  const info = encodeURIComponent(addInfo || '');
  return 'https://img.vietqr.io/image/' + bank.bin + '-' + bank.account + '-compact2.png?amount=' + amount + '&addInfo=' + info + '&accountName=' + accName;
}

async function showShop(chatId, userId) {
  const data = await getData();
  const products = data.products.filter(p => p.types && p.types.some(t => t.stock > 0));
  const reseller = isReseller(data, userId);

  if (!products.length) {
    return bot.sendMessage(chatId, 'Hiện chưa có sản phẩm nào.', { reply_markup: mainKeyboard });
  }

  // Giữ bàn phím cố định phía trên
  await bot.sendMessage(chatId, reseller ? '📦 Danh sách sản phẩm (bạn là Reseller):' : '📦 Chọn sản phẩm bạn muốn mua:', {
    reply_markup: mainKeyboard
  });

  const keyboard = products.map(p => [{ text: '🛒 ' + p.name, callback_data: 'p|' + p.id }]);
  await bot.sendMessage(chatId, 'Chọn sản phẩm:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

// /start
bot.onText(/\/start/, async (msg) => {
  await trackUser(msg.from);
  await bot.sendMessage(msg.chat.id,
    'Chào bạn! 👋\n\nBấm nút bên dưới hoặc gửi lệnh:\n• 🛒 Mua hàng / /shop — xem sản phẩm\n• /id — xem ID tài khoản của bạn',
    { reply_markup: mainKeyboard }
  );
});

// /id
bot.onText(/\/id/, async (msg) => {
  await trackUser(msg.from);
  const data = await getData();
  const reseller = isReseller(data, msg.from.id);
  let text = '🆔 ID tài khoản của bạn: `' + msg.from.id + '`\n';
  if (msg.from.username) text += 'Username: @' + msg.from.username + '\n';
  text += 'Vai trò: ' + (reseller ? 'Reseller' : 'Khách thường');
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown', reply_markup: mainKeyboard });
});

// /shop
bot.onText(/\/shop/, async (msg) => {
  await trackUser(msg.from);
  try {
    await showShop(msg.chat.id, msg.from.id);
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Lỗi: ' + e.message, { reply_markup: mainKeyboard });
  }
});

// Nút bàn phím
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const t = msg.text.trim();
  if (t.startsWith('/')) return;

  if (t === '🛒 Mua hàng' || t === 'Mua hàng') {
    await trackUser(msg.from);
    try {
      await showShop(msg.chat.id, msg.from.id);
    } catch (e) {
      bot.sendMessage(msg.chat.id, 'Lỗi: ' + e.message, { reply_markup: mainKeyboard });
    }
    return;
  }

  if (t === '🔙 Quay lại' || t === 'Quay lại') {
    await bot.sendMessage(msg.chat.id,
      'Bạn đang ở menu chính.\nBấm 🛒 Mua hàng hoặc gửi /shop để xem sản phẩm.',
      { reply_markup: mainKeyboard }
    );
    return;
  }
});

// /setadmin
bot.onText(/\/setadmin/, async (msg) => {
  try {
    const data = await getData();
    data.config = data.config || {};
    data.config.adminChatId = msg.chat.id;
    await saveData(data);
    bot.sendMessage(msg.chat.id, '✅ Đã set admin: ' + msg.chat.id, { reply_markup: mainKeyboard });
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Lỗi: ' + e.message);
  }
});

// Callback
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const dataCb = query.data || '';
  const from = query.from;

  try {
    await trackUser(from);

    if (dataCb.startsWith('p|')) {
      const productId = dataCb.slice(2);
      const data = await getData();
      const product = data.products.find(p => p.id === productId);
      if (!product) return bot.answerCallbackQuery(query.id, { text: 'Không tìm thấy sản phẩm' });

      const types = (product.types || []).filter(t => t.stock > 0);
      if (!types.length) return bot.answerCallbackQuery(query.id, { text: 'Hết hàng' });

      const reseller = isReseller(data, from.id);

      const keyboard = types.map(t => {
        let label;
        if (reseller && t.resellerPrice > 0) {
          // Giá gốc gạch ngang + giá RS + số lượng gọn
          const goc = strikeText(formatMoneyShort(t.price));
          const rs = formatMoneyShort(t.resellerPrice);
          label = t.name + ' ' + goc + ' (' + rs + ') x' + t.stock;
        } else {
          label = t.name + ' — ' + formatMoneyShort(t.price) + ' (còn ' + t.stock + ')';
        }
        // Telegram giới hạn ~64 ký tự mỗi nút
        if (label.length > 60) label = label.slice(0, 57) + '...';
        return [{ text: label, callback_data: 't|' + productId + '|' + t.id }];
      });
      keyboard.push([{ text: '« Quay lại', callback_data: 'back' }]);

      let header = '📦 ' + product.name + '\n\n';
      if (reseller) {
        header += 'Bạn là Reseller.\n';
        header += 'Hiển thị: Tên  ~~giá gốc~~  (giá RS) xSố lượng\n\n';
      }
      header += 'Chọn loại:';

      await bot.editMessageText(header, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    if (dataCb === 'back') {
      const data = await getData();
      const products = data.products.filter(p => p.types && p.types.some(t => t.stock > 0));
      const keyboard = products.map(p => [{ text: '🛒 ' + p.name, callback_data: 'p|' + p.id }]);
      await bot.editMessageText('📦 Chọn sản phẩm bạn muốn mua:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    if (dataCb.startsWith('t|')) {
      const parts = dataCb.split('|');
      const productId = parts[1];
      const typeId = parts[2];

      await bot.answerCallbackQuery(query.id, { text: 'Đang tạo đơn...' });

      const data = await getData();
      const product = data.products.find(p => p.id === productId);
      if (!product) return bot.sendMessage(chatId, 'Sản phẩm không tồn tại', { reply_markup: mainKeyboard });
      const type = (product.types || []).find(t => t.id === typeId);
      if (!type || type.stock < 1) return bot.sendMessage(chatId, 'Hết hàng', { reply_markup: mainKeyboard });

      const reseller = isReseller(data, from.id);
      const price = getPrice(type, reseller);
      const bank = data.config.bank;
      const orderId = makeOrderId();
      let paymentNote = 'Lấy SP ' + product.name + ' + ' + type.name + ' + ' + price;
      if (paymentNote.length > 50) {
        paymentNote = 'Lấy SP ' + product.name.slice(0, 12) + ' + ' + type.name.slice(0, 8) + ' + ' + price;
      }

      data.orders.push({
        id: orderId,
        userId: from.id,
        username: from.username || '',
        fullName: [from.first_name, from.last_name].filter(Boolean).join(' '),
        productId,
        productName: product.name,
        typeId,
        typeName: type.name,
        price: price,
        isReseller: reseller,
        status: 'pending',
        paymentNote,
        createdAt: new Date().toISOString()
      });
      await saveData(data);

      const qrUrl = vietQRUrl(bank, price, paymentNote);
      let text =
        '🧾 Đơn hàng ' + orderId + '\n\n' +
        'Sản phẩm: ' + product.name + '\n' +
        'Loại: ' + type.name + '\n' +
        'Số tiền: ' + formatMoney(price) + (reseller ? ' (giá Reseller)' : '') + '\n\n' +
        'Nội dung CK: ' + paymentNote + '\n\n' +
        '📲 Bấm vào link bên dưới để xem mã QR thanh toán:\n' +
        qrUrl + '\n\n' +
        'Sau khi chuyển khoản xong, bấm nút ✅ Đã thanh toán.';

      await bot.sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Đã thanh toán', callback_data: 'paid|' + orderId }]]
        }
      });

      try { await bot.deleteMessage(chatId, query.message.message_id); } catch (e) {}
      return;
    }

    if (dataCb.startsWith('paid|')) {
      const orderId = dataCb.slice(5);
      const data = await getData();
      const order = data.orders.find(o => o.id === orderId);
      if (!order) return bot.answerCallbackQuery(query.id, { text: 'Không tìm thấy đơn' });
      if (order.userId !== from.id) return bot.answerCallbackQuery(query.id, { text: 'Không phải đơn của bạn' });
      if (order.status !== 'pending') return bot.answerCallbackQuery(query.id, { text: 'Đơn đã được xử lý' });

      order.status = 'waiting_confirm';
      await saveData(data);
      await bot.answerCallbackQuery(query.id, { text: 'Đã gửi yêu cầu' });
      await bot.sendMessage(chatId,
        '✅ Bạn đã báo Đã thanh toán.\n\n' +
        '⏳ Vui lòng chờ ít phút, admin sẽ xác nhận đơn hàng và trả key về cho bạn.',
        { reply_markup: mainKeyboard }
      );

      const adminId = data.config && data.config.adminChatId;
      if (adminId) {
        try {
          await bot.sendMessage(adminId,
            '🔔 Khách báo đã thanh toán\n' +
            'Mã: ' + orderId + '\n' +
            order.productName + ' — ' + order.typeName + '\n' +
            formatMoney(order.price) + (order.isReseller ? ' (Reseller)' : '') + '\n' +
            'Nội dung: ' + order.paymentNote
          );
        } catch (e) {}
      }
      return;
    }
  } catch (err) {
    console.error(err);
    try { await bot.answerCallbackQuery(query.id, { text: 'Lỗi: ' + (err.message || '').slice(0, 40) }); } catch (e) {}
    try { await bot.sendMessage(chatId, 'Lỗi: ' + (err.message || err)); } catch (e) {}
  }
});

bot.on('polling_error', (err) => console.error('Polling:', err.message));
console.log('Bot ready');
