const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const open = (...args) => import('open').then(mod => mod.default(...args));
const express = require('express');
const axios = require('axios');

// Google Cloud Consoleで発行した「ウェブアプリ」用クライアントID/シークレット/リダイレクトURI
const CLIENT_ID = '1001714813438-qqe7u5l88u0or7qd350ep1boq34bvhvi.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:51800/callback';

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'client/preload.js')
    }
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'client/build/index.html')}`;
  win.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('google-auth', async () => {
    // 1. 認証URLを生成
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly')}` +
      `&access_type=offline` +
      `&prompt=consent`;

    // 2. ローカルサーバーを立てて認可コードを待つ
    const expressApp = express();
    let server;
    const codePromise = new Promise((resolve, reject) => {
      expressApp.get('/callback', (req, res) => {
        const code = req.query.code;
        res.send('<h2>認証が完了しました。アプリに戻ってください。</h2>');
        resolve(code);
        setTimeout(() => server && server.close(), 1000);
      });
      server = expressApp.listen(51800);
    });

    // 3. 外部ブラウザで認証URLを開く
    await open(authUrl);

    // 4. 認可コードを受け取る
    const code = await codePromise;

    // 5. 認可コードからアクセストークンを取得
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }
    });

    return tokenRes.data; // { access_token, refresh_token, ... }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
}); 