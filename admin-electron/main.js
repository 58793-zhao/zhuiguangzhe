/**
 * 眼镜店管理系统 - 后台管理端
 * 独立桌面应用，直接进入后台管理页面
 */

const { app, BrowserWindow, Menu, shell } = require('electron');

// 后台管理端地址
const ADMIN_URL = 'https://zhuiguangzhe.onrender.com/admin';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: '眼镜店管理系统 - 后台管理端',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    show: false,
    backgroundColor: '#667eea'
  });

  mainWindow.loadURL(ADMIN_URL);

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

// 简化菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '刷新', accelerator: 'F5', click: () => { if (mainWindow) mainWindow.reload(); } },
        { type: 'separator' },
        { label: '退出', accelerator: 'Ctrl+Q', click: () => { app.quit(); } }
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
              message: '眼镜店管理系统 - 后台管理端 v1.0.0',
              detail: '本软件由 TT 游戏工作室与豆包结合开发\n\n用于监控在线设备、强制下线、修改密码'
            });
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 防止渲染进程崩溃
app.on('render-process-gone', () => {
  if (mainWindow) mainWindow.reload();
});
