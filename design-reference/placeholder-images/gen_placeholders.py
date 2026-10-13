import os, random, math
from PIL import Image, ImageDraw, ImageFilter

out_dir = "/tmp/claude-0/-home-claude/037e1c8d-c282-518e-8b7a-ca766dd654e1/scratchpad/placeholders"
os.makedirs(out_dir, exist_ok=True)

def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def make_gradient(w, h, c1, c2, angle_deg=35):
    img = Image.new('RGB', (w, h), c1)
    px = img.load()
    rad = math.radians(angle_deg)
    dx, dy = math.cos(rad), math.sin(rad)
    # project corners to find t range
    corners = [(0,0),(w,0),(0,h),(w,h)]
    projs = [x*dx+y*dy for x,y in corners]
    pmin, pmax = min(projs), max(projs)
    for y in range(h):
        for x in range(0, w, 2):
            t = ((x*dx+y*dy) - pmin) / (pmax - pmin)
            col = lerp(c1, c2, t)
            px[x, y] = col
            if x+1 < w:
                px[x+1, y] = col
    return img

def add_grain(img, amount=10):
    w, h = img.size
    noise = Image.effect_noise((w, h), amount).convert('L')
    noise_rgb = Image.merge('RGB', (noise, noise, noise))
    return Image.blend(img, noise_rgb, 0.05)

def vignette(img, strength=0.35):
    w, h = img.size
    mask = Image.new('L', (w, h), 0)
    dm = ImageDraw.Draw(mask)
    dm.ellipse([-w*0.3, -h*0.3, w*1.3, h*1.3], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w*0.18))
    dark = Image.new('RGB', (w, h), (20, 15, 12))
    return Image.composite(img, dark, mask)

def draw_camera_icon(img, color, scale=1.0):
    w, h = img.size
    draw = ImageDraw.Draw(img, 'RGBA')
    cx, cy = w/2, h/2
    bw, bh = 120*scale, 86*scale
    r = 14*scale
    draw.rounded_rectangle([cx-bw/2, cy-bh/2+10*scale, cx+bw/2, cy+bh/2+10*scale], radius=r, outline=color, width=max(2,int(4*scale)))
    draw.rounded_rectangle([cx-26*scale, cy-bh/2-14*scale, cx+26*scale, cy-bh/2+10*scale], radius=6*scale, outline=color, width=max(2,int(4*scale)))
    lr = 26*scale
    draw.ellipse([cx-lr, cy-lr+8*scale, cx+lr, cy+lr+8*scale], outline=color, width=max(2,int(4*scale)))

def draw_play_icon(img, color, scale=1.0):
    w, h = img.size
    draw = ImageDraw.Draw(img, 'RGBA')
    cx, cy = w/2, h/2
    R = 56*scale
    draw.ellipse([cx-R, cy-R, cx+R, cy+R], outline=color, width=max(2,int(4*scale)))
    s = 22*scale
    draw.polygon([(cx-s*0.55, cy-s), (cx-s*0.55, cy+s), (cx+s*0.9, cy)], fill=color)

# Warm Muted palette: Paper #F6F1E6, Clay #A9695A, Olive #8C8560,
# Sand #D8BFA8, Ink #332A22, Ink-muted #8F8275
palettes = [
    ("photo-clay",   "#C9A98F", "#A9695A"),
    ("photo-olive",  "#A8A179", "#8C8560"),
    ("photo-sand",   "#EADCC8", "#D8BFA8"),
    ("photo-paper",  "#F0E6D6", "#C2967E"),
    ("photo-deep",   "#B88A6B", "#6B4A3C"),
]

random.seed(7)
for name, c1h, c2h in palettes:
    w, h = 900, 1100
    img = make_gradient(w, h, hex2rgb(c1h), hex2rgb(c2h), angle_deg=random.choice([25,35,50,65]))
    img = add_grain(img, amount=14)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    draw_camera_icon(img, (255,255,255,130), scale=1.0)
    img.save(f"{out_dir}/{name}.jpg", quality=86)

# hero video still — wide, moodier, darker
w, h = 1600, 900
hero = make_gradient(w, h, hex2rgb("#8C6F55"), hex2rgb("#332A22"), angle_deg=20)
hero = add_grain(hero, amount=16)
hero = hero.filter(ImageFilter.GaussianBlur(0.8))
hero = vignette(hero, strength=0.4)
draw_play_icon(hero, (255,255,255,200), scale=1.3)
hero.save(f"{out_dir}/hero-video-still.jpg", quality=86)

print("done:", os.listdir(out_dir))
