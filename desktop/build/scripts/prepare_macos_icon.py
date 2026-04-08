#!/usr/bin/env python3

import argparse
import base64
from io import BytesIO
from pathlib import Path

from PIL import Image


CANVAS_SIZE = 1024
DEFAULT_INSET = 100


def render_padded_png(source: Path, destination: Path, inset: int) -> bytes:
    image = Image.open(source).convert("RGBA")
    inner_size = CANVAS_SIZE - inset * 2

    if image.size != (inner_size, inner_size):
        image = image.resize((inner_size, inner_size), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    canvas.paste(image, (inset, inset), image)
    canvas.save(destination)

    buffer = BytesIO()
    canvas.save(buffer, format="PNG")
    return buffer.getvalue()


def render_svg(png_bytes: bytes, destination: Path) -> None:
    encoded = base64.b64encode(png_bytes).decode("ascii")
    destination.write_text(
        (
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
            'viewBox="0 0 1024 1024"><image width="1024" height="1024" '
            f'href="data:image/png;base64,{encoded}"/></svg>\n'
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("png_output")
    parser.add_argument("svg_output")
    parser.add_argument("--inset", type=int, default=DEFAULT_INSET)
    args = parser.parse_args()

    source = Path(args.source)
    png_output = Path(args.png_output)
    svg_output = Path(args.svg_output)

    png_output.parent.mkdir(parents=True, exist_ok=True)
    svg_output.parent.mkdir(parents=True, exist_ok=True)

    png_bytes = render_padded_png(source, png_output, args.inset)
    render_svg(png_bytes, svg_output)


if __name__ == "__main__":
    main()
