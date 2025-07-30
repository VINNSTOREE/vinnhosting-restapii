const axios = require('axios');
const fs = require('fs');
const crypto = require("crypto");
const { createQRIS, checkQiospayStatus, getQiospaySaldo } = require('./qiospay-qris');
const QRCode = require('qrcode');
const { ImageUploadService } = require('node-upload-images');

const config = {
  qiospay_merchant: 'CP0xx',
  qiospay_apikey: '137c9ddc5e055636ef79d68f9e2709f5f4955382xxx',
  qiospay_checkurl() {
    return `https://qiospay.id/api/mutasi/qris/${this.qiospay_merchant}/${this.qiospay_apikey}`;
  }
};

function convertCRC16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ("000" + (crc & 0xFFFF).toString(16).toUpperCase()).slice(-4);
}

function generateTransactionId() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function generateExpirationTime() {
  const expirationTime = new Date();
  expirationTime.setMinutes(expirationTime.getMinutes() + 30);
  return expirationTime;
}

async function uploadQRBuffer(buffer) {
  const service = new ImageUploadService('pixhost.to');
  const { directLink } = await service.uploadFromBinary(buffer, 'qris.png');
  return directLink;
}

async function createQRIS(amount, staticQR) {
  try {
    let qrisData = staticQR.slice(0, -4);
    const step1 = qrisData.replace("010211", "010212");
    const step2 = step1.split("5802ID");

    amount = amount.toString();
    let uang = "54" + ("0" + amount.length).slice(-2) + amount + "5802ID";

    const result = step2[0] + uang + step2[1] + convertCRC16(step2[0] + uang + step2[1]);
    const buffer = await QRCode.toBuffer(result);
    const uploadedLink = await uploadQRBuffer(buffer);

    return {
      idtransaksi: generateTransactionId(),
      jumlah: amount,
      expired: generateExpirationTime(),
      imageqris: {
        url: uploadedLink
      }
    };
  } catch (error) {
    throw new Error("Gagal membuat QRIS: " + error.message);
  }
}

async function checkQiospayStatus(nominal) {
  try {
    const res = await axios.get(config.qiospay_checkurl());
    const result = res.data;

    if (!result || !result.data) return null;

    const match = result.data.find(tx => tx.type === "CR" && parseInt(tx.amount) === parseInt(nominal));
    return match || null;
  } catch (error) {
    throw new Error("Gagal cek status: " + error.message);
  }
}

async function getQiospaySaldo() {
  try {
    const res = await axios.get(config.qiospay_checkurl());
    const result = res.data;
    const latest = result.data.find(tx => tx.type === "CR");
    return latest ? latest.balance : null;
  } catch (error) {
    throw new Error("Gagal cek saldo: " + error.message);
  }
}

module.exports = {
  createQRIS,
  checkQiospayStatus,
  getQiospaySaldo
};
