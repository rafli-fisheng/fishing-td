'use strict';
/* Fishing Torque & Drag – Windows desktop program.
   The calculation and the screens live in app/index.html. This file gives it a desktop window:
   a menu with keyboard shortcuts, real Open/Save dialogs, opening case files from Explorer,
   and remembering the window size. Everything runs offline. */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, protocol, net, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_NAME = 'Fishing Torque & Drag';
const APP_DIR = path.join(__dirname, 'app');
let win = null;
let pendingCase = null;

/* The app is served from app://local/ so that ES modules (the 3D viewer) and storage work as on a website. */
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

/* ---------- small settings file (window size, last folder) ---------- */
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch (e) { return {}; } }
function writePrefs() { try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
let prefs = {};
function lastDir() { return prefs.lastDir && fs.existsSync(prefs.lastDir) ? prefs.lastDir : app.getPath('documents'); }
function rememberDir(file) { prefs.lastDir = path.dirname(file); writePrefs(); }

/* ---------- run an action exactly as if its button in the page were clicked ---------- */
function run(js) { if (win) win.webContents.executeJavaScript(js).catch(() => {}); }
function act(name) { run(`window.TDApp&&TDApp.act(${JSON.stringify(name)})`); }
function tab(name) { run(`window.TDApp&&TDApp.tab(${JSON.stringify(name)})`); }

/* ---------- case files ---------- */
function caseFromArgs(argv) { return argv.slice(1).find((a) => /\.(json|tdcase)$/i.test(a) && fs.existsSync(a)) || null; }
function loadCaseFile(file) {
  if (!win) { pendingCase = file; return; }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); JSON.parse(text); } catch (e) {
    dialog.showErrorBox(APP_NAME, 'Could not open ' + path.basename(file) + '\n\n' + e.message);
    return;
  }
  rememberDir(file);
  app.addRecentDocument(file);
  run(`window.TDApp&&TDApp.loadText(${JSON.stringify(text)}, ${JSON.stringify(path.basename(file))})`);
}
async function openCaseDialog() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open case', defaultPath: lastDir(), properties: ['openFile'],
    filters: [{ name: 'Torque & drag case', extensions: ['json', 'tdcase'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (!r.canceled && r.filePaths[0]) loadCaseFile(r.filePaths[0]);
}

/* ---------- menu ---------- */
function buildMenu() {
  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'New case', accelerator: 'CmdOrCtrl+N', click: () => act('new-blank') },
        { label: 'Open case…', accelerator: 'CmdOrCtrl+O', click: openCaseDialog },
        { label: 'Save case…', accelerator: 'CmdOrCtrl+S', click: () => act('save-case') },
        { type: 'separator' },
        { label: 'Import survey…', accelerator: 'CmdOrCtrl+I', click: () => { tab('path'); act('survey-file'); } },
        { type: 'separator' },
        { label: 'Download PDF report…', accelerator: 'CmdOrCtrl+Shift+P', click: () => act('pdf') },
        { label: 'Save detailed report (.html)…', click: () => act('dl-report') },
        { label: 'Print detailed report…', accelerator: 'CmdOrCtrl+P', click: () => act('print') },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    { label: '&Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: '&Go',
      submenu: [
        ['job', 'Job', '1'], ['path', 'Well path', '2'], ['wellbore', 'Wellbore & fluid', '3'], ['string', 'String', '4'],
        ['operation', 'Operation', '5'], ['results', 'Results', '6'], ['simple', 'PDF report', '7'], ['report', 'Detailed report', '8']
      ].map(([id, label, key]) => ({ label, accelerator: 'CmdOrCtrl+' + key, click: () => tab(id) }))
    },
    {
      label: '&View',
      submenu: [
        {
          label: 'Theme', submenu: [
            { label: 'Follow Windows', type: 'radio', checked: (prefs.theme || 'system') === 'system', click: () => setTheme('system') },
            { label: 'Light', type: 'radio', checked: prefs.theme === 'light', click: () => setTheme('light') },
            { label: 'Dark', type: 'radio', checked: prefs.theme === 'dark', click: () => setTheme('dark') }
          ]
        },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Reload', accelerator: 'F5', click: () => win && win.reload() },
        { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => win && win.webContents.toggleDevTools() }
      ]
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
        {
          label: 'About ' + APP_NAME,
          click: () => dialog.showMessageBox(win, {
            type: 'info', title: 'About', message: APP_NAME + ' ' + app.getVersion(),
            detail: 'Torque and drag for fishing jobs: soft-string model with a stiff-BHA beam zone, ' +
              'pick-up / slack-off / rotating weights, buckling, jarring, back-off, milling and washover, stuck point and friction calibration. ' +
              'Well trajectory in 2D and 3D.\n\nRuns fully offline. The open case is kept automatically; use File > Save case to keep a copy as a file.'
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function setTheme(t) {
  prefs.theme = t; writePrefs();
  nativeTheme.themeSource = t;
  run(`window.TDApp&&TDApp.theme(${JSON.stringify(t)})`);
}

/* ---------- window ---------- */
function createWindow() {
  const b = prefs.bounds || {};
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: b.width || 1360, height: b.height || 880, x: b.x, y: b.y, minWidth: 980, minHeight: 600,
    title: APP_NAME, show: false, autoHideMenuBar: true,
    backgroundColor: dark ? '#0e1418' : '#f3f5f6',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  if (prefs.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    prefs.maximized = win.isMaximized();
    if (!prefs.maximized && !win.isMinimized() && !win.isFullScreen()) prefs.bounds = win.getBounds();
    writePrefs();
  };
  win.on('resized', saveBounds); win.on('moved', saveBounds); win.on('close', saveBounds);
  win.on('closed', () => { win = null; });

  // Stay on the app; web links open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });

  // Every file the page saves (case, PDF, report) goes through a Save dialog.
  win.webContents.session.on('will-download', (e, item) => {
    const name = item.getFilename();
    const ext = path.extname(name).slice(1).toLowerCase();
    const kinds = { pdf: 'PDF report', json: 'Torque & drag case', html: 'Report (web page)' };
    const file = dialog.showSaveDialogSync(win, {
      title: 'Save ' + (kinds[ext] || 'file'), defaultPath: path.join(lastDir(), name),
      filters: [{ name: kinds[ext] || 'File', extensions: [ext || '*'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (!file) { item.cancel(); return; }
    item.setSavePath(file);
    rememberDir(file);
    item.once('done', (ev, state) => {
      if (state !== 'completed') return;
      if (ext === 'json') app.addRecentDocument(file);
      if (ext === 'pdf' || ext === 'html') {
        const choice = dialog.showMessageBoxSync(win, { type: 'info', title: APP_NAME, message: 'Saved ' + path.basename(file), buttons: ['OK', 'Open', 'Show in folder'], defaultId: 0, cancelId: 0, noLink: true });
        if (choice === 1) shell.openPath(file); else if (choice === 2) shell.showItemInFolder(file);
      }
    });
  });

  win.webContents.on('did-finish-load', () => {
    if (prefs.theme && prefs.theme !== 'system') run(`window.TDApp&&TDApp.theme(${JSON.stringify(prefs.theme)})`);
    if (pendingCase) { const f = pendingCase; pendingCase = null; loadCaseFile(f); }
  });
  win.loadURL('app://local/index.html');
}

ipcMain.handle('td:open', () => openCaseDialog());
ipcMain.handle('td:version', () => app.getVersion());

/* ---------- start ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const f = caseFromArgs(argv); if (f) loadCaseFile(f);
  });
  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(APP_DIR, rel));
      if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    if (process.platform === 'win32') app.setAppUserModelId('com.fishingtd.desktop');
    prefs = readPrefs();
    if (prefs.theme) nativeTheme.themeSource = prefs.theme;
    pendingCase = caseFromArgs(process.argv);
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
