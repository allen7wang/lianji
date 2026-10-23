"""Rebuild reviewed, licensed local GIFs; originals stay outside the repo.

Requires ffmpeg and Pillow. Example:
  python3 scripts/prepare-exercise-demos.py --cache-dir "$TMPDIR/lianji-media"
Source identity, actual exercise variant and transformations live in media-sources.json.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def build(source, cache, destination):
    cache_name = source.get('cacheFile') or f'wger-{source["videoId"]}.MOV'
    if Path(cache_name).name != cache_name:
        raise ValueError('Source cache files must stay inside the selected cache directory')
    original = cache / cache_name
    # Also reuse the exercise-named MOV files from an earlier local review session.
    reviewed = cache / f'{source["id"]}.MOV'
    if not original.exists() and reviewed.exists():
        original = reviewed
    if not original.exists():
        url = source.get('downloadUrl') or source['videoUrl']
        partial = original.with_name(original.name + '.download')
        if shutil.which('curl'):
            # Keep interrupted bytes: large source MOVs can exceed a single request window.
            for _ in range(4):
                result = subprocess.run([
                    'curl', '-L', '--fail', '--silent', '--show-error',
                    '--continue-at', '-', '--max-time', '180',
                    '--user-agent', 'LianjiMediaBuild/1.0', url, '-o', str(partial),
                ], timeout=200)
                if result.returncode == 0:
                    partial.replace(original)
                    break
                if result.returncode == 33:
                    raise RuntimeError(f'Server refused resume; inspect the retained download: {partial}')
            else:
                raise RuntimeError(f'Source download incomplete; retained for resume: {partial}')
        else:
            request = urllib.request.Request(url, headers={'User-Agent': 'LianjiMediaBuild/1.0'})
            with urllib.request.urlopen(request, timeout=120) as response, partial.open('wb') as file:
                shutil.copyfileobj(response, file)
            partial.replace(original)
    if sha256(original) != source['sourceSha256']:
        raise ValueError(f'Source changed; review it again before converting: {source["id"]}')
    output = destination / source['asset']
    temporary = output.with_suffix('.tmp.gif')
    filters = (
        f'fps={source["fps"]},scale={source["width"]}:-2:flags=lanczos,split[a][b];'
        f'[a]palettegen=max_colors={source["colors"]}:stats_mode=full[p];'
        '[b][p]paletteuse=dither=none:diff_mode=rectangle'
    )
    try:
        subprocess.run([
            'ffmpeg', '-nostdin', '-y', '-v', 'error',
            '-ss', str(source['startSeconds']), '-i', str(original),
            '-t', str(source['durationSeconds']), '-an',
            '-filter_complex', filters, '-loop', '0', str(temporary),
        ], check=True)
        with Image.open(temporary) as image:
            if image.format != 'GIF' or getattr(image, 'n_frames', 1) < 2:
                raise ValueError(f'Invalid animation: {source["id"]}')
            if image.width != source['width'] or image.info.get('loop') != 0:
                raise ValueError(f'Invalid image dimensions/loop: {source["id"]}')
            for frame in range(getattr(image, 'n_frames', 1)):
                image.seek(frame)
                image.load()
            print(f'{source["id"]}: {image.size}, {getattr(image, "n_frames", 1)} frames, {temporary.stat().st_size:,} bytes')
        if temporary.stat().st_size > 5_000_000:
            raise ValueError(f'Animation exceeds the decoder budget: {source["id"]}')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, required=True, help='Untracked directory for source videos')
    parser.add_argument('--only', help='Rebuild a single catalog ID')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'assets/exercises')
    args = parser.parse_args()
    if not shutil.which('ffmpeg'):
        parser.error('ffmpeg is required')
    sources = json.loads((ROOT / 'assets/exercises/media-sources.json').read_text())
    if args.only:
        sources = [source for source in sources if source['id'] == args.only]
        if not sources:
            parser.error('Unknown catalog ID')
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for source in sources:
        build(source, args.cache_dir, args.output_dir)
    print(f'Created {len(sources)} reviewed offline demonstrations')


if __name__ == '__main__':
    main()
