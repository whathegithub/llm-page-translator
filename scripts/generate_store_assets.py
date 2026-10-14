from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "icons"
ASSETS_DIR = ROOT / "store" / "assets"

BLUE = (37, 99, 235, 255)
BLUE_DARK = (29, 78, 216, 255)
BLUE_DEEP = (30, 58, 138, 255)
WHITE = (255, 255, 255, 255)
INK = (23, 32, 51, 255)
MUTED = (102, 112, 133, 255)
YAHEI = r"C:\Windows\Fonts\msyh.ttc"
YAHEI_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
SEGOE = r"C:\Windows\Fonts\segoeui.ttf"
SEGOE_BOLD = r"C:\Windows\Fonts\seguisb.ttf"


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size=size, index=index)
    except OSError:
        return ImageFont.truetype(SEGOE, size=size)


def draw_centered_text(draw, text, xy, font_obj, fill):
    x, y = xy
    box = draw.textbbox((0, 0), text, font=font_obj)
    draw.text((x - (box[2] - box[0]) / 2, y - (box[3] - box[1]) / 2 - box[1]), text, font=font_obj, fill=fill)


def make_mark(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    pad = max(1, round(size * 0.125))
    radius = max(2, round(size * 0.22))
    box = (pad, pad, size - pad - 1, size - pad - 1)
    draw.rounded_rectangle(box, radius=radius, fill=BLUE)
    inner = size - pad * 2
    if size <= 20:
        draw_centered_text(draw, "文", (size / 2, size / 2 + size * 0.02), font(YAHEI_BOLD, max(8, round(inner * 0.62))), WHITE)
    else:
        left = pad + inner * 0.27
        right = pad + inner * 0.73
        cy = size / 2 + inner * 0.02
        latin = font(SEGOE_BOLD, max(8, round(inner * 0.42)))
        han = font(YAHEI_BOLD, max(9, round(inner * 0.40)))
        draw_centered_text(draw, "A", (left, cy), latin, WHITE)
        draw_centered_text(draw, "文", (right, cy + inner * 0.01), han, WHITE)
        ax1, ax2 = size / 2 - inner * 0.04, size / 2 + inner * 0.05
        ay = size / 2
        stroke = max(1, round(size * 0.035))
        draw.line((ax1, ay, ax2, ay), fill=WHITE, width=stroke)
        draw.polygon(
            [(ax2, ay - inner * 0.08), (ax2 + inner * 0.09, ay), (ax2, ay + inner * 0.08)],
            fill=WHITE,
        )
    image = Image.alpha_composite(image, overlay)
    if size >= 48:
        glow = image.copy().filter(ImageFilter.GaussianBlur(radius=size * 0.03))
        image = Image.alpha_composite(glow, image)
    return image


def save_icon(size):
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    make_mark(size).save(ICONS_DIR / f"icon{size}.png")


def vertical_gradient(size, top, bottom):
    width, height = size
    image = Image.new("RGBA", size, bottom)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(height - 1, 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
        draw.line((0, y, width, y), fill=color)
    return image


def rounded_card(size, radius, fill, shadow=True):
    width, height = size
    card = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=fill)
    if not shadow:
        return card
    canvas = Image.new("RGBA", (width + 24, height + 24), (0, 0, 0, 0))
    shadow_img = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_img)
    sdraw.rounded_rectangle((10, 12, width + 10, height + 14), radius=radius, fill=(15, 23, 42, 48))
    canvas = Image.alpha_composite(canvas, shadow_img.filter(ImageFilter.GaussianBlur(8)))
    canvas.paste(card, (8, 6), card)
    return canvas


def make_small_promo():
    image = vertical_gradient((440, 280), (37, 99, 235, 255), (30, 58, 138, 255))
    draw = ImageDraw.Draw(image)
    mark = make_mark(128).resize((118, 118), Image.Resampling.LANCZOS)
    image.alpha_composite(mark, (42, 46))
    title = font(SEGOE_BOLD, 28)
    subtitle = font(YAHEI, 18)
    draw.text((176, 78), "LLM Page Translator", font=title, fill=WHITE)
    draw.text((176, 122), "原位网页翻译", font=subtitle, fill=(219, 234, 254, 255))
    chip_font = font(YAHEI, 14)
    chips = ["保留排版", "自带模型", "随时还原"]
    x = 176
    for chip in chips:
        box = draw.textbbox((0, 0), chip, font=chip_font)
        w = box[2] - box[0] + 22
        draw.rounded_rectangle((x, 168, x + w, 198), radius=12, fill=(255, 255, 255, 255))
        draw.text((x + 11, 173), chip, font=chip_font, fill=BLUE_DEEP)
        x += w + 8
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(ASSETS_DIR / "promo-small-440x280.png")


def make_marquee():
    image = vertical_gradient((1400, 560), (37, 99, 235, 255), (15, 23, 42, 255))
    draw = ImageDraw.Draw(image)
    mark = make_mark(256).resize((196, 196), Image.Resampling.LANCZOS)
    image.alpha_composite(mark, (88, 168))
    title = font(SEGOE_BOLD, 64)
    subtitle = font(YAHEI, 32)
    body = font(YAHEI, 22)
    draw.text((320, 168), "LLM Page Translator", font=title, fill=WHITE)
    draw.text((320, 252), "把翻译写回原文位置，链接和按钮都还在。", font=subtitle, fill=(219, 234, 254, 255))
    for i, line in enumerate(["支持 OpenAI / DeepSeek / Anthropic / Gemini", "仅在点击后注入当前标签页，不常驻所有网站"]):
        draw.text((320, 322 + i * 42), line, font=body, fill=(191, 219, 254, 255))
    card = rounded_card((420, 280), 24, (255, 255, 255, 245))
    image.alpha_composite(card, (930, 132))
    cdraw = ImageDraw.Draw(image)
    cdraw.text((972, 176), "hello", font=font(SEGOE_BOLD, 26), fill=BLUE)
    cdraw.text((972, 218), "你好", font=font(YAHEI_BOLD, 36), fill=INK)
    cdraw.text((972, 276), "中文模拟发音", font=font(YAHEI, 16), fill=MUTED)
    cdraw.text((972, 304), "哈喽", font=font(YAHEI_BOLD, 28), fill=INK)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(ASSETS_DIR / "promo-marquee-1400x560.png")


def main():
    for size in (16, 32, 48, 128):
        save_icon(size)
    make_small_promo()
    make_marquee()
    print("generated icons and promotional images")


if __name__ == "__main__":
    main()
