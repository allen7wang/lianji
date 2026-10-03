"""Draw the original plank pose with a breathing cue; no pose movement is implied."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

destination = Path(__file__).resolve().parents[1] / "assets/exercises/plank.gif"
frames = []
scale = 2
for frame in range(24):
    image = Image.new("RGB", (512 * scale, 288 * scale), "#f5f7f4")
    draw = ImageDraw.Draw(image)

    def line(points, color, width):
        points = [(int(x * scale), int(y * scale)) for x, y in points]
        draw.line(points, fill=color, width=width * scale, joint="curve")
        for x, y in points:
            radius = width * scale / 2
            draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)

    # Head, shoulders, hips and ankles follow the same straight body line.
    line([(66, 222), (450, 222)], "#ced6cc", 3)
    line([(140, 138), (245, 157)], "#28392f", 29)
    line([(245, 157), (336, 188), (403, 210)], "#61725e", 22)
    line([(140, 142), (130, 207), (80, 213)], "#b9f36a", 15)
    line([(151, 146), (148, 209), (100, 216)], "#85ae4e", 12)
    line([(403, 210), (410, 220)], "#28392f", 12)
    line([(138, 138), (113, 128)], "#28392f", 14)
    draw.ellipse((91*scale, 105*scale, 122*scale, 137*scale), fill="#28392f")
    radius = 14 + 7 * (1 - math.cos(frame / 24 * math.tau)) / 2
    x, y = 203, 148
    draw.ellipse(((x-radius)*scale, (y-radius)*scale, (x+radius)*scale, (y+radius)*scale), outline="#92b956", width=2*scale)
    # A fixed guide makes the isometric nature of the movement clear.
    draw.line([(140*scale, 114*scale), (405*scale, 187*scale)], fill="#a5b19f", width=scale)
    frames.append(image.resize((512, 288), Image.Resampling.LANCZOS))
destination.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(destination, save_all=True, append_images=frames[1:], duration=160, loop=0, optimize=True)
print(destination)
