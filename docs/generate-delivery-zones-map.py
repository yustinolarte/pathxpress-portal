"""Render a branded, georeferenced delivery-zone map from the portal GeoJSON.

Basemap: Esri World Street Map with its credited data contributors.
"""

import io
import json
import math
import tempfile
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
GEOJSON = ROOT / "server/zones/delivery-zones.geojson"
UAE_OUTLINE = ROOT / "shared/uae-outline.geojson"
LOGO = ROOT / "client/public/pathxpress-logo.png"
OUTPUT = ROOT / "docs/delivery-zones-map-en.png"
TILE_CACHE = Path(tempfile.gettempdir()) / "pathxpress-esri-map-tiles"
FEATURES = json.loads(GEOJSON.read_text(encoding="utf-8"))["features"]
UAE = json.loads(UAE_OUTLINE.read_text(encoding="utf-8"))["geometry"]

W, H = 2400, 1500
RED = "#E10600"
INK = "#16181C"
GRAPHITE = "#3C4046"
MUTED = "#6B6F77"
PAPER = "#F4F3EF"


def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    path = Path("C:/Windows/Fonts") / name
    if not path.exists():
        path = Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(str(path), size)


def world_xy(lon, lat, zoom):
    size = 256 * (2 ** zoom)
    lat = max(-85.0511, min(85.0511, lat))
    return ((lon + 180) / 360 * size,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * size)


def tile(x, y, z):
    TILE_CACHE.mkdir(parents=True, exist_ok=True)
    path = TILE_CACHE / f"{z}-{x}-{y}.png"
    if not path.exists():
        url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        res = requests.get(url, headers={"User-Agent": "PathXpress zone-map artwork/1.0"}, timeout=20)
        res.raise_for_status()
        Image.open(io.BytesIO(res.content)).verify()
        path.write_bytes(res.content)
    return Image.open(path).convert("RGB")


def map_panel(canvas, box, bounds, zoom=9, markers=True):
    """Draw OSM tiles and the unmodified source polygons within a fixed viewport."""
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    west, south, east, north = bounds
    wx0, wy0 = world_xy(west, north, zoom)
    wx1, wy1 = world_xy(east, south, zoom)
    scale = min(width / (wx1 - wx0), height / (wy1 - wy0))
    cx, cy = (wx0 + wx1) / 2, (wy0 + wy1) / 2

    def project(lon, lat):
        x, y = world_xy(lon, lat, zoom)
        return ((x - cx) * scale + width / 2, (y - cy) * scale + height / 2)

    local = Image.new("RGB", (width, height), "#E8E8E6")
    xlo = math.floor((cx - width / (2 * scale)) / 256)
    xhi = math.floor((cx + width / (2 * scale)) / 256)
    ylo = math.floor((cy - height / (2 * scale)) / 256)
    yhi = math.floor((cy + height / (2 * scale)) / 256)
    for tx in range(xlo, xhi + 1):
        for ty in range(ylo, yhi + 1):
            piece = tile(tx, ty, zoom)
            dest_x = round((tx * 256 - cx) * scale + width / 2)
            dest_y = round((ty * 256 - cy) * scale + height / 2)
            tw = math.ceil(256 * scale) + 1
            piece = piece.resize((tw, tw), Image.Resampling.BILINEAR)
            local.paste(piece, (dest_x, dest_y))

    # A light veil keeps roads and place names visible while the zone boundaries lead.
    local = Image.blend(local, Image.new("RGB", local.size, "#FFFFFF"), .20)
    base = local.convert("RGBA")
    country = Image.new("RGBA", base.size)
    cd = ImageDraw.Draw(country)
    for polygon in UAE["coordinates"]:
        cd.polygon([project(lon, lat) for lon, lat in polygon[0]], fill=(90, 94, 99, 43))
        for hole in polygon[1:]:
            cd.polygon([project(lon, lat) for lon, lat in hole], fill=(0, 0, 0, 0))
    base = Image.alpha_composite(base, country)
    fill_layer = Image.new("RGBA", base.size)
    fd = ImageDraw.Draw(fill_layer)
    for feature in FEATURES:
        zone = feature["properties"]["zone_code"]
        fill = (225, 6, 0, 72) if zone == 1 else (22, 24, 28, 74)
        for ring in feature["geometry"]["coordinates"]:
            fd.polygon([project(lon, lat) for lon, lat in ring], fill=fill)
    base = Image.alpha_composite(base, fill_layer)
    local = base.convert("RGB")
    draw = ImageDraw.Draw(local)
    for polygon in UAE["coordinates"]:
        draw.line([project(lon, lat) for lon, lat in polygon[0]], fill="#999B9F", width=2, joint="curve")
    for feature in FEATURES:
        zone = feature["properties"]["zone_code"]
        color = RED if zone == 1 else GRAPHITE
        for ring in feature["geometry"]["coordinates"]:
            points = [project(lon, lat) for lon, lat in ring]
            draw.line(points, fill="white", width=10, joint="curve")
            draw.line(points, fill=color, width=6, joint="curve")

    if markers:
        places = [
            ("Abu Dhabi", 54.58, 24.48, 1),
            ("Dubai", 55.30, 25.15, 1),
            ("Sharjah", 55.50, 25.35, 1),
            ("Ajman", 55.56, 25.42, 1),
            ("Al Ain", 55.72, 24.23, 2),
            ("Fujairah", 56.32, 25.13, 2),
            ("Umm Al Quwain", 55.59, 25.54, 2),
            ("Ras Al Khaimah", 55.93, 25.76, 2),
        ]
        for name, lon, lat, zone in places:
            x, y = project(lon, lat)
            if not (32 < x < width - 32 and 30 < y < height - 30):
                continue
            r = 11 if width > 1000 else 9
            draw.ellipse((x-r, y-r, x+r, y+r), fill=RED if zone == 1 else GRAPHITE, outline="white", width=3)
            if width > 1000 and name in ("Abu Dhabi", "Dubai", "Al Ain", "Ras Al Khaimah", "Fujairah"):
                tw = draw.textbbox((0, 0), name, font=font(21, True))[2]
                tx = min(width - tw - 25, x + 20)
                draw.rounded_rectangle((tx-7, y-18, tx+tw+7, y+17), radius=8, fill="white", outline="#BFC1C3", width=1)
                draw.text((tx, y-12), name, font=font(21, True), fill=INK)

    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width-1, height-1), radius=18, fill=255)
    canvas.paste(local, (left, top), mask)
    ImageDraw.Draw(canvas).rounded_rectangle((left, top, right, bottom), radius=18, outline="#B7B9BC", width=2)
    return project


im = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(im)
d.rectangle((0, 0, W, 198), fill=INK)
d.rectangle((0, 192, W, 199), fill=RED)
logo = Image.open(LOGO).convert("RGBA")
logo.thumbnail((530, 125), Image.Resampling.LANCZOS)
im.paste(logo, (92, 35), logo)
d.text((2180, 72), "UAE", font=font(40, True), fill="white", anchor="mm")

d.text((95, 225), "DELIVERY ZONES", font=font(54, True), fill=INK)
d.text((98, 296), "Portal boundaries over a geographic street map", font=font(27), fill=MUTED)

main = (82, 363, 1643, 1352)
detail = (1690, 490, 2318, 954)
map_panel(im, main, (51.5, 22.5, 56.7, 26.25), zoom=9)
map_panel(im, detail, (54.45, 24.15, 56.45, 26.02), zoom=9, markers=False)

d = ImageDraw.Draw(im)
d.rounded_rectangle((105, 386, 415, 438), radius=8, fill="white", outline="#B7B9BC", width=1)
d.text((127, 393), "UAE COVERAGE", font=font(28, True), fill=INK)
d.rounded_rectangle((1710, 508, 2298, 561), radius=8, fill="white", outline="#B7B9BC", width=1)
d.text((1729, 516), "URBAN BOUNDARY DETAIL", font=font(25, True), fill=INK)

# Zone 3 is the complement of the two colored zone sets within the UAE.
d.rounded_rectangle((595, 1100, 1110, 1242), radius=15, fill="white", outline="#9C9EA1", width=2)
d.rectangle((595, 1100, 606, 1242), fill="#9A9CA0")
d.text((630, 1118), "ZONE 3", font=font(34, True), fill=INK)
d.text((630, 1168), "All other UAE locations", font=font(26), fill=GRAPHITE)
d.text((630, 1204), "outside Zones 1 and 2", font=font(26), fill=GRAPHITE)

d.rounded_rectangle((1690, 366, 2318, 467), radius=18, fill="white", outline="#D2D0CC", width=2)
d.text((1720, 388), "ZONE 1", font=font(30, True), fill=RED)
d.text((1880, 393), "Urban areas outlined in red", font=font(23), fill=GRAPHITE)
d.text((1720, 426), "ZONE 2", font=font(30, True), fill=GRAPHITE)
d.text((1880, 431), "Urban areas outlined in charcoal", font=font(23), fill=GRAPHITE)

d.rounded_rectangle((1690, 979, 2318, 1352), radius=18, fill="white", outline="#D2D0CC", width=2)
d.text((1720, 1003), "HOW TO READ THIS MAP", font=font(29, True), fill=INK)
d.line((1720, 1052, 2284, 1052), fill="#D5D4D0", width=2)
d.text((1720, 1070), "ZONE 1", font=font(27, True), fill=RED)
d.text((1720, 1107), "Abu Dhabi · Dubai · Sharjah · Ajman", font=font(21), fill=GRAPHITE)
d.text((1720, 1150), "ZONE 2", font=font(27, True), fill=GRAPHITE)
d.text((1720, 1187), "Al Ain · Fujairah · Umm Al Quwain", font=font(21), fill=GRAPHITE)
d.text((1720, 1217), "Ras Al Khaimah", font=font(21), fill=GRAPHITE)
d.text((1720, 1261), "ZONE 3", font=font(27, True), fill="#777A7E")
d.text((1720, 1298), "Every UAE location outside Zones 1 and 2", font=font(20), fill=GRAPHITE)

d.text((100, 1400), "Zone classification uses the destination pin and the 11 source polygons in the PathXpress portal.", font=font(24), fill=GRAPHITE)
d.text((100, 1438), "Basemap © Esri, HERE, Garmin, OSM contributors  ·  UAE outline: Natural Earth  ·  Zone boundaries: PathXpress", font=font(20), fill=MUTED)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
im.save(OUTPUT, optimize=True)
print(OUTPUT)
