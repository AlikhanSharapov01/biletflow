"""Structural validation of uploaded PNG, JPEG and PDF files (BF-16, #75).

A leading magic number proves nothing about the rest of a file, so each check walks the whole
container format with the standard library only:

- PNG: every chunk's length and CRC, a valid IHDR, a palette where one is required, consecutive
  IDAT chunks whose zlib stream inflates to exactly the size the header declares (inflation stops
  as soon as it overshoots, which bounds decompression bombs), and IEND as the last bytes.
- JPEG: the marker/segment sequence from SOI to EOI with a frame header before the first scan,
  skipping entropy-coded data by its byte-stuffing rules, and nothing after EOI.
- PDF: a version header, a final `startxref` offset that points at a cross-reference table (every
  in-use entry must point at the object it names) or at a cross-reference stream, a trailer with a
  document catalog (`/Root`), and nothing after the final `%%EOF`.

These are format checks, not malware checks: malware_scanner.py decides whether a well-formed file
is safe. Pixel data and PDF content streams are not interpreted.
"""

import re
import struct
import zlib

# Same ceiling as event images: bounds the inflated size of a PNG.
MAX_PIXELS = 16_000_000

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Allowed bit depths and channel counts per PNG colour type.
PNG_DEPTHS = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
PNG_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
# Adam7 passes as (first column, first row, column step, row step).
ADAM7 = (
    (0, 0, 8, 8),
    (4, 0, 8, 8),
    (0, 4, 4, 8),
    (2, 0, 4, 4),
    (0, 2, 2, 4),
    (1, 0, 2, 2),
    (0, 1, 1, 2),
)
INFLATE_STEP = 64 * 1024

# Frame headers (SOF0-SOF15 except DHT C4, JPG C8 and DAC CC); the lossless ones allow 2-16 bits.
JPEG_FRAMES = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
JPEG_LOSSLESS = {0xC3, 0xC7, 0xCB, 0xCF}

PDF_HEADER = re.compile(rb"%PDF-[12]\.\d")
PDF_TAIL = re.compile(rb"startxref[\s]+(\d{1,10})[\s]+%%EOF[\s\0]*\Z")
PDF_SUBSECTION = re.compile(rb"[\s]*(\d{1,10})[ ]+(\d{1,10})[ \t]*(?:\r\n|\r|\n)")
PDF_ENTRY = re.compile(rb"(\d{10}) (\d{5}) ([nf])[ ]?(?:\r\n|\r|\n)")
PDF_OBJECT = re.compile(rb"[\s\0]*(\d{1,10})[\s]+(\d{1,5})[\s]+obj\b")
PDF_TRAILER = re.compile(rb"[\s]*trailer[\s]*<<")
# Only the end of the file is searched for the final startxref.
PDF_TAIL_BYTES = 2048
# An inflated cross-reference stream larger than this is not a plausible upload.
MAX_XREF_STREAM = 16 * 1024 * 1024


def valid_content(content_type, data):
    """True when `data` is a structurally valid file of the declared type."""
    check = CHECKS.get(content_type)
    if check is None or not data:
        return False
    try:
        return bool(check(data))
    except (ValueError, IndexError, OverflowError, struct.error, zlib.error):
        return False


# --- PNG -----------------------------------------------------------------------------------


def png_raw_size(width, height, bits_per_pixel, interlace):
    """Bytes the IDAT stream must inflate to: each row is one filter byte plus its pixels."""

    def rows(columns, count):
        if columns <= 0 or count <= 0:
            return 0
        return count * (1 + (columns * bits_per_pixel + 7) // 8)

    if not interlace:
        return rows(width, height)
    return sum(
        rows((width - x + dx - 1) // dx, (height - y + dy - 1) // dy) for x, y, dx, dy in ADAM7
    )


def valid_png(data):
    if not data.startswith(PNG_SIGNATURE):
        return False
    position, end = len(PNG_SIGNATURE), len(data)
    header = None
    palette = image_started = image_ended = False
    inflater, produced, expected = zlib.decompressobj(), 0, 0
    while True:
        if position + 12 > end:
            return False
        length, kind = struct.unpack(">I4s", data[position : position + 8])
        if length > 0x7FFFFFFF or position + 12 + length > end:
            return False
        body = data[position + 8 : position + 8 + length]
        (crc,) = struct.unpack(">I", data[position + 8 + length : position + 12 + length])
        if zlib.crc32(kind + body) != crc or not kind.isalpha():
            return False
        position += 12 + length
        if header is None:
            if kind != b"IHDR" or length != 13:
                return False
            width, height, depth, color, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", body
            )
            if (
                not (0 < width <= 0x7FFFFFFF and 0 < height <= 0x7FFFFFFF)
                or width * height > MAX_PIXELS
                or depth not in PNG_DEPTHS.get(color, ())
                or compression != 0
                or filtering != 0
                or interlace not in (0, 1)
            ):
                return False
            header = (depth, color)
            expected = png_raw_size(width, height, depth * PNG_CHANNELS[color], interlace)
            continue
        if kind == b"IHDR":
            return False
        if kind == b"IEND":
            return (
                length == 0
                and image_started
                and position == end
                and inflater.eof
                and not inflater.unused_data
                and produced == expected
            )
        if kind == b"IDAT":
            if image_ended or (header[1] == 3 and not palette):
                return False
            image_started = True
            pending = body
            while pending:
                produced += len(inflater.decompress(pending, INFLATE_STEP))
                if produced > expected:
                    return False
                pending = inflater.unconsumed_tail
            continue
        if image_started:
            image_ended = True  # IDAT chunks must be consecutive
        if kind == b"PLTE":
            depth, color = header
            entries, remainder = divmod(length, 3)
            if (
                palette
                or image_started
                or color in (0, 4)
                or remainder
                or not 1 <= entries <= 256
                or (color == 3 and entries > 2**depth)
            ):
                return False
            palette = True
        elif kind[0] < 0x61:
            # An unknown critical chunk (upper-case first letter) cannot be skipped safely.
            return False


# --- JPEG ----------------------------------------------------------------------------------


def valid_jpeg(data):
    if not data.startswith(b"\xff\xd8"):
        return False
    position, end = 2, len(data)
    frame, scans = False, 0
    while True:
        if position >= end or data[position] != 0xFF:
            return False
        while position < end and data[position] == 0xFF:
            position += 1  # fill bytes may precede any marker
        if position >= end:
            return False
        marker = data[position]
        position += 1
        if marker == 0xD9:  # EOI
            return frame and scans > 0 and not data[position:].strip(b"\0")
        if marker in (0x00, 0x01, 0xD8) or 0xD0 <= marker <= 0xD7:
            return False  # stuffing, TEM, a second SOI or a restart marker outside a scan
        if position + 2 > end:
            return False
        length = int.from_bytes(data[position : position + 2], "big")
        if length < 2 or position + length > end:
            return False
        body = data[position + 2 : position + length]
        position += length
        if marker in JPEG_FRAMES:
            if frame or len(body) < 6:
                return False
            precision = body[0]
            height = int.from_bytes(body[1:3], "big")
            width = int.from_bytes(body[3:5], "big")
            components = body[5]
            precisions = range(2, 17) if marker in JPEG_LOSSLESS else (8, 12)
            if (
                precision not in precisions
                or height == 0
                or width == 0
                or not 1 <= components <= 4
                or len(body) != 6 + 3 * components
            ):
                return False
            frame = True
        elif marker == 0xDA:  # SOS, followed by entropy-coded data
            components = body[0] if body else 0
            if not frame or not 1 <= components <= 4 or len(body) != 4 + 2 * components:
                return False
            scans += 1
            while True:
                position = data.find(b"\xff", position)
                if position < 0 or position + 1 >= end:
                    return False
                following = data[position + 1]
                if following == 0x00 or 0xD0 <= following <= 0xD7:
                    position += 2  # stuffed 0xFF data byte or restart marker
                elif following == 0xFF:
                    position += 1
                else:
                    break


# --- PDF -----------------------------------------------------------------------------------


def valid_pdf(data):
    if not PDF_HEADER.match(data):
        return False
    tail_start = max(0, len(data) - PDF_TAIL_BYTES)
    tails = list(PDF_TAIL.finditer(data, tail_start))
    if not tails:
        return False
    offset = int(tails[-1].group(1))
    if not 0 < offset < tails[-1].start():
        return False
    if data.startswith(b"xref", offset):
        return valid_xref_table(data, offset + 4)
    return valid_xref_stream(data, offset)


def valid_xref_table(data, position):
    in_use = []
    while not PDF_TRAILER.match(data, position):
        section = PDF_SUBSECTION.match(data, position)
        if not section:
            return False
        first, count = int(section.group(1)), int(section.group(2))
        position = section.end()
        if count > (len(data) - position) // 19:
            return False
        for number in range(first, first + count):
            entry = PDF_ENTRY.match(data, position)
            if not entry:
                return False
            if entry.group(3) == b"n":
                in_use.append((number, int(entry.group(1))))
            position = entry.end()
    trailer_end = data.find(b"startxref", position)
    if trailer_end < 0 or not re.search(
        rb"/Root[\s]*\d+[\s]+\d+[\s]+R", data[position:trailer_end]
    ):
        return False
    for number, offset in in_use:
        found = PDF_OBJECT.match(data, offset) if offset < len(data) else None
        if not found or int(found.group(1)) != number:
            return False
    return True


def valid_xref_stream(data, offset):
    found = PDF_OBJECT.match(data, offset)
    if not found:
        return False
    start = data.find(b"stream", found.end())
    if start < 0:
        return False
    dictionary = data[found.end() : start]
    if not re.search(rb"/Type[\s]*/XRef\b", dictionary) or not re.search(
        rb"/Root[\s]*\d+[\s]+\d+[\s]+R", dictionary
    ):
        return False
    body_start = start + len(b"stream")
    if data.startswith(b"\r\n", body_start):
        body_start += 2
    elif data.startswith(b"\n", body_start):
        body_start += 1
    else:
        return False
    body_end = data.find(b"endstream", body_start)
    if body_end < 0 or data.find(b"endobj", body_end) < 0:
        return False
    if re.search(rb"/Filter[\s]*/FlateDecode\b", dictionary):
        inflater, pending, produced = zlib.decompressobj(), data[body_start:body_end], 0
        while pending and not inflater.eof:
            produced += len(inflater.decompress(pending, INFLATE_STEP))
            if produced > MAX_XREF_STREAM:
                return False
            pending = inflater.unconsumed_tail
        if not inflater.eof:
            return False
    return True


CHECKS = {"image/png": valid_png, "image/jpeg": valid_jpeg, "application/pdf": valid_pdf}
