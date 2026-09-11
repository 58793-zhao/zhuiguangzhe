/**
 * 眼镜店管理系统 - Electron 桌面应用主进程
 * 本质是一个加载服务器地址的浏览器壳
 */

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// ========== 配置 ==========
// 部署到Render后，将下面的地址替换为你的Render应用真实地址
// 例如：https://your-glasses-shop.onrender.com
const SERVER_URL = 'https://zhuiguangzhe.onrender.com';

// 本地开发时可改为：const SERVER_URL = 'http://localhost:3000';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '眼镜店管理系统',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    show: false,
    backgroundColor: '#1e293b'
  });

  // 加载服务器地址
  mainWindow.loadURL(SERVER_URL);

  // 页面加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 外部链接在系统浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 自定义菜单（简化版，保留打印等功能）
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '刷新',
          accelerator: 'F5',
          click: () => { if (mainWindow) mainWindow.reload(); }
        },
        {
          label: '打印',
          accelerator: 'Ctrl+P',
          click: () => { if (mainWindow) mainWindow.webContents.print(); }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => { app.quit(); }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'Ctrl+X', role: 'cut' },
        { label: '复制', accelerator: 'Ctrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'Ctrl+V', role: 'paste' },
        { label: '全选', accelerator: 'Ctrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '放大',
          accelerator: 'Ctrl+=',
          click: () => {
            if (mainWindow) {
              const currentZoom = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
            }
          }
        },
        {
          label: '缩小',
          accelerator: 'Ctrl+-',
          click: () => {
            if (mainWindow) {
              const currentZoom = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.max(0.5, currentZoom - 0.1));
            }
          }
        },
        {
          label: '重置缩放',
          accelerator: 'Ctrl+0',
          click: () => { if (mainWindow) mainWindow.webContents.setZoomFactor(1.0); }
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: 'F11',
          click: () => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()); }
        },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '眼镜店管理系统 v1.0.0',
              detail: '本软件由 TT 游戏工作室与豆包结合开发\n\n支持多门店数据共享的眼镜店管理系统'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App 事件
app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 防止应用因渲染进程崩溃而退出
app.on('render-process-gone', (event, webContents, details) => {
  console.error('渲染进程崩溃:', details);
  if (mainWindow) {
    mainWindow.reload();
  }
});
