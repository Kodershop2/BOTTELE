/**
 * Shop Telegram Bot - Có đầy đủ dấu tiếng Việt
 */
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN || '9174341797:AAFsyiFSXwisG-UFvFmbiP_vHTWURBcLkfI';
const BIN_ID = process.env.BIN_ID || '6b065e37ffd5d16053dc0c74';
const MASTER_KEY = process.env.MASTER_KEY || '$2a$10$E3TfVjjxGA2Dy1881YzVOO.kjLRnQigWfUWmK5vj3Ny8h2gCbTl9e';

const API = 'https://api.jsonbin.io/v3/b/' + BIN_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('Bot started');

async function getData() {
  const res = await fetch(API + '/latest', {
    headers: { 'X-Master-Key': MASTER_KEY }
  });
  if (!res.ok) throw new Error('JSONBin lỗi ' + res.status);
  const json = await res.json();
  const data = json.record || { products: [], orders: [], config: {} };
  if (!data.products) data.products = [];
  if (!data.orders) data.orders = [];
  if (!data.config) data.config = {};
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

function formatMoney(n) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
}

function makeOrderId() {
  return 'DH' + Date.now().toString().slice(-8);
}

function vietQRUrl(bank, amount, addInfo) {
  const accName = encodeURIComponent(bank.name || '');
  const info = encodeURIComponent(addInfo || '');
  // template compact2 + qr_only để tăng khả năng Telegram tải được
  return 'https://img.vietqr.io/image/' + bank.bin + '-' + bank.account + '-compact2.png?amount=' + amount + '&addInfo=' + info + '&accountName=' + accName;
}

async function downloadQR(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/png,image/*'
    },
    redirect: 'follow',
    timeout: 15000
  });
  if (!res.ok) throw new Error('Tai QR fail ' + res.status);
  return await res.buffer();
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Chào bạn! Gửi /shop để xem sản phẩm.');
});

bot.onText(/\/setadmin/, async (msg) => {
  try {
    const data = await getData();
    data.config = data.config || {};
    data.config.adminChatId = msg.chat.id;
    await saveData(data);
    bot.sendMessage(msg.chat.id, '✅ Đã set admin: ' + msg.chat.id);
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Lỗi: ' + e.message);
  }
});

bot.onText(/\/shop/, async (msg) => {
  try {
    const data = await getData();
    const products = data.products.filter(p => p.types && p.types.some(t => t.stock > 0));
    if (!products.length) return bot.sendMessage(msg.chat.id, 'Chưa có sản phẩm nào.');

    const keyboard = products.map(p => [{ text: '🛒 ' + p.name, callback_data: 'p|' + p.id }]);
    await bot.sendMessage(msg.chat.id, '📦 Chọn sản phẩm bạn muốn mua:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Lỗi shop: ' + e.message);
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const dataCb = query.data || '';
  const from = query.from;

  try {
    // Chọn sản phẩm
    if (dataCb.startsWith('p|')) {
      const productId = dataCb.slice(2);
      const data = await getData();
      const product = data.products.find(p => p.id === productId);
      if (!product) return bot.answerCallbackQuery(query.id, { text: 'Không tìm thấy sản phẩm' });

      const types = (product.types || []).filter(t => t.stock > 0);
      if (!types.length) return bot.answerCallbackQuery(query.id, { text: 'Hết hàng' });

      const keyboard = types.map(t => [{
        text: t.name + ' — ' + formatMoney(t.price) + ' (còn ' + t.stock + ')',
        callback_data: 't|' + productId + '|' + t.id
      }]);
      keyboard.push([{ text: '« Quay lại', callback_data: 'back' }]);

      await bot.editMessageText('📦 ' + product.name + '\n\nChọn loại bạn muốn mua:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: keyboard }
      });
      return bot.answerCallbackQuery(query.id);
    }

    // Quay lại
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

    // Chọn loại → tạo đơn + gửi QR
    if (dataCb.startsWith('t|')) {
      const parts = dataCb.split('|');
      const productId = parts[1];
      const typeId = parts[2];

      await bot.answerCallbackQuery(query.id, { text: 'Đang tạo đơn...' });

      const data = await getData();
      const product = data.products.find(p => p.id === productId);
      if (!product) return bot.sendMessage(chatId, 'Sản phẩm không tồn tại');
      const type = (product.types || []).find(t => t.id === typeId);
      if (!type || type.stock < 1) return bot.sendMessage(chatId, 'Hết hàng');

      const bank = data.config.bank;
      const orderId = makeOrderId();
      let paymentNote = 'Lấy SP ' + product.name + ' + ' + type.name + ' + ' + type.price;
      if (paymentNote.length > 50) {
        paymentNote = 'Lấy SP ' + product.name.slice(0, 12) + ' + ' + type.name.slice(0, 8) + ' + ' + type.price;
      }

      data.orders.push({
        id: orderId,
        userId: from.id,
        username: from.username || '',
        fullName: [from.first_name, from.last_name].filter(Boolean).join(' '),
        productId: productId,
        productName: product.name,
        typeId: typeId,
        typeName: type.name,
        price: type.price,
        status: 'pending',
        paymentNote: paymentNote,
        createdAt: new Date().toISOString()
      });
      await saveData(data);

      const qrUrl = vietQRUrl(bank, type.price, paymentNote);
      const text =
        '🧾 Đơn hàng ' + orderId + '\n\n' +
        'Sản phẩm: ' + product.name + '\n' +
        'Loại: ' + type.name + '\n' +
        'Số tiền: ' + formatMoney(type.price) + '\n\n' +
        'Nội dung CK: ' + paymentNote + '\n\n' +
        '📲 Quét mã QR bên dưới để thanh toán.\n' +
        'Sau khi chuyển xong bấm nút Đã thanh toán.';

      const replyMarkup = {
        inline_keyboard: [[{ text: '✅ Đã thanh toán', callback_data: 'paid|' + orderId }]]
      };

      let sentPhoto = false;

      // Gửi ảnh bằng buffer đúng cách (source + filename)
      try {
        const buffer = await downloadQR(qrUrl);
        await bot.sendPhoto(chatId, {
          source: buffer,
          filename: 'vietqr.png'
        }, {
          caption: text,
          reply_markup: replyMarkup
        });
        sentPhoto = true;
      } catch (e1) {
        console.error('Buffer photo fail:', e1.message);
      }

      // Thử URL nếu buffer fail
      if (!sentPhoto) {
        try {
          await bot.sendPhoto(chatId, qrUrl, {
            caption: text,
            reply_markup: replyMarkup
          });
          sentPhoto = true;
        } catch (e2) {
          console.error('URL photo fail:', e2.message);
        }
      }

      if (!sentPhoto) {
        await bot.sendMessage(chatId, text + '\n\n⚠️ Không gửi được ảnh QR, bấm link:\n' + qrUrl, {
          reply_markup: replyMarkup
        });
      }

      try { await bot.deleteMessage(chatId, query.message.message_id); } catch (e) {}
      return;
    }

    // Bấm Đã thanh toán
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
        '⏳ Vui lòng chờ ít phút, admin sẽ xác nhận đơn hàng và trả key về cho bạn.'
      );

      const adminId = data.config && data.config.adminChatId;
      if (adminId) {
        try {
          await bot.sendMessage(adminId,
            '🔔 Khách báo đã thanh toán\n' +
            'Mã: ' + orderId + '\n' +
            order.productName + ' — ' + order.typeName + '\n' +
            formatMoney(order.price) + '\n' +
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
