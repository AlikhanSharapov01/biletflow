"""Structural validation of uploaded PNG, JPEG and PDF files (BF-16, #75).

A leading magic number proves nothing about the rest of a file, so each check walks the whole
container format with the standard library only:

- PNG: every chunk's length and CRC, a valid IHDR, a palette where one is required, consecutive
  IDAT chunks whose zlib stream inflates to exactly the size the header declares (inflation stops
  as soon as it overshoots, which bounds decompression bombs), and IEND as the last bytes.
- JPEG: the marker/segment sequence from SOI to EOI with a frame header before the first scan,
  skipping entropy-coded data by its byte-stuffing rules, and nothing after EOI.
- PDF: a version header, a final `startxref` offset and every cross-reference section reachable
  from it through `/Prev` (classic tables, or decoded cross-reference streams with their PNG
  predictors), each in-use entry pointing at the object it names, and a `/Root` that resolves to a
  `/Type /Catalog` object, directly or inside a decoded object stream. Nothing may follow the
  final `%%EOF`. Stream decoding is FlateDecode only and capped.

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
PDF_ROOT = re.compile(rb"/Root[\s]*(\d{1,10})[\s]+(\d{1,5})[\s]+R")
PDF_PREV = re.compile(rb"/Prev[\s]+(\d{1,10})")
PDF_CATALOG = re.compile(rb"/Type[\s]*/Catalog\b")
PDF_XREF_TYPE = re.compile(rb"/Type[\s]*/XRef\b")
PDF_OBJSTM_TYPE = re.compile(rb"/Type[\s]*/ObjStm\b")
PDF_WIDTHS = re.compile(rb"/W[\s]*\[[\s]*(\d)[\s]+(\d)[\s]+(\d)[\s]*\]")
PDF_SIZE = re.compile(rb"/Size[\s]+(\d{1,10})")
PDF_INDEX = re.compile(rb"/Index[\s]*\[([\d\s]*)\]")
# A direct /Length (not an indirect `N G R` reference).
PDF_LENGTH = re.compile(rb"/Length[\s]+(\d{1,10})(?![\d])(?![\s]+\d+[\s]+R)")
PDF_FIRST = re.compile(rb"/First[\s]+(\d{1,10})")
PDF_FILTER = re.compile(rb"/Filter[\s]*\[?[\s]*/(\w+)[\s]*\]?")
PDF_PREDICTOR = re.compile(rb"/Predictor[\s]+(\d{1,2})")
PDF_COLUMNS = re.compile(rb"/Columns[\s]+(\d{1,3})")
# Cross-reference sections followed through /Prev (incremental updates) before giving up.
PDF_MAX_SECTIONS = 16
# Only the end of the file is searched for the final startxref.
PDF_TAIL_BYTES = 2048
# A decoded cross-reference or object stream larger than this is not a plausible upload.
MAX_PDF_STREAM = 16 * 1024 * 1024


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
    """Header, final startxref, every cross-reference section (following /Prev) and a /Root that
    resolves to a /Type /Catalog object, directly or inside an object stream."""
    if not PDF_HEADER.match(data):
        return False
    tail_start = max(0, len(data) - PDF_TAIL_BYTES)
    tails = list(PDF_TAIL.finditer(data, tail_start))
    if not tails:
        return False
    section, end = int(tails[-1].group(1)), tails[-1].start()
    entries, root, seen = {}, None, set()
    while True:
        if section in seen or len(seen) >= PDF_MAX_SECTIONS or not 0 < section < end:
            return False
        seen.add(section)
        if data.startswith(b"xref", section):
            parsed = xref_table(data, section + 4)
        else:
            parsed = xref_stream(data, section)
        if parsed is None:
            return False
        found, trailer = parsed
        for number, entry in found.items():
            entries.setdefault(number, entry)  # the newest section wins
        if root is None:
            match = PDF_ROOT.search(trailer)
            root = (int(match.group(1)), int(match.group(2))) if match else None
        previous = PDF_PREV.search(trailer)
        if not previous:
            break
        section = int(previous.group(1))
    if root is None:
        return False
    for number, entry in entries.items():
        if entry[0] == "n" and object_body(data, entry[1], number) is None:
            return False  # an in-use entry must point at the object it names
    return catalog(data, entries, *root)


def xref_table(data, position):
    """({number: entry}, trailer dictionary) of a classic cross-reference section, or None."""
    found = {}
    while not PDF_TRAILER.match(data, position):
        section = PDF_SUBSECTION.match(data, position)
        if not section:
            return None
        first, count = int(section.group(1)), int(section.group(2))
        position = section.end()
        if count > (len(data) - position) // 19:
            return None
        for number in range(first, first + count):
            entry = PDF_ENTRY.match(data, position)
            if not entry:
                return None
            if entry.group(3) == b"n":
                found[number] = ("n", int(entry.group(1)), int(entry.group(2)))
            else:
                found[number] = ("f",)
            position = entry.end()
    trailer_end = data.find(b"startxref", position)
    if trailer_end < 0:
        return None
    return found, data[position:trailer_end]


def object_body(data, offset, number):
    """Bytes between `number G obj` at `offset` and its `endobj`, or None."""
    found = PDF_OBJECT.match(data, offset) if 0 <= offset < len(data) else None
    if not found or int(found.group(1)) != number:
        return None
    end = data.find(b"endobj", found.end())
    return None if end < 0 else data[found.end() : end]


def stream_data(body):
    """(dictionary, decoded stream bytes) of a stream object body, or None.

    Only unfiltered and FlateDecode streams are decoded; inflation is capped.
    """
    start = body.find(b"stream")
    if start < 0:
        return None
    dictionary, position = body[:start], start + len(b"stream")
    if body.startswith(b"\r\n", position):
        position += 2
    elif body.startswith(b"\n", position):
        position += 1
    else:
        return None
    finish = body.rfind(b"endstream")
    if finish < position:
        return None
    raw = body[position:finish]
    length = PDF_LENGTH.search(dictionary)
    if length and int(length.group(1)) <= len(raw):
        raw = raw[: int(length.group(1))]  # a direct /Length is exact; binary may end in EOLs
    filters = PDF_FILTER.search(dictionary)
    if filters is None:
        return dictionary, raw if length else raw.rstrip(b"\r\n")
    if filters.group(1) != b"FlateDecode":
        return None
    inflater, pending, output = zlib.decompressobj(), raw, []
    produced = 0
    while pending and not inflater.eof:
        part = inflater.decompress(pending, INFLATE_STEP)
        produced += len(part)
        if produced > MAX_PDF_STREAM:
            return None
        output.append(part)
        pending = inflater.unconsumed_tail
    if not inflater.eof:
        return None
    return dictionary, b"".join(output)


def png_unpredict(rows, columns):
    """Undo the PNG predictors (DecodeParms /Predictor 10-15) on 1-byte samples."""
    width = columns + 1
    if len(rows) % width:
        return None
    previous, output = bytes(columns), bytearray()
    for start in range(0, len(rows), width):
        kind, line = rows[start], bytearray(rows[start + 1 : start + width])
        for i in range(columns):
            left = line[i - 1] if i else 0
            up, corner = previous[i], previous[i - 1] if i else 0
            if kind == 1:
                line[i] = (line[i] + left) & 0xFF
            elif kind == 2:
                line[i] = (line[i] + up) & 0xFF
            elif kind == 3:
                line[i] = (line[i] + (left + up) // 2) & 0xFF
            elif kind == 4:
                p = left + up - corner
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - corner)
                best = left if pa <= pb and pa <= pc else up if pb <= pc else corner
                line[i] = (line[i] + best) & 0xFF
            elif kind != 0:
                return None
        output += line
        previous = line
    return bytes(output)


def xref_stream(data, offset):
    """({number: entry}, stream dictionary) of a cross-reference stream, or None."""
    found = PDF_OBJECT.match(data, offset)
    if not found:
        return None
    body = object_body(data, offset, int(found.group(1)))
    decoded = stream_data(body) if body is not None else None
    if decoded is None:
        return None
    dictionary, rows = decoded
    widths = PDF_WIDTHS.search(dictionary)
    size = PDF_SIZE.search(dictionary)
    if not PDF_XREF_TYPE.search(dictionary) or not widths or not size:
        return None
    widths = [int(width) for width in widths.groups()]
    if any(width > 8 for width in widths) or widths[1] == 0:
        return None
    predictor = PDF_PREDICTOR.search(dictionary)
    if predictor and int(predictor.group(1)) >= 10:
        columns = PDF_COLUMNS.search(dictionary)
        if not columns or int(columns.group(1)) != sum(widths):
            return None
        rows = png_unpredict(rows, sum(widths))
    elif predictor and int(predictor.group(1)) != 1:
        return None
    index = PDF_INDEX.search(dictionary)
    numbers = [int(n) for n in index.group(1).split()] if index else [0, int(size.group(1))]
    if len(numbers) % 2 or rows is None:
        return None
    sections = list(zip(numbers[::2], numbers[1::2]))
    width = sum(widths)
    if sum(count for _, count in sections) * width > len(rows):
        return None
    entries, position = {}, 0
    for first, count in sections:
        for number in range(first, first + count):
            fields, cursor = [], position
            for size_ in widths:
                fields.append(int.from_bytes(rows[cursor : cursor + size_], "big"))
                cursor += size_
            position = cursor
            kind = fields[0] if widths[0] else 1
            if kind == 1:
                entries[number] = ("n", fields[1], fields[2])
            elif kind == 2:
                entries[number] = ("c", fields[1], fields[2])
            else:
                entries[number] = ("f",)
    return entries, dictionary


def catalog(data, entries, number, generation):
    """True when object `number generation` is a /Type /Catalog dictionary."""
    entry = entries.get(number)
    if entry is None or entry[0] == "f":
        return False
    if entry[0] == "n":
        body = object_body(data, entry[1], number)
        found = PDF_OBJECT.match(data, entry[1])
        return (
            body is not None
            and entry[2] == generation
            and int(found.group(2)) == generation
            and bool(PDF_CATALOG.search(body))
        )
    # Compressed into an object stream: objects there always have generation 0.
    container = entries.get(entry[1])
    if generation != 0 or container is None or container[0] != "n":
        return False
    body = object_body(data, container[1], entry[1])
    decoded = stream_data(body) if body is not None else None
    if decoded is None or not PDF_OBJSTM_TYPE.search(decoded[0]):
        return False
    dictionary, content = decoded
    first = PDF_FIRST.search(dictionary)
    if not first or int(first.group(1)) > len(content):
        return False
    # The header is integer pairs; PDF comments may sit between them.
    head = re.sub(rb"%[^\r\n]*", b" ", content[: int(first.group(1))]).split()
    if len(head) % 2 or not all(item.isdigit() for item in head):
        return False
    offsets = [(int(n), int(o)) for n, o in zip(head[::2], head[1::2])]
    for position, (member, start) in enumerate(offsets):
        if member == number:
            stop = offsets[position + 1][1] if position + 1 < len(offsets) else None
            base = int(first.group(1))
            text = content[base + start : None if stop is None else base + stop]
            return bool(PDF_CATALOG.search(text))
    return False


CHECKS = {"image/png": valid_png, "image/jpeg": valid_jpeg, "application/pdf": valid_pdf}
