/**
 * Shop Telegram Bot - UI đẹp
 */
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN || '9174341797:AAFsyiFSXwisG-UFvFmbiP_vHTWURBcLkfI';
const BIN_ID = process.env.BIN_ID || '6b065e37ffd5d16053dc0c74';
const MASTER_KEY = process.env.MASTER_KEY || '$2a$10$E3TfVjjxGA2Dy1881YzVOO.kjLRnQigWfUWmK5vj3Ny8h2gCbTl9e';
const API = 'https://api.jsonbin.io/v3/b/' + BIN_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('Bot started');

// Bỏ bàn phím dưới — nút hiện trên tin nhắn (inline)
const removeKeyboard = { remove_keyboard: true };

function topMenu() {
  return {
    inline_keyboard: [[
      { text: '🛍️ Mua hàng', callback_data: 'menu_shop' },
      { text: '🪪 ID của tôi', callback_data: 'menu_id' }
    ]]
  };
}

const LINE = '━━━━━━━━━━━━━━━━━━';

async function getData() {
  const res = await fetch(API + '/latest', { headers: { 'X-Master-Key': MASTER_KEY } });
  if (!res.ok) throw new Error('JSONBin lỗi ' + res.status);
  const json = await res.json();
  const data = json.record || { products: [], orders: [], config: {}, users: [] };
  if (!data.products) data.products = [];
  if (!data.orders) data.orders = [];
  if (!data.config) data.config = {};
  if (!data.users) data.users = [];
  if (!data.config.resellers) data.config.resellers = [];
  if (!data.config.bank) {
    data.config.bank = { bin: '970454', account: '99ZP26154M42407211', name: 'ZALOPAY_PHAM THI HUE' };
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
  if (asReseller && type.resellerPrice != null && type.resellerPrice > 0) return type.resellerPrice;
  return type.price;
}

async function trackUser(from) {
  try {
    const data = await getData();
    if (!data.users.find(u => u.id === from.id)) {
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

function strikeText(s) {
  return String(s).split('').map(c => c + '\u0336').join('');
}

function formatMoneyShort(n) {
  if (n >= 1000) return new Intl.NumberFormat('vi-VN').format(Math.round(n / 1000)) + 'k';
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

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ========== SHOP ==========
async function showShop(chatId, userId) {
  const data = await getData();
  const products = data.products.filter(p => p.types && p.types.some(t => t.stock > 0));
  const reseller = isReseller(data, userId);

  if (!products.length) {
    return bot.sendMessage(chatId,
      '🌙 <b>Cửa hàng đang trống</b>\n\n' + LINE + '\n\nHiện chưa có sản phẩm.\nHãy quay lại sau nhé! 💫',
      { parse_mode: 'HTML', reply_markup: topMenu() }
    );
  }

  let text = '🏪 <b>CỬA HÀNG</b> 🏪\n' + LINE + '\n';
  if (reseller) text += '💎 Bạn đang dùng <b>giá Reseller</b>\n\n';
  text += '👇 Chọn sản phẩm bên dưới:';

  const keyboard = products.map(p => {
    const stock = (p.types || []).reduce((s, t) => s + (t.stock || 0), 0);
    return [{ text: '🛒 ' + p.name, callback_data: 'p|' + p.id }];
  });
  keyboard.push([{ text: '🛍️ Mua hàng', callback_data: 'menu_shop' }]);

  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard }
  });
}

// ========== COMMANDS ==========
bot.onText(/\/start/, async (msg) => {
  await trackUser(msg.from);
  const name = escHtml(msg.from.first_name || 'bạn');

  // Xóa bàn phím dưới cũ (nếu còn)
  try {
    await bot.sendMessage(msg.chat.id, '⏳ Đang tải menu...', { reply_markup: removeKeyboard });
  } catch (e) {}

  const text =
    '✨ <b>Xin chào ' + name + '!</b> ✨\n\n' +
    '🎮 Chào mừng bạn đến cửa hàng\n' +
    LINE + '\n' +
    '🛍️ Bấm <b>Mua hàng</b> trên tin nhắn để xem sản phẩm\n' +
    '🪪 Bấm <b>ID của tôi</b> hoặc gõ /id\n' +
    '🏪 Gõ /shop để mở shop nhanh\n\n' +
    '💬 Cần hỗ trợ? Liên hệ admin nhé!';

  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'HTML',
    reply_markup: topMenu()
  });
});

bot.onText(/\/id/, async (msg) => {
  await trackUser(msg.from);
  const data = await getData();
  const reseller = isReseller(data, msg.from.id);
  const text =
    '🪪 <b>THÔNG TIN TÀI KHOẢN</b>\n' + LINE + '\n' +
    '🔢 ID: <code>' + msg.from.id + '</code>\n' +
    (msg.from.username ? '👤 Username: @' + escHtml(msg.from.username) + '\n' : '') +
    '🏷️ Vai trò: ' + (reseller ? '💎 <b>Reseller</b>' : '👤 Khách thường');

  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'HTML',
    reply_markup: topMenu()
  });
});

bot.onText(/\/shop/, async (msg) => {
  await trackUser(msg.from);
  try {
    await showShop(msg.chat.id, msg.from.id);
  } catch (e) {
    bot.sendMessage(msg.chat.id, '⚠️ Lỗi: ' + e.message, { reply_markup: removeKeyboard });
  }
});

bot.onText(/\/setadmin/, async (msg) => {
  try {
    const data = await getData();
    data.config = data.config || {};
    data.config.adminChatId = msg.chat.id;
    await saveData(data);
    bot.sendMessage(msg.chat.id, '✅ Đã set admin: <code>' + msg.chat.id + '</code>', {
      parse_mode: 'HTML',
      reply_markup: topMenu()
    });
  } catch (e) {
    bot.sendMessage(msg.chat.id, '⚠️ Lỗi: ' + e.message);
  }
});

// Không còn reply keyboard — bỏ handler nút dưới


// ========== CALLBACK ==========
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const dataCb = query.data || '';
  const from = query.from;

  try {
    await trackUser(from);

    // Menu trên tin nhắn
    if (dataCb === 'menu_shop') {
      await bot.answerCallbackQuery(query.id);
      try { await showShop(chatId, from.id); }
      catch (e) { await bot.sendMessage(chatId, '⚠️ Lỗi: ' + e.message, { reply_markup: topMenu() }); }
      return;
    }

    if (dataCb === 'menu_id') {
      await bot.answerCallbackQuery(query.id);
      const data = await getData();
      const reseller = isReseller(data, from.id);
      const text =
        '🪪 <b>THÔNG TIN TÀI KHOẢN</b>\n' + LINE + '\n' +
        '🔢 ID: <code>' + from.id + '</code>\n' +
        (from.username ? '👤 Username: @' + escHtml(from.username) + '\n' : '') +
        '🏷️ Vai trò: ' + (reseller ? '💎 <b>Reseller</b>' : '👤 Khách thường');
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: topMenu() });
      return;
    }

    // Chọn sản phẩm
    if (dataCb.startsWith('p|')) {
      const productId = dataCb.slice(2);
      const data = await getData();
      const product = data.products.find(p => p.id === productId);
      if (!product) return bot.answerCallbackQuery(query.id, { text: 'Không tìm thấy sản phẩm' });

      const types = (product.types || []).filter(t => t.stock > 0);
      if (!types.length) return bot.answerCallbackQuery(query.id, { text: 'Hết hàng' });

      const reseller = isReseller(data, from.id);

      let text = '🎯 <b>' + escHtml(product.name) + '</b>\n' + LINE + '\n';
      if (reseller) {
        text += '💎 <b>Giá Reseller</b> đang được áp dụng\n';
        text += '╰ Tên · ~~giá gốc~~ · (giá RS) · tồn\n\n';
      } else {
        text += '👇 Chọn loại phù hợp với bạn:\n\n';
      }

      const keyboard = types.map(t => {
        let label;
        if (reseller && t.resellerPrice > 0) {
          label = t.name + ' ' + strikeText(formatMoneyShort(t.price)) + ' (' + formatMoneyShort(t.resellerPrice) + ') x' + t.stock;
        } else {
          label = t.name + ' · ' + formatMoneyShort(t.price) + ' · còn ' + t.stock;
        }
        if (label.length > 60) label = label.slice(0, 57) + '...';
        return [{ text: label, callback_data: 't|' + productId + '|' + t.id }];
      });
      keyboard.push([{ text: '↩️ Quay lại cửa hàng', callback_data: 'back' }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    // Quay lại
    if (dataCb === 'back') {
      const data = await getData();
      const products = data.products.filter(p => p.types && p.types.some(t => t.stock > 0));
      const reseller = isReseller(data, from.id);

      let text = '🏪 <b>CỬA HÀNG</b> 🏪\n' + LINE + '\n';
      if (reseller) text += '💎 Bạn đang dùng <b>giá Reseller</b>\n\n';
      text += '👇 Chọn sản phẩm bên dưới:';

      const keyboard = products.map(p => {
        const stock = (p.types || []).reduce((s, t) => s + (t.stock || 0), 0);
        return [{ text: '🛒 ' + p.name, callback_data: 'p|' + p.id }];
      });
      keyboard.push([{ text: '🛍️ Mua hàng', callback_data: 'menu_shop' }]);
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    // Chọn loại → tạo đơn
    if (dataCb.startsWith('t|')) {
      const parts = dataCb.split('|');
      const productId = parts[1];
      const typeId = parts[2];
      await bot.answerCallbackQuery(query.id, { text: 'Đang tạo đơn...' });

      const data = await getData();
      const product = data.products.find(p => p.id === productId);
      if (!product) return bot.sendMessage(chatId, '⚠️ Sản phẩm không tồn tại', { reply_markup: removeKeyboard });
      const type = (product.types || []).find(t => t.id === typeId);
      if (!type || type.stock < 1) return bot.sendMessage(chatId, '⚠️ Hết hàng', { reply_markup: removeKeyboard });

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
        price,
        isReseller: reseller,
        status: 'pending',
        paymentNote,
        createdAt: new Date().toISOString()
      });
      await saveData(data);

      const qrUrl = vietQRUrl(bank, price, paymentNote);
      const text =
        '🧾 <b>ĐƠN HÀNG</b>  ·  <code>' + orderId + '</code>\n' + LINE + '\n' +
        '🎯 Sản phẩm: <b>' + escHtml(product.name) + '</b>\n' +
        '📂 Loại: ' + escHtml(type.name) + '\n' +
        '💵 Số tiền: <b>' + formatMoney(price) + '</b>' + (reseller ? '  💎' : '') + '\n' +
        '✍️ Nội dung CK:\n<code>' + escHtml(paymentNote) + '</code>\n\n' +
        LINE + '\n' +
        '📷 <b>Bấm link để mở mã QR thanh toán:</b>\n' +
        qrUrl + '\n\n' +
        '👇 Sau khi chuyển khoản xong, bấm nút bên dưới';

      await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Tôi đã thanh toán', callback_data: 'paid|' + orderId }]]
        }
      });

      try { await bot.deleteMessage(chatId, query.message.message_id); } catch (e) {}
      return;
    }

    // Đã thanh toán
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

      const text =
        '⏳ <b>ĐANG CHỜ XÁC NHẬN</b>\n' + LINE + '\n' +
        '✅ Bạn đã báo <b>Đã thanh toán</b>\n\n' +
        '👨‍💻 Admin sẽ kiểm tra giao dịch\n' +
        '🔑 và gửi key trong ít phút nữa\n\n' +
        '🙏 Vui lòng chờ, không spam nhé!';

      await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: topMenu() });

      const adminId = data.config && data.config.adminChatId;
      if (adminId) {
        try {
          await bot.sendMessage(adminId,
            '🔔 <b>CÓ ĐƠN CẦN DUYỆT</b>\n' + LINE + '\n' +
            '🧾 Mã: <code>' + orderId + '</code>\n' +
            '🎯 SP: ' + escHtml(order.productName) + ' — ' + escHtml(order.typeName) + '\n' +
            '💵 Tiền: <b>' + formatMoney(order.price) + '</b>' + (order.isReseller ? ' 💎' : '') + '\n' +
            '✍️ CK: <code>' + escHtml(order.paymentNote) + '</code>\n' +
            '👤 Khách: ' + escHtml(order.fullName || order.username || String(order.userId)),
            { parse_mode: 'HTML' }
          );
        } catch (e) {}
      }
      return;
    }
  } catch (err) {
    console.error(err);
    try { await bot.answerCallbackQuery(query.id, { text: 'Lỗi: ' + (err.message || '').slice(0, 40) }); } catch (e) {}
    try { await bot.sendMessage(chatId, '⚠️ Lỗi: ' + (err.message || err)); } catch (e) {}
  }
});

bot.on('polling_error', (err) => console.error('Polling:', err.message));
console.log('Bot ready');
