"""Build an allowlisted public runtime without copying repository history or data."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = Path.cwd()
config = json.loads((ROOT / '.github/pages.json').read_text())
OUTPUT = ROOT / 'dist-pages'
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
OUTPUT.mkdir(parents=True)
site = config['site_repository']
base = '/' + site.split('/')[1] + '/'

if config.get('directory') == 'dist-runtime' and (ROOT / 'dist-runtime').exists():
    shutil.rmtree(ROOT / 'dist-runtime')

for command in config.get('commands', []):
    subprocess.run(command, check=True, env={**os.environ, 'GITHUB_PAGES': 'true'})

def copy(source, destination):
    if source.is_symlink():
        raise ValueError('Symlinks cannot be published: ' + str(source))
    if source.is_dir():
        for child in source.iterdir():
            copy(child, destination / child.name)
    elif source.is_file():
        if source.suffix == '.map' or source.name.startswith('.env'):
            return
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    else:
        raise ValueError('Missing publication input: ' + str(source))

for name in config['files']:
    source = ROOT / name
    destination = OUTPUT / (source.name if config.get('flatten') else name)
    if config.get('directory'):
        destination = OUTPUT / source.relative_to(ROOT / config['directory'])
    copy(source, destination)

for extra in config.get('extras', []):
    copy(ROOT / extra['source'], OUTPUT / extra['destination'])
    prefix = base + extra['destination'].strip('/') + '/'
    for artifact in (OUTPUT / extra['destination']).rglob('*'):
        if artifact.suffix in {'.html', '.js', '.css', '.txt'}:
            text = artifact.read_text()
            text = re.sub(r'([\"\'])/(img|video|audio|fonts)/', lambda m: m[1] + prefix + m[2] + '/', text)
            text = text.replace('https://allen7wang.github.io/llms-full.txt', 'https://allen7wang.github.io' + prefix + 'llms-full.txt')
            artifact.write_text(text)

if config.get('relative_assets'):
    for path in OUTPUT.rglob('*'):
        if path.suffix in {'.html', '.css'}:
            text = path.read_text()
            text = re.sub(r'((?:src|href|action)=[\"\'])/(?!/)', r'\1' + base, text)
            text = re.sub(r'(url\([\"\']?)/(?!/)', r'\1' + base, text)
            path.write_text(text)

if config.get('browser_storage'):
    path = OUTPUT / 'index.html'
    path.write_text(path.read_text().replace('<head>', '<head><script>globalThis.STUDY_STATIC=true;</script>'))
    path = OUTPUT / 'app.mjs'
    path.write_text(path.read_text().replace('本机连接中断 · ', '').replace('本机', '浏览器').replace('暂存浏览器', '保存到浏览器'))

if config.get('backend') and not config.get('native_connection_ui'):
    copy(ROOT / 'scripts/pages-connection.js', OUTPUT / 'pages-connection.js')
    for path in OUTPUT.rglob('*.html'):
        text = path.read_text()
        # Pause application startup until the visitor explicitly chooses a service.
        text = re.sub(r'<script\b([^>]*)>', lambda m: '<script type="text/plain" data-pages-script' + re.sub(r'\s+type=[\"\']([^\"\']+)[\"\']', lambda t: ' data-original-type="' + t[1] + '"', m[1]) + '>', text)
        text = text.replace('</head>', '<script>window.__PAGES_BASE__=' + json.dumps(base.rstrip('/')) + ';</script><script src="' + base + 'pages-connection.js"' + (' data-native-ui="true"' if config.get('native_connection_ui') else '') + (' data-cookies="true"' if config.get('cookies') else '') + ' data-project="' + config['title'] + '"></script></head>')
        path.write_text(text)

if config.get('native_connection_ui'):
    path = OUTPUT / 'index.html'
    path.write_text(path.read_text().replace('</head>', '<script>window.__PAGES_BASE__=' + json.dumps(base.rstrip('/')) + ';</script></head>'))

if config.get('api_optional'):
    copy(ROOT / 'scripts/pages-connection.js', OUTPUT / 'pages-connection.js')
    path = OUTPUT / 'index.html'
    path.write_text(path.read_text().replace('</head>', '<script src="' + base + 'pages-connection.js" data-optional="true" data-project="' + config['title'] + '"></script></head>'))

if not (OUTPUT / 'index.html').is_file():
    raise ValueError('Publication has no index.html')
(OUTPUT / '.nojekyll').write_text('')
if config.get('backend') or config.get('spa'):
    shutil.copyfile(OUTPUT / 'index.html', OUTPUT / '404.html')
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
manifest = {'source_repository': config['source_repository'], 'source_commit': sha, 'base': base,
            'backend_required': bool(config.get('backend')), 'files': {}}
for path in sorted(OUTPUT.rglob('*')):
    if path.is_file():
        manifest['files'][str(path.relative_to(OUTPUT))] = hashlib.sha256(path.read_bytes()).hexdigest()
(OUTPUT / 'pages-build.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'site': site, 'source': sha, 'files': len(manifest['files']), 'output': str(OUTPUT)}))
