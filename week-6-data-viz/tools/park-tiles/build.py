"""
Builds Central Park as self-hosted 3D Tiles from USGS LiDAR and NYS orthoimagery.

Writes uncompressed .glb tiles plus tileset.json to .cache/raw/ - compress.mjs then
Draco-compresses them into public/park/. Downloads (~330MB) are cached, so reruns are quick.

    python -m venv tools/park-tiles/.venv
    tools/park-tiles/.venv/Scripts/pip install -r tools/park-tiles/requirements.txt
    tools/park-tiles/.venv/Scripts/python tools/park-tiles/build.py
    node tools/park-tiles/compress.mjs
"""

import concurrent.futures
import csv
import io
import json
import math
import struct
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import laspy
import numpy as np
from PIL import Image
from scipy import ndimage

TOOL_DIR = Path(__file__).resolve().parent
PROJECT_DIR = TOOL_DIR.parents[1]
CACHE_DIR = TOOL_DIR / ".cache"
RAW_DIR = CACHE_DIR / "raw"

# Must match PARK_CENTER in src/map/park.ts - the tileset's local origin.
PARK_CENTER = (40.7824, -73.9654)

# https://registry.opendata.aws/usgs-lidar/ - the 2014 USGS NYC flight, in EPSG:3857.
LIDAR_URL = "https://usgs-lidar-public.s3.amazonaws.com/NY_NewYorkCity/"
# Ground and overlap-ground. Everything else but noise is a surface (trees, roofs).
GROUND_CLASSES = (2, 18)
NOISE_CLASSES = (7,)
# Its heights are NAVD88 (above sea level) - this GEOID18 offset at PARK_CENTER makes them
# ellipsoidal like Google's, so switching between the two keeps the ground in place.
# https://geodesy.noaa.gov/api/geoid/ght?lat=40.7824&lon=-73.9654
GEOID_HEIGHT = -31.655

# https://orthos.its.ny.gov - 2018 is leaf-on and the census year.
ORTHO_URL = "https://orthos.its.ny.gov/arcgis/rest/services/wms/2018/MapServer/export"

ATTRIBUTION = "Elevation: USGS 3DEP LiDAR (2014). Imagery: NYS ITS Geospatial Services (2018)."

# Meters of city kept around the squirrels' extent.
REGION_MARGIN = 250
LEAF_SIZE = 128
LEAF_TEXTURE_SIZE = 512
LEAF_SEGMENTS = 128
COARSE_SEGMENTS = 64
GROUND_SEGMENTS = 32
LEVEL_COUNT = 4
# 16 (the renderer's errorTarget) * texel size, so tiles refine once a texel passes ~1px.
ERROR_PER_TILE_SIZE = 1 / 32
SPIKE_THRESHOLD = 5
# Holes bigger than this (in 1m cells) are water or buildings - filled from the ground model.
SMALL_HOLE_CELLS = 16
CANOPY_CLOSING_CELLS = 5
CANOPY_SMOOTHING_SIGMA = 1.0
WEBP_QUALITY = 82

EARTH_RADIUS = 6378137.0
FLATTENING = 1 / 298.257223563
ECCENTRICITY_SQ = FLATTENING * (2 - FLATTENING)


#region Geodesy
def geodetic_to_ecef(lat, lon, height):
    lat, lon = np.radians(lat), np.radians(lon)
    prime_vertical = EARTH_RADIUS / np.sqrt(1 - ECCENTRICITY_SQ * np.sin(lat) ** 2)
    return np.stack(
        [
            (prime_vertical + height) * np.cos(lat) * np.cos(lon),
            (prime_vertical + height) * np.cos(lat) * np.sin(lon),
            (prime_vertical * (1 - ECCENTRICITY_SQ) + height) * np.sin(lat),
        ],
        axis=-1,
    )


def ecef_to_geodetic(ecef):
    """Bowring's method - millimeter accurate near the surface."""
    ecef_x, ecef_y, ecef_z = ecef[..., 0], ecef[..., 1], ecef[..., 2]
    polar_radius = EARTH_RADIUS * (1 - FLATTENING)
    second_ecc_sq = (EARTH_RADIUS**2 - polar_radius**2) / polar_radius**2
    radial = np.hypot(ecef_x, ecef_y)
    theta = np.arctan2(ecef_z * EARTH_RADIUS, radial * polar_radius)
    lat = np.arctan2(
        ecef_z + second_ecc_sq * polar_radius * np.sin(theta) ** 3,
        radial - ECCENTRICITY_SQ * EARTH_RADIUS * np.cos(theta) ** 3,
    )
    return np.degrees(lat), np.degrees(np.arctan2(ecef_y, ecef_x))


def enu_basis(lat, lon):
    """Rows are east, north, up in ECEF."""
    lat, lon = math.radians(lat), math.radians(lon)
    return np.array(
        [
            [-math.sin(lon), math.cos(lon), 0],
            [-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)],
            [math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)],
        ]
    )


def mercator_to_lat_lon(merc_x, merc_y):
    return np.degrees(2 * np.arctan(np.exp(merc_y / EARTH_RADIUS)) - math.pi / 2), np.degrees(merc_x / EARTH_RADIUS)


def lat_lon_to_mercator(lat, lon):
    return np.radians(lon) * EARTH_RADIUS, np.log(np.tan(math.pi / 4 + np.radians(lat) / 2)) * EARTH_RADIUS
#endregion


class ParkFrame:
    """
    The tileset's local frame: "along" runs up the park, "across" to its west, "up" is up.
    Origin at PARK_CENTER on the ellipsoid, so it lines up with ReorientationPlugin.
    """

    def __init__(self, squirrel_lat, squirrel_lon):
        self.origin = geodetic_to_ecef(*PARK_CENTER, 0.0)
        self.enu = enu_basis(*PARK_CENTER)
        east, north, _ = self.to_enu(squirrel_lat, squirrel_lon, np.zeros_like(squirrel_lat))
        # Same principal-axis fit as computeParkFrame() in park.ts.
        offset_east, offset_north = east - east.mean(), north - north.mean()
        angle = 0.5 * math.atan2(
            2 * (offset_east * offset_north).sum(), (offset_east**2).sum() - (offset_north**2).sum()
        )
        along = np.array([math.cos(angle), math.sin(angle), 0.0])
        if along[1] < 0:
            along = -along
        across = np.cross([0.0, 0.0, 1.0], along)
        # Columns map local (along, across, up) to ENU.
        self.local_to_enu = np.stack([along, across, [0.0, 0.0, 1.0]], axis=1)
        local = np.stack([east, north, np.zeros_like(east)], axis=-1) @ self.local_to_enu
        self.squirrel_bounds = local[:, 0].min(), local[:, 0].max(), local[:, 1].min(), local[:, 1].max()

    def to_enu(self, lat, lon, height):
        enu = (geodetic_to_ecef(lat, lon, height) - self.origin) @ self.enu.T
        return enu[..., 0], enu[..., 1], enu[..., 2]

    def to_local(self, lat, lon, height):
        east, north, up = self.to_enu(lat, lon, height)
        local = np.stack([east, north, up], axis=-1) @ self.local_to_enu
        return local[..., 0], local[..., 1], local[..., 2]

    def local_to_lat_lon(self, along, across):
        local = np.stack([along, across, np.zeros_like(along)], axis=-1)
        ecef = self.origin + (local @ self.local_to_enu.T) @ self.enu
        return ecef_to_geodetic(ecef)

    def tileset_transform(self):
        """Column-major local -> ECEF matrix for the root tile, lowered from sea level to the ellipsoid."""
        rotation = self.enu.T @ self.local_to_enu
        matrix = np.eye(4)
        matrix[:3, :3] = rotation
        matrix[:3, 3] = self.origin + self.enu[2] * GEOID_HEIGHT
        return matrix.T.flatten().tolist()


class Region:
    """The lattice of 1m height samples, LEAF_SIZE-aligned around the squirrels."""

    def __init__(self, frame):
        min_along, max_along, min_across, max_across = frame.squirrel_bounds
        self.along0 = min_along - REGION_MARGIN
        self.across0 = min_across - REGION_MARGIN
        self.leaves_along = math.ceil((max_along - min_along + 2 * REGION_MARGIN) / LEAF_SIZE)
        self.leaves_across = math.ceil((max_across - min_across + 2 * REGION_MARGIN) / LEAF_SIZE)
        # Lattice points, not cells - tile edges share samples.
        self.shape = (self.leaves_along * LEAF_SIZE + 1, self.leaves_across * LEAF_SIZE + 1)

    def corners_local(self):
        along1 = self.along0 + self.leaves_along * LEAF_SIZE
        across1 = self.across0 + self.leaves_across * LEAF_SIZE
        return np.array([[self.along0, self.across0], [along1, self.across0], [along1, across1], [self.along0, across1]])


def fetch(url, path):
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "park-tiles-builder"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    path.with_suffix(".part").write_bytes(data)
    path.with_suffix(".part").replace(path)
    return path


def fetch_json(url, path):
    return json.loads(fetch(url, path).read_text())


#region LiDAR
def polygons_overlap(first, second):
    """Separating axis test for two convex polygons."""
    for polygon in (first, second):
        edges = np.roll(polygon, -1, axis=0) - polygon
        for edge in edges:
            normal = np.array([-edge[1], edge[0]])
            first_proj, second_proj = first @ normal, second @ normal
            if first_proj.max() < second_proj.min() or second_proj.max() < first_proj.min():
                return False
    return True


def find_lidar_nodes(region_merc):
    """Every EPT node overlapping the region, at every depth (together they're full density)."""
    ept = fetch_json(LIDAR_URL + "ept.json", CACHE_DIR / "lidar" / "ept.json")
    min_x, min_y, _, max_x, _, _ = ept["bounds"]
    cube_size = max_x - min_x

    def overlaps(key):
        depth, index_x, index_y, _ = map(int, key.split("-"))
        size = cube_size / 2**depth
        left, bottom = min_x + index_x * size, min_y + index_y * size
        node = np.array([[left, bottom], [left + size, bottom], [left + size, bottom + size], [left, bottom + size]])
        return polygons_overlap(node, region_merc)

    nodes = {}
    pending = ["0-0-0-0"]
    while pending:
        key = pending.pop()
        hierarchy = fetch_json(LIDAR_URL + f"ept-hierarchy/{key}.json", CACHE_DIR / "lidar" / "hierarchy" / f"{key}.json")
        for child, count in hierarchy.items():
            if not overlaps(child):
                continue
            if count == -1:
                pending.append(child)
            elif count > 0:
                nodes[child] = count
    return nodes


def rasterize_lidar(frame, region, region_merc):
    nodes = find_lidar_nodes(region_merc)
    print(f"LiDAR: {len(nodes)} nodes, {sum(nodes.values()):,} points")

    def download(key):
        return fetch(LIDAR_URL + f"ept-data/{key}.laz", CACHE_DIR / "lidar" / "data" / f"{key}.laz")

    surface = np.full(region.shape, -np.inf, dtype=np.float32)
    ground_sum = np.zeros(region.shape, dtype=np.float64)
    ground_count = np.zeros(region.shape, dtype=np.int32)
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        for done, path in enumerate(pool.map(download, sorted(nodes)), 1):
            points = laspy.read(path)
            classes = np.asarray(points.classification)
            keep = ~np.isin(classes, NOISE_CLASSES)
            lat, lon = mercator_to_lat_lon(np.asarray(points.x)[keep], np.asarray(points.y)[keep])
            along, across, up = frame.to_local(lat, lon, np.asarray(points.z)[keep])
            row = np.rint(along - region.along0).astype(np.int64)
            col = np.rint(across - region.across0).astype(np.int64)
            inside = (row >= 0) & (row < region.shape[0]) & (col >= 0) & (col < region.shape[1])
            cells = row[inside] * region.shape[1] + col[inside]
            heights = up[inside].astype(np.float32)
            np.maximum.at(surface.reshape(-1), cells, heights)
            is_ground = np.isin(classes[keep][inside], GROUND_CLASSES)
            np.add.at(ground_sum.reshape(-1), cells[is_ground], heights[is_ground])
            np.add.at(ground_count.reshape(-1), cells[is_ground], 1)
            if done % 100 == 0:
                print(f"  {done}/{len(nodes)} nodes")

    ground = np.where(ground_count > 0, ground_sum / np.maximum(ground_count, 1), np.nan).astype(np.float32)
    surface[~np.isfinite(surface)] = np.nan
    return surface, ground


def push_pull_fill(grid):
    """Fills NaNs smoothly from coarser and coarser averages of the known values."""
    known = np.isfinite(grid)
    if known.all():
        return grid
    values = np.where(known, grid, 0).astype(np.float64)
    weights = known.astype(np.float64)
    if min(grid.shape) <= 2:
        filled = grid.copy()
        filled[~known] = values.sum() / max(weights.sum(), 1)
        return filled
    pad = ((0, grid.shape[0] % 2), (0, grid.shape[1] % 2))
    values_padded, weights_padded = np.pad(values * weights, pad), np.pad(weights, pad)
    coarse_values = values_padded.reshape(values_padded.shape[0] // 2, 2, -1, 2).sum(axis=(1, 3))
    coarse_weights = weights_padded.reshape(weights_padded.shape[0] // 2, 2, -1, 2).sum(axis=(1, 3))
    coarse = np.where(coarse_weights > 0, coarse_values / np.maximum(coarse_weights, 1e-9), np.nan)
    coarse = push_pull_fill(coarse)
    upsampled = ndimage.zoom(coarse, 2, order=1, mode="nearest", grid_mode=True)[: grid.shape[0], : grid.shape[1]]
    return np.where(known, grid, upsampled).astype(np.float32)


def clean_heights(surface, ground):
    ground = push_pull_fill(ground)
    # Birds and wires.
    median = ndimage.median_filter(np.nan_to_num(surface, nan=-1e6), size=3)
    surface = np.where(surface - median > SPIKE_THRESHOLD, median, surface)
    surface[surface < -1e5] = np.nan
    holes = ~np.isfinite(surface)
    labels, _ = ndimage.label(holes)
    sizes = np.bincount(labels.ravel())
    big_holes = holes & (sizes[labels] > SMALL_HOLE_CELLS)
    surface = np.where(big_holes, ground, surface)
    surface = push_pull_fill(surface)
    # Leaf-off returns leave gaps between branches - close them so crowns are solid
    # blobs rather than spikes, then soften the 1m stair-steps.
    canopy = np.maximum(surface - ground, 0)
    canopy = ndimage.grey_closing(canopy, size=CANOPY_CLOSING_CELLS)
    canopy = ndimage.median_filter(canopy, size=3)
    canopy = ndimage.gaussian_filter(canopy, sigma=CANOPY_SMOOTHING_SIGMA)
    return ground + canopy, ground
#endregion


#region Imagery
def fetch_ortho(bounds_merc, resolution, path):
    min_x, min_y, max_x, max_y = bounds_merc
    width = min(4096, math.ceil((max_x - min_x) / resolution))
    height = min(4096, math.ceil((max_y - min_y) / resolution))
    meta_path = path.with_suffix(".json")
    if not meta_path.exists() or not path.exists():
        query = urllib.parse.urlencode(
            {
                "bbox": f"{min_x},{min_y},{max_x},{max_y}",
                "bboxSR": 3857,
                "imageSR": 3857,
                "size": f"{width},{height}",
                "format": "jpg",
                "f": "json",
            }
        )
        meta = json.loads(fetch(f"{ORTHO_URL}?{query}", meta_path).read_text())
        try:
            fetch(meta["href"], path)
        except Exception:
            meta_path.unlink()
            raise
    meta = json.loads(meta_path.read_text())
    return np.asarray(Image.open(path).convert("RGB")), meta["extent"]


def render_leaf_texture(frame, leaf_along, leaf_across, size_along, size_across, path):
    """Resamples the ortho into the leaf's own (along, across) pixel grid."""
    texel = LEAF_SIZE / LEAF_TEXTURE_SIZE
    width, height = round(size_along / texel), round(size_across / texel)
    # Columns run along the park, rows from the far "across" edge (glTF's v=0 is the top).
    cols, rows = np.meshgrid(np.arange(width) + 0.5, np.arange(height) + 0.5)
    along = leaf_along + cols * texel
    across = leaf_across + size_across - rows * texel
    lat, lon = frame.local_to_lat_lon(along, across)
    merc_x, merc_y = lat_lon_to_mercator(lat, lon)
    pad = 4
    bounds = (merc_x.min() - pad, merc_y.min() - pad, merc_x.max() + pad, merc_y.max() + pad)
    # ~1.25x oversampled, in mercator units (stretched by 1/cos(lat)).
    resolution = texel / math.cos(math.radians(PARK_CENTER[0])) / 1.25
    image, extent = fetch_ortho(bounds, resolution, path)
    image_rows = (extent["ymax"] - merc_y) / (extent["ymax"] - extent["ymin"]) * image.shape[0] - 0.5
    image_cols = (merc_x - extent["xmin"]) / (extent["xmax"] - extent["xmin"]) * image.shape[1] - 0.5
    channels = [
        ndimage.map_coordinates(image[..., channel].astype(np.float32), [image_rows, image_cols], order=1, mode="nearest")
        for channel in range(3)
    ]
    return np.clip(np.stack(channels, axis=-1), 0, 255).astype(np.uint8)
#endregion


#region glTF
def grid_mesh(heights, along0, across0, spacing, skirt_depth, size_along, size_across):
    """A heightfield as positions/uvs/indices, glTF y-up: (along, up, -across)."""
    rows, cols = heights.shape
    row_index, col_index = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
    along = along0 + row_index * spacing
    across = across0 + col_index * spacing
    positions = np.stack([along, heights, -across], axis=-1).reshape(-1, 3)
    uvs = np.stack([(along - along0) / size_along, 1 - (across - across0) / size_across], axis=-1).reshape(-1, 2)
    quad = (row_index[:-1, :-1] * cols + col_index[:-1, :-1]).ravel()
    # Counter-clockwise seen from above (+y), since rows run +x and columns -z.
    indices = np.stack([quad, quad + cols, quad + 1, quad + 1, quad + cols, quad + cols + 1], axis=-1).ravel()
    if skirt_depth > 0:
        border = np.concatenate(
            [
                np.arange(cols),
                np.arange(1, rows) * cols + cols - 1,
                (rows - 1) * cols + np.arange(cols - 2, -1, -1),
                np.arange(rows - 2, 0, -1) * cols,
            ]
        )
        ring = np.append(border, border[0])
        skirt_start = len(positions)
        skirt_positions = positions[ring].copy()
        skirt_positions[:, 1] -= skirt_depth
        positions = np.concatenate([positions, skirt_positions])
        uvs = np.concatenate([uvs, uvs[ring]])
        top = ring[:-1]
        top_next = ring[1:]
        bottom = skirt_start + np.arange(len(ring) - 1)
        indices = np.concatenate(
            [indices, np.stack([top, bottom, top_next, top_next, bottom, bottom + 1], axis=-1).ravel()]
        )
    return positions.astype(np.float32), uvs.astype(np.float32), indices.astype(np.uint32)


def write_glb(path, surface_mesh, ground_mesh, texture_webp):
    buffer = bytearray()
    buffer_views, accessors = [], []

    def add_view(data, target=None):
        while len(buffer) % 4:
            buffer.append(0)
        view = {"buffer": 0, "byteOffset": len(buffer), "byteLength": len(data)}
        if target:
            view["target"] = target
        buffer.extend(data)
        buffer_views.append(view)
        return len(buffer_views) - 1

    def add_accessor(array, kind, target, with_bounds=False):
        component = {np.float32: 5126, np.uint16: 5123, np.uint32: 5125}[array.dtype.type]
        accessor = {
            "bufferView": add_view(array.tobytes(), target),
            "componentType": component,
            "count": len(array),
            "type": kind,
        }
        if with_bounds:
            accessor["min"] = array.min(axis=0).tolist()
            accessor["max"] = array.max(axis=0).tolist()
        accessors.append(accessor)
        return len(accessors) - 1

    def add_mesh(positions, uvs, indices, material):
        index_type = np.uint16 if len(positions) < 65536 else np.uint32
        attributes = {"POSITION": add_accessor(positions, "VEC3", 34962, with_bounds=True)}
        if uvs is not None:
            attributes["TEXCOORD_0"] = add_accessor(uvs, "VEC2", 34962)
        return {
            "primitives": [
                {
                    "attributes": attributes,
                    "indices": add_accessor(indices.astype(index_type), "SCALAR", 34963),
                    "material": material,
                }
            ]
        }

    meshes = [
        add_mesh(*surface_mesh, material=0),
        add_mesh(ground_mesh[0], None, ground_mesh[2], material=1),
    ]
    image_view = add_view(texture_webp)
    gltf = {
        "asset": {"version": "2.0", "generator": "park-tiles", "copyright": ATTRIBUTION},
        "extensionsUsed": ["EXT_texture_webp", "KHR_materials_unlit"],
        "extensionsRequired": ["EXT_texture_webp"],
        "scene": 0,
        "scenes": [{"nodes": [0, 1]}],
        # The app hides "ground" - it's only for raycasts under the trees.
        "nodes": [{"name": "surface", "mesh": 0}, {"name": "ground", "mesh": 1}],
        "meshes": meshes,
        "materials": [
            {
                "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0},
                # For the skirts, whichever way they face.
                "doubleSided": True,
                "extensions": {"KHR_materials_unlit": {}},
            },
            {"pbrMetallicRoughness": {"metallicFactor": 0}, "extensions": {"KHR_materials_unlit": {}}},
        ],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": image_view, "mimeType": "image/webp"}],
        "textures": [{"sampler": 0, "extensions": {"EXT_texture_webp": {"source": 0}}}],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer)}],
    }
    while len(buffer) % 4:
        buffer.append(0)
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(buffer)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_bytes), 0x4E4F534A)
        + json_bytes
        + struct.pack("<II", len(buffer), 0x004E4942)
        + bytes(buffer)
    )
#endregion


def load_squirrel_positions():
    with open(PROJECT_DIR / "public" / "data" / "squirrels.csv", newline="") as file:
        rows = list(csv.DictReader(file))
    return np.array([float(row["Y"]) for row in rows]), np.array([float(row["X"]) for row in rows])


def build():
    frame = ParkFrame(*load_squirrel_positions())
    region = Region(frame)
    corners = region.corners_local()
    corner_lat, corner_lon = frame.local_to_lat_lon(corners[:, 0], corners[:, 1])
    region_merc = np.stack(lat_lon_to_mercator(corner_lat, corner_lon), axis=-1)
    print(f"Region: {region.leaves_along} x {region.leaves_across} leaves of {LEAF_SIZE}m")

    raw_heights_path = CACHE_DIR / "raw-heights.npz"
    if raw_heights_path.exists():
        stored = np.load(raw_heights_path)
        raw_surface, raw_ground = stored["surface"], stored["ground"]
    else:
        raw_surface, raw_ground = rasterize_lidar(frame, region, region_merc)
        np.savez_compressed(raw_heights_path, surface=raw_surface, ground=raw_ground)
    surface, ground = clean_heights(raw_surface, raw_ground)
    np.savez_compressed(CACHE_DIR / "heights.npz", surface=surface, ground=ground)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / "tiles").mkdir(exist_ok=True)
    textures = {}
    smoothed_surfaces = {1: surface}

    def leaf_texture(index_along, index_across):
        path = CACHE_DIR / "ortho" / f"{index_along}-{index_across}.jpg"
        return render_leaf_texture(
            frame,
            region.along0 + index_along * LEAF_SIZE,
            region.across0 + index_across * LEAF_SIZE,
            LEAF_SIZE,
            LEAF_SIZE,
            path,
        )

    leaf_keys = [(along, across) for along in range(region.leaves_along) for across in range(region.leaves_across)]
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        for key, texture in zip(leaf_keys, pool.map(lambda key: leaf_texture(*key), leaf_keys)):
            textures[(0, *key)] = texture
    print(f"Imagery: {len(leaf_keys)} leaf textures")

    def build_tile(level, index_along, index_across):
        span = 2**level
        first_along, first_across = index_along * span, index_across * span
        if first_along >= region.leaves_along or first_across >= region.leaves_across:
            return None
        leaves_along = min(span, region.leaves_along - first_along)
        leaves_across = min(span, region.leaves_across - first_across)
        size_along, size_across = leaves_along * LEAF_SIZE, leaves_across * LEAF_SIZE
        along0 = region.along0 + first_along * LEAF_SIZE
        across0 = region.across0 + first_across * LEAF_SIZE

        children = []
        if level > 0:
            children = [
                child
                for child in (
                    build_tile(level - 1, index_along * 2 + offset_along, index_across * 2 + offset_across)
                    for offset_along in (0, 1)
                    for offset_across in (0, 1)
                )
                if child
            ]
            # Children's textures at their resolution, then halved. Each child spans
            # LEAF_TEXTURE_SIZE pixels at any level; rows start from the far "across" edge.
            child_pixels_per_leaf = LEAF_TEXTURE_SIZE * 2 // span
            mosaic = np.zeros((leaves_across * child_pixels_per_leaf, leaves_along * child_pixels_per_leaf, 3), np.uint8)
            for offset_along in (0, 1):
                for offset_across in (0, 1):
                    child = textures.pop((level - 1, index_along * 2 + offset_along, index_across * 2 + offset_across), None)
                    if child is None:
                        continue
                    col0 = offset_along * LEAF_TEXTURE_SIZE
                    row1 = mosaic.shape[0] - offset_across * LEAF_TEXTURE_SIZE
                    mosaic[row1 - child.shape[0] : row1, col0 : col0 + child.shape[1]] = child
            texture = np.asarray(
                Image.fromarray(mosaic).resize((mosaic.shape[1] // 2, mosaic.shape[0] // 2), Image.Resampling.BOX)
            )
        else:
            texture = textures.pop((0, index_along, index_across))
        textures[(level, index_along, index_across)] = texture

        segments_along = LEAF_SEGMENTS if level == 0 else COARSE_SEGMENTS
        spacing = LEAF_SIZE * span // segments_along
        row0, col0 = first_along * LEAF_SIZE, first_across * LEAF_SIZE
        lattice = np.s_[row0 : row0 + size_along + 1 : spacing, col0 : col0 + size_across + 1 : spacing]
        if spacing not in smoothed_surfaces:
            smoothed_surfaces[spacing] = ndimage.uniform_filter(surface, size=spacing, mode="nearest")
        heights = smoothed_surfaces[spacing][lattice]
        skirt = max(2.0, 4.0 * spacing)
        surface_mesh = grid_mesh(heights, along0, across0, spacing, skirt, size_along, size_across)
        ground_spacing = LEAF_SIZE * span // GROUND_SEGMENTS
        ground_heights = ground[row0 : row0 + size_along + 1 : ground_spacing, col0 : col0 + size_across + 1 : ground_spacing]
        ground_mesh = grid_mesh(ground_heights, along0, across0, ground_spacing, 0, size_along, size_across)

        name = f"{level}-{index_along}-{index_across}"
        webp = io.BytesIO()
        Image.fromarray(texture).save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
        write_glb(RAW_DIR / "tiles" / f"{name}.glb", surface_mesh, ground_mesh, webp.getvalue())

        low = float(min(surface_mesh[0][:, 1].min(), ground_mesh[0][:, 1].min()))
        high = max(float(surface_mesh[0][:, 1].max()), low + 1)
        tile = {
            "boundingVolume": {
                "box": [
                    along0 + size_along / 2,
                    across0 + size_across / 2,
                    (low + high) / 2,
                    size_along / 2, 0, 0,
                    0, size_across / 2, 0,
                    0, 0, (high - low) / 2,
                ]
            },
            "geometricError": 0 if level == 0 else LEAF_SIZE * span * ERROR_PER_TILE_SIZE,
            "content": {"uri": f"tiles/{name}.glb"},
        }
        if children:
            tile["children"] = children
        return tile

    top_span = 2 ** (LEVEL_COUNT - 1)
    top_tiles = [
        build_tile(LEVEL_COUNT - 1, index_along, index_across)
        for index_along in range(math.ceil(region.leaves_along / top_span))
        for index_across in range(math.ceil(region.leaves_across / top_span))
    ]
    corners_low = min(tile["boundingVolume"]["box"][2] - tile["boundingVolume"]["box"][11] for tile in top_tiles)
    corners_high = max(tile["boundingVolume"]["box"][2] + tile["boundingVolume"]["box"][11] for tile in top_tiles)
    size_along, size_across = region.leaves_along * LEAF_SIZE, region.leaves_across * LEAF_SIZE
    # The root has no content, so it must always refine into the top tiles.
    root_error = 1e5
    tileset = {
        "asset": {"version": "1.1", "copyright": ATTRIBUTION},
        "geometricError": root_error,
        "root": {
            "transform": frame.tileset_transform(),
            "boundingVolume": {
                "box": [
                    region.along0 + size_along / 2,
                    region.across0 + size_across / 2,
                    (corners_low + corners_high) / 2,
                    size_along / 2, 0, 0,
                    0, size_across / 2, 0,
                    0, 0, (corners_high - corners_low) / 2,
                ]
            },
            "geometricError": root_error,
            "refine": "REPLACE",
            "children": top_tiles,
        },
    }
    (RAW_DIR / "tileset.json").write_text(json.dumps(tileset, indent="\t"))
    print(f"Wrote {RAW_DIR / 'tileset.json'}")


if __name__ == "__main__":
    sys.exit(build())
