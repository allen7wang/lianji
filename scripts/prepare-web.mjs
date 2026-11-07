import { readFile, writeFile, copyFile } from 'node:fs/promises';
const path = 'dist/index.html';
let html = await readFile(path, 'utf8');
html = html.replace('<html lang="en">', '<html lang="zh-CN">');
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, '<script data-expo-entry="$1" type="text/plain"></script>');
html = html.replace('</head>', '<script src="/lianji-web/web-start.js" defer></script></head>');
await writeFile(path, html);
await copyFile(path, 'dist/404.html');
