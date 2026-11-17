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
# A run of fill bytes before a marker.
JPEG_FILL = re.compile(rb"\xff+")
# Entropy-coded data ends at the first 0xFF that is not a stuffed byte (FF 00), a restart marker
# (FF D0-D7) or a fill byte (FF FF).
JPEG_SCAN_END = re.compile(rb"\xff[^\x00\xd0-\xd7\xff]")

PDF_HEADER = re.compile(rb"%PDF-[12]\.\d")
PDF_TAIL = re.compile(rb"startxref[\s]+(\d{1,10})[\s]+%%EOF[\s\0]*\Z")
PDF_SUBSECTION = re.compile(rb"[\s]*(\d{1,10})[ ]+(\d{1,10})[ \t]*(?:\r\n|\r|\n)")
PDF_ENTRY = re.compile(rb"(\d{10}) (\d{5}) ([nf])[ ]?(?:\r\n|\r|\n)")
# Whitespace runs are bounded: many entries may point at the same offset.
PDF_OBJECT = re.compile(rb"[\s\0]{0,32}(\d{1,10})[\s]{1,32}(\d{1,5})[\s]{1,32}obj\b")
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
PDF_COUNT = re.compile(rb"/N[\s]+(\d{1,10})")
# An object stream header is integers separated by whitespace and comments. It is read by
# objstm_integer() with these three patterns: each is one character class with nothing after it
# to backtrack for, and the skipping loop only ever moves forward.
PDF_SPACE = re.compile(rb"[\s\0]*")
PDF_LINE_END = re.compile(rb"[\r\n]")
PDF_INTEGER = re.compile(rb"(\d{1,10})(?![\d])")
# An object stream header holds N pairs of integers of at most 10 digits plus separators.
PDF_OBJSTM_PAIR_BYTES = 24
# Comments skipped in one object stream header. qpdf's QDF mode writes its comments after the
# pairs, so real headers need none; the cap keeps the skipping loop short.
PDF_OBJSTM_COMMENTS = 256
# The name of the filter, or of the first one in an array. The optional `[` sits between the two
# whitespace runs inside its own group so a run can only be matched one way.
PDF_FILTER = re.compile(rb"/Filter[\s]*(?:\[[\s]*)?/(\w+)")
PDF_PREDICTOR = re.compile(rb"/Predictor[\s]+(\d{1,2})")
PDF_COLUMNS = re.compile(rb"/Columns[\s]+(\d{1,3})")
# Cross-reference sections followed through /Prev (incremental updates) before giving up.
PDF_MAX_SECTIONS = 16
# Entries over all sections: never more than one per PDF_MIN_OBJECT_BYTES of the file (an
# object's header and endobj alone take that much), and never more than PDF_MAX_ENTRIES.
PDF_MAX_ENTRIES = 100_000
PDF_MIN_OBJECT_BYTES = 8
# Bound for searches inside one object's dictionary (catalog, stream dictionaries, trailers).
PDF_DICT_LIMIT = 64 * 1024
# After the /Length bytes of a stream: an end-of-line and `endstream`. The run is bounded because
# every cross-reference section may point its /Length at the same place.
PDF_STREAM_END = re.compile(rb"[\s]{0,32}endstream")
# Only the end of the file is searched for the final startxref.
PDF_TAIL_BYTES = 2048
# A decoded object stream larger than this is not a plausible upload.
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
            # zlib copies the input a call leaves unconsumed, so the chunk goes in by slices.
            for start in range(0, length, INFLATE_STEP):
                if inflater.eof:
                    return False  # data after the end of the zlib stream
                pending = body[start : start + INFLATE_STEP]
                # Stop at the end of the stream: input after it is unused_data, and on some
                # Python versions (3.12) it also stays in unconsumed_tail, so looping on the
                # tail alone would never end.
                while pending and not inflater.eof:
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
        if position + 1 >= end or data[position] != 0xFF:
            return False
        position += 1
        if data[position] == 0xFF:  # fill bytes may precede any marker
            position = JPEG_FILL.match(data, position).end()
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
            scan_end = JPEG_SCAN_END.search(data, position)
            if not scan_end:
                return False
            position = scan_end.start()


# --- PDF -----------------------------------------------------------------------------------
#
# Work is bounded on hostile input: at most PDF_MAX_SECTIONS cross-reference sections, at most
# `entry_budget(data)` entries over all of them (an in-use object needs at least its header, so
# a small file cannot declare many), xref streams inflate only to what that many rows need, each
# in-use entry is checked by an anchored header match only, and `endobj`/dictionary searches are
# bounded by PDF_DICT_LIMIT except one search per stream for its end. Streams are inflated by
# inflate(), which keeps only the range asked for. No pattern has two quantifiers that can share
# the same bytes, and an object stream header is scanned by objstm_integer(), not by one pattern.


def entry_budget(data):
    return min(PDF_MAX_ENTRIES, max(16, len(data) // PDF_MIN_OBJECT_BYTES))


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
    budget = [entry_budget(data)]
    while True:
        if section in seen or len(seen) >= PDF_MAX_SECTIONS or not 0 < section < end:
            return False
        seen.add(section)
        if data.startswith(b"xref", section):
            parsed = xref_table(data, section + 4, budget)
        else:
            parsed = xref_stream(data, section, budget)
        if parsed is None:
            return False
        found, trailer = parsed
        for number, entry in found:
            if number in entries:
                continue  # the newest section wins
            # An in-use entry must point at the object it names (anchored header match only).
            if entry[0] == "n" and object_header(data, entry[1], number) is None:
                return False
            entries[number] = entry
        if root is None:
            match = PDF_ROOT.search(trailer)
            root = (int(match.group(1)), int(match.group(2))) if match else None
        previous = PDF_PREV.search(trailer)
        if not previous:
            break
        section = int(previous.group(1))
    return root is not None and catalog(data, entries, *root)


def spend(budget, count):
    budget[0] -= count
    return budget[0] >= 0


def xref_table(data, position, budget):
    """([(number, entry)], trailer dictionary) of a classic cross-reference section, or None."""
    found = []
    while not PDF_TRAILER.match(data, position):
        section = PDF_SUBSECTION.match(data, position)
        if not section:
            return None
        first, count = int(section.group(1)), int(section.group(2))
        position = section.end()
        # An empty subsection still costs one entry, so it cannot be repeated for free.
        if count > (len(data) - position) // 19 or not spend(budget, max(1, count)):
            return None
        for number in range(first, first + count):
            entry = PDF_ENTRY.match(data, position)
            if not entry:
                return None
            if entry.group(3) == b"n":
                found.append((number, ("n", int(entry.group(1)), int(entry.group(2)))))
            else:
                found.append((number, ("f",)))
            position = entry.end()
    trailer_end = data.find(b"startxref", position, position + PDF_DICT_LIMIT)
    if trailer_end < 0:
        return None
    return found, data[position:trailer_end]


def object_header(data, offset, number):
    """The `number G obj` match at `offset`, or None."""
    found = PDF_OBJECT.match(data, offset) if 0 <= offset < len(data) else None
    return found if found and int(found.group(1)) == number else None


def stream_parts(data, start):
    """(dictionary, raw bytes) of the stream object whose `obj` header ends at `start`, or None.

    One search for the stream end; a direct /Length is used when it lands on `endstream`.
    """
    keyword = data.find(b"stream", start, start + PDF_DICT_LIMIT)
    if keyword < 0:
        return None
    dictionary, position = data[start:keyword], keyword + len(b"stream")
    if data.startswith(b"\r\n", position):
        position += 2
    elif data.startswith(b"\n", position):
        position += 1
    else:
        return None
    length = PDF_LENGTH.search(dictionary)
    if length:
        stop = position + int(length.group(1))
        if PDF_STREAM_END.match(data, stop):
            return dictionary, data[position:stop]
    stop = data.find(b"endstream", position)
    if stop < 0:
        return None
    return dictionary, data[position:stop].rstrip(b"\r\n")


def inflate(raw, start, stop):
    """(bytes [start:stop) of the inflated zlib stream `raw`, whether the stream ended).

    Nothing past `stop` is decoded and nothing outside the range is kept. Input goes in by
    INFLATE_STEP slices and output comes out in INFLATE_STEP pieces: zlib copies the input a call
    leaves unconsumed, so feeding everything at once would cost the input size per piece.
    """
    inflater, produced, kept = zlib.decompressobj(), 0, []
    for begin in range(0, len(raw), INFLATE_STEP):
        pending = raw[begin : begin + INFLATE_STEP]
        while pending and produced < stop and not inflater.eof:
            part = inflater.decompress(pending, min(INFLATE_STEP, stop - produced))
            if produced + len(part) > start:
                kept.append(part[max(0, start - produced) :])
            produced += len(part)
            pending = inflater.unconsumed_tail
        if inflater.eof or produced >= stop:
            break
    return b"".join(kept), inflater.eof


def decode(dictionary, raw, cap):
    """Decoded stream bytes (unfiltered or FlateDecode only), at most `cap` bytes, or None."""
    filters = PDF_FILTER.search(dictionary)
    if filters is None:
        return raw if len(raw) <= cap else None
    if filters.group(1) != b"FlateDecode":
        return None
    # One byte past the cap tells a stream that fits from one that is too long.
    output, ended = inflate(raw, 0, cap + 1)
    return output if ended and len(output) <= cap else None


def decoded_range(dictionary, raw, start, stop):
    """Bytes [start:stop) of a decoded stream (fewer if it ends first), or None.

    Never decodes past `stop` or MAX_PDF_STREAM.
    """
    if stop > MAX_PDF_STREAM:
        return None
    filters = PDF_FILTER.search(dictionary)
    if filters is None:
        return raw[start:stop]
    if filters.group(1) != b"FlateDecode":
        return None
    return inflate(raw, start, stop)[0]


def swar_add(a, b, mask_low, mask_high):
    """Byte-wise addition modulo 256 of two equal-length big-endian integers."""
    return ((a & mask_low) + (b & mask_low)) ^ ((a ^ b) & mask_high)


def png_unpredict(rows, columns):
    """Undo the PNG predictors (DecodeParms /Predictor 10-15) on 1-byte samples.

    "None" and "Up" rows, which cross-reference streams use, are decoded a whole row at a time.
    """
    width = columns + 1
    if len(rows) % width:
        return None
    mask_low, mask_high = int.from_bytes(b"\x7f" * columns), int.from_bytes(b"\x80" * columns)
    previous, output = 0, bytearray()
    for start in range(0, len(rows), width):
        kind = rows[start]
        if kind in (0, 2):
            value = int.from_bytes(rows[start + 1 : start + width])
            if kind == 2:
                value = swar_add(value, previous, mask_low, mask_high)
        elif kind in (1, 3, 4):
            above = previous.to_bytes(columns)
            line = bytearray(rows[start + 1 : start + width])
            for i in range(columns):
                left = line[i - 1] if i else 0
                up, corner = above[i], above[i - 1] if i else 0
                if kind == 1:
                    line[i] = (line[i] + left) & 0xFF
                elif kind == 3:
                    line[i] = (line[i] + (left + up) // 2) & 0xFF
                else:
                    p = left + up - corner
                    pa, pb, pc = abs(p - left), abs(p - up), abs(p - corner)
                    best = left if pa <= pb and pa <= pc else up if pb <= pc else corner
                    line[i] = (line[i] + best) & 0xFF
            value = int.from_bytes(line)
        else:
            return None
        output += value.to_bytes(columns)
        previous = value
    return bytes(output)


def xref_stream(data, offset, budget):
    """([(number, entry)], stream dictionary) of a cross-reference stream, or None."""
    found = PDF_OBJECT.match(data, offset)
    parts = stream_parts(data, found.end()) if found else None
    if parts is None:
        return None
    dictionary, raw = parts
    widths = PDF_WIDTHS.search(dictionary)
    size = PDF_SIZE.search(dictionary)
    if not PDF_XREF_TYPE.search(dictionary) or not widths or not size:
        return None
    widths = [int(width) for width in widths.groups()]
    width = sum(widths)
    # Real writers use a few bytes per field ([1 4 2] and the like).
    if any(w > 8 for w in widths) or width > 16 or widths[1] == 0:
        return None
    index = PDF_INDEX.search(dictionary)
    numbers = [int(n) for n in index.group(1).split()] if index else [0, int(size.group(1))]
    if len(numbers) % 2:
        return None
    sections = list(zip(numbers[::2], numbers[1::2]))
    total = sum(count for _, count in sections)
    if not spend(budget, total):
        return None  # more entries than the file can hold objects for
    predictor = PDF_PREDICTOR.search(dictionary)
    predicted = bool(predictor) and int(predictor.group(1)) >= 10
    if predictor and not predicted and int(predictor.group(1)) != 1:
        return None
    # Inflate only as far as the declared rows need.
    rows = decode(dictionary, raw, total * (width + predicted))
    if rows is None:
        return None
    if predicted:
        columns = PDF_COLUMNS.search(dictionary)
        if not columns or int(columns.group(1)) != width:
            return None
        rows = png_unpredict(rows, width)
        if rows is None:
            return None
    if total * width > len(rows):
        return None
    entries, position = [], 0
    for first, count in sections:
        for number in range(first, first + count):
            fields = []
            for size_ in widths:
                fields.append(int.from_bytes(rows[position : position + size_]))
                position += size_
            kind = fields[0] if widths[0] else 1
            if kind == 1:
                entries.append((number, ("n", fields[1], fields[2])))
            elif kind == 2:
                entries.append((number, ("c", fields[1], fields[2])))
            else:
                entries.append((number, ("f",)))
    return entries, dictionary


def catalog(data, entries, number, generation):
    """True when object `number generation` is a /Type /Catalog dictionary."""
    entry = entries.get(number)
    if entry is None or entry[0] == "f":
        return False
    if entry[0] == "n":
        found = object_header(data, entry[1], number)
        if found is None or entry[2] != generation or int(found.group(2)) != generation:
            return False
        end = data.find(b"endobj", found.end(), found.end() + PDF_DICT_LIMIT)
        return end >= 0 and bool(PDF_CATALOG.search(data, found.end(), end))
    # Compressed into an object stream: objects there always have generation 0.
    container = entries.get(entry[1])
    if generation != 0 or container is None or container[0] != "n":
        return False
    found = object_header(data, container[1], entry[1])
    parts = stream_parts(data, found.end()) if found else None
    if parts is None or not PDF_OBJSTM_TYPE.search(parts[0]):
        return False
    dictionary, raw = parts
    count, first = PDF_COUNT.search(dictionary), PDF_FIRST.search(dictionary)
    if not count or not first:
        return False
    count, base = int(count.group(1)), int(first.group(1))
    # The header can only be as long as its N pairs (plus room for comments, which qpdf's QDF
    # mode writes there), and N as large as the file allows.
    if (
        not 1 <= count <= entry_budget(data)
        or base > count * PDF_OBJSTM_PAIR_BYTES + PDF_DICT_LIMIT
    ):
        return False
    head = decoded_range(dictionary, raw, 0, base)
    if head is None or len(head) != base:
        return False
    # Read pairs only up to the member asked for.
    position, previous, start = 0, -1, None
    comments = [PDF_OBJSTM_COMMENTS]
    for _ in range(count):
        member = objstm_integer(head, position, comments)
        offset = objstm_integer(head, member[1], comments) if member else None
        if offset is None:
            return False
        value, position = offset
        if value < previous:
            return False  # offsets increase
        previous = value
        if start is not None:
            stop = value
            break
        if member[0] == number:
            start = value
    else:
        if start is None:
            return False
        stop = None
    # A catalog is a small dictionary: decode at most PDF_DICT_LIMIT bytes of it.
    limit = start + PDF_DICT_LIMIT if stop is None else min(stop, start + PDF_DICT_LIMIT)
    text = decoded_range(dictionary, raw, base + start, base + limit)
    return text is not None and bool(PDF_CATALOG.search(text))


def objstm_integer(head, position, comments):
    """(value, end) of the next integer in an object stream header from `position`, or None.

    Whitespace and comments before it are skipped in one forward pass: each step consumes what it
    matched, nothing is scanned twice, and at most `comments[0]` comments are skipped over all
    calls on one header.
    """
    while True:
        position = PDF_SPACE.match(head, position).end()
        if not head.startswith(b"%", position):
            break
        line_end = PDF_LINE_END.search(head, position)
        if line_end is None or not spend(comments, 1):
            return None  # the comment runs to the end of the header, or there are too many
        position = line_end.end()
    found = PDF_INTEGER.match(head, position)
    return (int(found.group(1)), found.end()) if found else None


CHECKS = {"image/png": valid_png, "image/jpeg": valid_jpeg, "application/pdf": valid_pdf}
