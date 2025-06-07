require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { google } = require("googleapis");
const fs = require("fs");

// Load Kategori dari File
let kategoriMap = {};
const kategoriFile = "kategori.json";

if (fs.existsSync(kategoriFile)) {
  kategoriMap = JSON.parse(fs.readFileSync(kategoriFile));
}

// WhatsApp Setup
const client = new Client({ authStrategy: new LocalAuth() });

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ Bot WhatsApp siap digunakan!"));

// Google Sheets Setup
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

client.on("message", async (msg) => {
  const allowedUser = "6287842383037@c.us";
  const sender = msg.from.includes("@g.us") ? msg.author : msg.from;

  if (sender !== allowedUser) return;

  const input = msg.body.trim();
  const match = input.match(/(.+)\s+(\d{1,3}(?:[.,]\d{3})*[Kk]?|\d+[Kk]?)/);
  if (!match) {
    await msg.reply("❌ Format salah. Gunakan: <item> <nominal>\nContoh: kopi 10K");
    return;
  }

  const item = match[1];
  const nominal = match[2].toUpperCase().replace("K", "000").replace(/[.,]/g, "");

  // Cek apakah item punya kategori
  let kategori = "Lainnya";
  for (let key in kategoriMap) {
    if (item.toLowerCase().includes(key)) {
      kategori = kategoriMap[key];
      break;
    }
  }

  // Jika tidak ditemukan, minta input kategori baru
  if (kategori === "Lainnya") {
    await msg.reply(`❓ Kategori untuk *"${item}"* tidak ditemukan.\nBalas pesan ini dengan kategori baru dalam 1 menit.\nAtau biarkan saja untuk masuk ke *Lainnya*.`);

    const listener = async (res) => {
      const replySender = res.from.includes("@g.us") ? res.author : res.from;
      if (replySender === sender && res.body !== msg.body) {
        kategori = res.body.trim();
        kategoriMap[item.toLowerCase()] = kategori;
        fs.writeFileSync(kategoriFile, JSON.stringify(kategoriMap, null, 2));
        client.removeListener("message_create", listener);
        await simpanTransaksi(item, nominal, kategori, sender, msg);
      }
    };

    client.on("message_create", listener);

    setTimeout(async () => {
      client.removeListener("message_create", listener);
      await simpanTransaksi(item, nominal, kategori, sender, msg);
    }, 60000);

    return;
  }

  // Langsung simpan jika kategori dikenali
  await simpanTransaksi(item, nominal, kategori, sender, msg);
});

// Fungsi simpan ke Google Sheets
async function simpanTransaksi(item, nominal, kategori, sender, msg) {
  const date = new Date().toLocaleString("id-ID");
  const values = [[date, item, nominal, kategori, sender]];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Transaksi!A1",
      valueInputOption: "USER_ENTERED",
      resource: { values },
    });

    await msg.reply(
      `*✅ Transaksi Tercatat*\n━━━━━━━━━━━━━━━\n📅 *Tanggal:* ${date}\n🛍️ *Item:* ${item}\n💸 *Jumlah:* Rp${nominal}\n🗂️ *Kategori:* ${kategori}\n━━━━━━━━━━━━━━━\n💡 *"Uangmu adalah cermin keputusanmu."*`
    );
  } catch (err) {
    console.error("❌ Error saat menulis ke sheet:", err.message);
    await msg.reply("❌ Gagal mencatat transaksi. Silakan coba lagi.");
  }
}

client.initialize();
