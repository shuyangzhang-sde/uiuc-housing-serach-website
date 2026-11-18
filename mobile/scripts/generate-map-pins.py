"""Generate the small native map UI sprites (requires Pillow; not listing images)."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / 'assets' / 'map'
out.mkdir(parents=True, exist_ok=True)
for name, fill, stroke in [
    ('available', '#111214', '#111214'),
    ('unavailable', '#F5F5F2', '#C6C6C2'),
    ('selected', '#FFB800', '#111214'),
]:
    for scale in (1, 3):
        image = Image.new('RGBA', (80 * scale, 32 * scale))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((scale, scale, 79 * scale, 31 * scale), radius=15 * scale, fill=fill, outline=stroke, width=scale)
        suffix = '@3x' if scale == 3 else ''
        image.save(out / f'price-{name}{suffix}.png')
