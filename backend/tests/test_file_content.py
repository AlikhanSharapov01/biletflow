"""Structural PNG/JPEG/PDF validation for support attachments (#75; BF-16).

The builders here are shared with the support attachment tests: they produce real, decodable
files (PNG/JPEG through Pillow, PDF written by hand with exact cross-reference offsets).
"""

import struct
import time
import tracemalloc
import zlib
from io import BytesIO

import pytest
from PIL import Image

from app.file_content import MAX_PIXELS, valid_content


def png(size=(4, 4), mode="RGB", **options):
    output = BytesIO()
    Image.new(mode, size, "white" if mode != "P" else 1).save(output, format="PNG", **options)
    return output.getvalue()


def jpeg(size=(8, 8), **options):
    output = BytesIO()
    Image.new("RGB", size, "blue").save(output, format="JPEG", **options)
    return output.getvalue()


def chunk(kind, body):
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))


def raw_png(width, height, raw, color=2, depth=8, interlace=0, extra=()):
    header = struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, interlace)
    chunks = [
        chunk(b"IHDR", header),
        *extra,
        chunk(b"IDAT", zlib.compress(raw)),
        chunk(b"IEND", b""),
    ]
    return b"\x89PNG\r\n\x1a\n" + b"".join(chunks)


def pdf(comment=b"", size=None):
    """A minimal valid PDF; `comment` lands before the cross-reference table.

    With `size`, the comment is padded so the whole file has exactly that many bytes.
    """
    if size is not None:
        base = len(pdf(comment))
        # startxref's digit count grows with the padding; settle it in two passes.
        guess = pdf(comment + b"x" * max(0, size - base))
        return pdf(comment + b"x" * max(0, size - base - (len(guess) - size)))
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    ]
    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    if comment:
        out += b"%" + comment + b"\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


def xref_stream_pdf():
    """PDF 1.5 layout: the cross-reference data is a compressed stream object."""
    out = bytearray(b"%PDF-1.5\n")
    offsets = []
    for number, body in enumerate(
        [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [] /Count 0 >>"], 1
    ):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    xref = len(out)
    rows = b"\x00\x00\x00\xff" + b"".join(b"\x01" + struct.pack(">H", o) + b"\x00" for o in offsets)
    rows += b"\x01" + struct.pack(">H", xref) + b"\x00"
    data = zlib.compress(rows)
    out += (
        b"3 0 obj\n<< /Type /XRef /Size 4 /W [1 2 1] /Root 1 0 R /Filter /FlateDecode "
        b"/Length %d >>\nstream\n%s\nendstream\nendobj\nstartxref\n%d\n%%%%EOF\n"
        % (len(data), data, xref)
    )
    return bytes(out)


def compressed_pdf():
    """PDF 1.5 with the catalog inside an object stream and a PNG-predicted xref stream."""
    out = bytearray(b"%PDF-1.5\n")
    members = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [] /Count 0 >>"]
    head, body = b"", b""
    for number, member in enumerate(members, 1):
        head += b"%d %d " % (number, len(body))
        body += member + b"\n"
    packed = zlib.compress(head + body)
    objstm = len(out)
    out += (
        b"3 0 obj\n<< /Type /ObjStm /N 2 /First %d /Filter /FlateDecode /Length %d >>\n"
        b"stream\n%s\nendstream\nendobj\n" % (len(head), len(packed), packed)
    )
    xref = len(out)
    entries = [(0, 0, 255), (2, 3, 0), (2, 3, 1), (1, objstm, 0), (1, xref, 0)]
    rows, previous = b"", bytes(4)
    for entry in entries:
        line = bytes([entry[0]]) + struct.pack(">H", entry[1]) + bytes([entry[2]])
        rows += b"\x02" + bytes((a - b) & 0xFF for a, b in zip(line, previous))  # PNG "Up"
        previous = line
    packed = zlib.compress(rows)
    out += (
        b"4 0 obj\n<< /Type /XRef /Size 5 /W [1 2 1] /Root 1 0 R /Filter /FlateDecode "
        b"/DecodeParms << /Columns 4 /Predictor 12 >> /Length %d >>\nstream\n%s\n"
        b"endstream\nendobj\nstartxref\n%d\n%%%%EOF\n" % (len(packed), packed, xref)
    )
    return bytes(out)


def incremental_pdf():
    """An incremental update: the newest xref section only lists the changed object."""
    base = pdf()
    previous = int(base[base.rindex(b"startxref") + 10 :].split()[0])
    out = bytearray(base)
    offset = len(out)
    out += b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>\nendobj\n"
    xref = len(out)
    out += b"xref\n3 1\n%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size 4 /Root 1 0 R /Prev %d >>\nstartxref\n%d\n%%%%EOF\n" % (
        previous,
        xref,
    )
    return bytes(out)


def fake_tail_pdf(payload):
    """Arbitrary bytes behind a syntactically plausible but empty cross-reference table."""
    out = b"%PDF-1.7\n" + payload
    xref = len(out)
    return out + (
        b"xref\n0 1\n0000000000 65535 f \ntrailer<</Root 9 0 R>>\nstartxref\n%d\n%%%%EOF\n" % xref
    )


def fake_xref_stream_pdf(payload):
    out = b"%PDF-1.7\n" + payload
    xref = len(out)
    return out + (
        b"1 0 obj<</Type/XRef/Root 9 0 R>>stream\nGARBAGE\nendstream endobj\n"
        b"startxref\n%d\n%%%%EOF\n" % xref
    )


def pdf_from_reportlab():
    from reportlab.pdfgen import canvas

    output = BytesIO()
    page = canvas.Canvas(output)
    page.drawString(72, 720, "Receipt 42")
    page.save()
    return output.getvalue()


# ------------------------------------------------------------------------------ valid files


@pytest.mark.parametrize(
    "data",
    [
        png(),
        png(mode="RGBA"),
        png(mode="L"),
        png(mode="P"),
        png(mode="1"),
        png(size=(1, 1)),
        png(size=(300, 7), optimize=True),
        # Adam7, 3x3 RGB: passes 1, 4, 5, 6, 7 hold 1+1+2+2+3 pixels = 4+4+7+8+10 raw bytes.
        raw_png(3, 3, bytes(33), interlace=1),
    ],
)
def test_real_png_files_are_accepted(data):
    assert valid_content("image/png", data)


@pytest.mark.parametrize(
    "data",
    [jpeg(), jpeg(size=(1, 1)), jpeg(progressive=True), jpeg(quality=5), jpeg(size=(640, 31))],
)
def test_real_jpeg_files_are_accepted(data):
    assert valid_content("image/jpeg", data)


def test_jpeg_with_exif_and_restart_markers_is_accepted():
    image = Image.new("RGB", (64, 64), "red")
    exif = Image.Exif()
    exif[0x010F] = "Camera"
    output = BytesIO()
    image.save(output, format="JPEG", exif=exif, restart_marker_blocks=1)
    data = output.getvalue()
    assert b"Exif" in data and b"\xff\xd0" in data
    assert valid_content("image/jpeg", data)


@pytest.mark.parametrize(
    "data",
    [
        pdf(),
        pdf(b"padding" * 100),
        pdf_from_reportlab(),
        xref_stream_pdf(),
        compressed_pdf(),
        incremental_pdf(),
    ],
)
def test_real_pdf_files_are_accepted(data):
    assert valid_content("application/pdf", data)


def test_pdf_builder_hits_an_exact_size():
    for size in (2048, 5000, 1024 * 1024):
        data = pdf(size=size)
        assert len(data) == size and valid_content("application/pdf", data)


# -------------------------------------------------------------------------- malformed files


def test_magic_bytes_alone_are_not_enough():
    assert not valid_content("image/png", b"\x89PNG\r\n\x1a\n" + b"png-body" * 20)
    assert not valid_content("image/jpeg", b"\xff\xd8\xff\xe0" + b"jpeg-body" * 20)
    assert not valid_content("application/pdf", b"%PDF-1.7\n" + b"pdf-body" * 20)
    assert not valid_content("application/pdf", b"%PDF-1.4\n% drill\n%%EOF\n")


def test_declared_type_must_match_content():
    assert not valid_content("image/png", jpeg())
    assert not valid_content("image/jpeg", png())
    assert not valid_content("application/pdf", png())
    assert not valid_content("text/plain", b"hello")
    assert not valid_content("image/png", b"")


def corrupt(data, at, value=b"\x00"):
    return data[:at] + value + data[at + len(value) :]


def test_malformed_png_is_rejected():
    good = png(size=(16, 16))
    idat = good.index(b"IDAT")
    for bad in [
        good[:-1],  # truncated IEND
        good[: idat + 10],  # truncated in the middle of the image data
        good + b"<script>alert(1)</script>",  # bytes appended after IEND
        corrupt(good, idat + 6, b"\xff\xff"),  # damaged compressed data (CRC no longer matches)
        corrupt(good, 29, b"\x00\x00\x00\x00"),  # IHDR CRC
        good.replace(b"IEND", b"IENX"),
    ]:
        assert not valid_content("image/png", bad)


def test_png_structure_rules():
    rgb = bytes(3 * (1 + 3 * 3))  # 3x3 RGB, one filter byte per row
    assert valid_content("image/png", raw_png(3, 3, rgb))
    assert not valid_content("image/png", raw_png(3, 3, rgb[:-1]))  # too little pixel data
    assert not valid_content("image/png", raw_png(3, 3, rgb + b"\x00"))  # too much
    assert not valid_content("image/png", raw_png(3, 3, bytes(30), interlace=1))
    assert not valid_content("image/png", raw_png(0, 3, b""))
    assert not valid_content("image/png", raw_png(3, 3, rgb, depth=7))
    assert not valid_content("image/png", raw_png(3, 3, rgb, interlace=2))
    # Palette images need a palette before the image data; greyscale may not have one.
    indexed = bytes(3 * (1 + 3))
    palette = chunk(b"PLTE", b"\x00\x00\x00" * 2)
    assert valid_content("image/png", raw_png(3, 3, indexed, color=3, extra=[palette]))
    assert not valid_content("image/png", raw_png(3, 3, indexed, color=3))
    assert not valid_content("image/png", raw_png(3, 3, indexed, color=0, extra=[palette]))
    # Unknown critical chunks cannot be skipped by a decoder; ancillary ones can.
    assert not valid_content("image/png", raw_png(3, 3, rgb, extra=[chunk(b"ABCD", b"")]))
    assert valid_content("image/png", raw_png(3, 3, rgb, extra=[chunk(b"tEXt", b"k\x00v")]))
    # Oversized dimensions are refused before any decompression.
    side = int(MAX_PIXELS**0.5) + 1
    assert not valid_content("image/png", raw_png(side, side, b""))


def test_png_decompression_bomb_is_bounded():
    # 1000x1000 RGB declared, but the stream inflates to far more than that.
    bomb = raw_png(1000, 1000, bytes(50_000_000))
    assert len(bomb) < 100_000
    assert not valid_content("image/png", bomb)


def test_malformed_jpeg_is_rejected():
    good = jpeg(size=(16, 16))
    sof = good.index(b"\xff\xc0")
    for bad in [
        good[:-2],  # no end-of-image marker
        good[: len(good) // 2],
        good + b"PK\x03\x04appended archive",  # data after the end of the image
        good[:2] + good[good.index(b"\xff\xda") :],  # scan without a frame header
        corrupt(good, sof + 5, b"\x00\x00"),  # zero height
        corrupt(good, sof + 2, b"\x00\x01"),  # segment length below 2
        b"\xff\xd8\xff\xd9",  # no image at all
    ]:
        assert not valid_content("image/jpeg", bad)


def test_malformed_pdf_is_rejected():
    good = pdf()
    xref = good.rindex(b"startxref")
    for bad in [
        good[:-6],  # no %%EOF
        good + b"MZ appended executable",
        good.replace(b"startxref\n", b"startxref\n9"),  # offset past the end
        good[:xref] + b"startxref\n12\n%%EOF\n",  # offset not at a cross-reference section
        good.replace(b"/Root 1 0 R", b"/Info 1 0 R"),  # no document catalog
        good.replace(b"0000000000 65535 f", b"000000000X 65535 f"),
        good.replace(b"2 0 obj", b"7 0 obj"),  # entry points at the wrong object
        good.replace(b"%PDF-1.7", b"%PDF-x.y"),
    ]:
        assert not valid_content("application/pdf", bad)
    stream = xref_stream_pdf()
    assert not valid_content("application/pdf", stream.replace(b"/Type /XRef", b"/Type /XRaf"))
    assert not valid_content("application/pdf", stream.replace(b"/Root 1 0 R", b"/Rost 1 0 R"))


@pytest.mark.parametrize(
    "payload", [b"MZ\x90\x00" + bytes(200), b"<html><script>alert(1)</script></html>\n"]
)
def test_arbitrary_content_behind_a_fake_pdf_tail_is_rejected(payload):
    assert not valid_content("application/pdf", fake_tail_pdf(payload))
    assert not valid_content("application/pdf", fake_xref_stream_pdf(payload))


def test_pdf_root_must_resolve_to_a_catalog():
    good = pdf()
    # Root names an object that is not in the table, is free, or is not a catalog.
    assert not valid_content("application/pdf", good.replace(b"/Root 1 0 R", b"/Root 9 0 R"))
    assert not valid_content("application/pdf", good.replace(b"/Root 1 0 R", b"/Root 2 0 R"))
    assert not valid_content("application/pdf", good.replace(b"/Root 1 0 R", b"/Root 1 5 R"))
    assert not valid_content("application/pdf", good.replace(b"/Type /Catalog", b"/Type /Catxlog"))
    catalog_entry = good.index(b"65535 f \n") + len(b"65535 f \n") + 17  # object 1's n/f flag
    assert good[catalog_entry : catalog_entry + 1] == b"n"
    freed = good[:catalog_entry] + b"f" + good[catalog_entry + 1 :]
    assert not valid_content("application/pdf", freed)
    # The same rules for a catalog compressed into an object stream.
    packed = compressed_pdf()
    assert not valid_content("application/pdf", packed.replace(b"/Root 1 0 R", b"/Root 2 0 R"))
    assert not valid_content("application/pdf", packed.replace(b"/Type /ObjStm", b"/Type /ObjStx"))
    assert not valid_content("application/pdf", packed.replace(b"/Predictor 12", b"/Predictor 2"))
    assert not valid_content("application/pdf", packed.replace(b"/Columns 4", b"/Columns 5"))
    # A broken /Prev chain (loop or bad offset) is refused.
    update = incremental_pdf()
    xref = int(update[update.rindex(b"startxref") + 10 :].split()[0])
    looped = update.replace(b"/Prev ", b"/Prev %d " % xref + b"/Old ")
    assert not valid_content("application/pdf", looped)


def zeros_deflated(size):
    """zlib stream of `size` zero bytes, built without holding them in memory."""
    packer, chunk, parts = zlib.compressobj(9), bytes(64 * 1024), []
    for _ in range(size // len(chunk)):
        parts.append(packer.compress(chunk))
    return b"".join(parts) + packer.flush()


def xref_stream_bomb(entries, predictor=False):
    """A few KB declaring millions of one-byte xref rows (/W [0 1 0])."""
    packed = zeros_deflated(entries * (2 if predictor else 1))
    parms = b"/DecodeParms << /Columns 1 /Predictor 12 >> " if predictor else b""
    out = b"%PDF-1.7\n"
    return out + (
        b"1 0 obj\n<< /Type /XRef /Size %d /W [0 1 0] /Root 1 0 R /Filter /FlateDecode %s"
        b"/Length %d >>\nstream\n%s\nendstream\nendobj\nstartxref\n%d\n%%%%EOF\n"
        % (entries, parms, len(packed), packed, len(out))
    )


def objects_without_endobj(count):
    """`count` in-use entries whose objects only close at the very end of the body."""
    out = bytearray(b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n")
    offsets = [9]
    for number in range(2, count + 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n<<>>\n" % number
    out += b"endobj\n"  # the only close: a per-entry endobj search would scan to here each time
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (count + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (count + 1, xref)
    return bytes(out)


def timed(data, content_type="application/pdf"):
    start = time.perf_counter()
    result = valid_content(content_type, data)
    return result, time.perf_counter() - start


@pytest.mark.parametrize("predictor", [False, True])
def test_xref_stream_bomb_is_rejected_cheaply(predictor):
    bomb = xref_stream_bomb(16_000_000, predictor)
    assert len(bomb) < 40_000
    tracemalloc.start()
    try:
        result, elapsed = timed(bomb)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert result is False
    # More entries than a file this small can hold objects for: refused before inflating.
    assert elapsed < 0.5 and peak < 5 * 1024 * 1024


def test_many_objects_validate_in_linear_time():
    data = objects_without_endobj(40_000)
    result, elapsed = timed(data)
    assert result is True  # structurally valid: every entry points at its object header
    assert elapsed < 2.0
    # Doubling the objects roughly doubles the work, it does not quadruple it.
    bigger, larger_elapsed = timed(objects_without_endobj(80_000))
    assert bigger is True and larger_elapsed < 4.0


def test_entry_budget_caps_declared_objects():
    assert not valid_content("application/pdf", objects_without_endobj(200_000))  # > 100 000


def deflated(chunk, repeat, tail=b"", head=b""):
    """zlib stream of head + chunk * repeat + tail, built without holding it in memory."""
    packer = zlib.compressobj(9)
    parts = [packer.compress(head)] + [packer.compress(chunk) for _ in range(repeat)]
    return b"".join(parts) + packer.compress(tail) + packer.flush()


def objstm_pdf(packed, first, count):
    """Root (object 1) compressed into object stream 3 whose content is `packed`."""
    out = bytearray(b"%PDF-1.5\n")
    objstm = len(out)
    out += (
        b"3 0 obj\n<< /Type /ObjStm /N %d /First %d /Filter /FlateDecode /Length %d >>\n"
        b"stream\n%s\nendstream\nendobj\n" % (count, first, len(packed), packed)
    )
    xref = len(out)
    rows = b"".join(
        bytes([kind]) + struct.pack(">H", field) + bytes([index])
        for kind, field, index in [(0, 0, 255), (2, 3, 0), (0, 0, 0), (1, objstm, 0), (1, xref, 0)]
    )
    out += (
        b"4 0 obj\n<< /Type /XRef /Size 5 /W [1 2 1] /Root 1 0 R /Length %d >>\nstream\n%s\n"
        b"endstream\nendobj\nstartxref\n%d\n%%%%EOF\n" % (len(rows), rows, xref)
    )
    return bytes(out)


def test_object_stream_header_bomb_is_rejected_cheaply():
    # 16 MiB of "1 1 1 ..." with /First just under it: a header no real N could need.
    size = 16 * 1024 * 1024
    bomb = objstm_pdf(deflated(b"1 " * 32768, size // 65536), size - 2, 4)
    assert len(bomb) < 40_000
    tracemalloc.start()
    try:
        result, elapsed = timed(bomb)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert result is False and elapsed < 0.5 and peak < 5 * 1024 * 1024


def test_object_stream_member_far_away_is_decoded_in_bounded_memory():
    # A valid header whose catalog sits behind 15 MiB of padding: only a window is kept.
    padding = 240 * 65536
    head = b"1 %d " % padding
    packed = deflated(b" " * 65536, 240, b"<< /Type /Catalog /Pages 2 0 R >>", head)
    data = objstm_pdf(packed, len(head), 1)
    tracemalloc.start()
    try:
        result, elapsed = timed(data)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert result is True and elapsed < 1.0 and peak < 5 * 1024 * 1024


def test_object_stream_header_must_name_the_member():
    member = b"<< /Type /Catalog >>"
    for head, count, ok in [
        (b"1 0 ", 1, True),
        (b"%comment\n1 0 ", 1, True),
        (b"2 0 ", 1, False),  # the catalog is not in this stream
        (b"2 0 1 5 ", 1, False),  # only N pairs are read
        (b"2 9 1 0 ", 2, False),  # offsets must increase
        (b"1 0 ", 10_000_000, False),  # more members than the file could hold
    ]:
        data = objstm_pdf(zlib.compress(head + member), len(head), count)
        assert valid_content("application/pdf", data) is ok, head


def test_empty_xref_subsections_count_toward_the_budget():
    good = pdf()
    xref = good.index(b"xref\n")
    padded = good[: xref + 5] + b"0 0\n" * 100_000 + good[xref + 5 :]
    result, elapsed = timed(padded)
    assert result is False and elapsed < 0.5


# --- every pattern and loop stays linear on hostile input (review round 4) ---------------------


@pytest.mark.parametrize(
    "head",
    [
        b" " * 64 + b"x",  # the reported case: a whitespace run that no integer follows
        b" " * 200 + b"x",
        b" " * 5000 + b"x",
        b"\n" * 60_000 + b"x",
        (b"%" + b"a" * 256 + b" ") * 8 + b"x",  # comments with no line end
        b"%" * 60_000,
        b"% " * 30_000,
        b"%\n" * 30_000 + b"x",  # one comment per line
        b"1" + b" " * 5000 + b"x",  # the run sits between the two integers of a pair
        b"1 %" + b" %" * 30_000,
    ],
)
def test_object_stream_header_without_integers_is_rejected_in_linear_time(head):
    data = objstm_pdf(zlib.compress(head + b"<< /Type /Catalog >>", 9), len(head), 1)
    assert len(data) < 2000
    result, elapsed = timed(data)
    assert result is False and elapsed < 0.5


def test_object_stream_header_allows_whitespace_and_a_few_comments():
    member = b"<< /Type /Catalog >>"
    for head, ok in [
        (b" " * 5000 + b"1 0 ", True),
        (b"1" + b"\r\n" * 2500 + b"0\n", True),
        (b"% qpdf-style comment\n1 0\n%% Object stream: object 1, index 0\n", True),
        (b"%a\r\n" * 200 + b"1 % between the pair\n 0 ", True),
        (b"%a\n" * 300 + b"1 0 ", False),  # more comments than any writer puts there
        (b"% 1 0 ", False),  # integers inside a comment are not a pair
        (b"12345678901 0 ", False),  # not an object number
    ]:
        data = objstm_pdf(zlib.compress(head + member), len(head), 1)
        assert valid_content("application/pdf", data) is ok, head


def test_filter_pattern_is_linear_on_a_whitespace_run():
    # `/Filter` followed by 60 000 spaces and no name: tried once, not once per split of the run.
    good = xref_stream_pdf()
    for junk in (b"/Filter" + b" " * 60_000 + b"x ", b"/Filter [" + b" " * 60_000 + b"x "):
        data = good.replace(b"/Root 1 0 R ", b"/Root 1 0 R /Junk << " + junk + b">> ")
        result, elapsed = timed(data)
        assert result is True and elapsed < 0.5  # the real /Filter comes later and still counts
        data = good.replace(b"/Filter /FlateDecode ", junk)
        result, elapsed = timed(data)
        assert result is False and elapsed < 0.5
    spaced = good.replace(b"/Filter /FlateDecode", b"/Filter\n[ /FlateDecode ]")
    assert valid_content("application/pdf", spaced)


def test_stream_length_pointing_at_a_whitespace_run_is_not_rescanned_per_section():
    # 16 cross-reference streams chained by /Prev; every /Length lands on the same 5 MiB run of
    # spaces, which is not followed by `endstream`, so each falls back to its own `endstream`.
    sections, lengths = 16, [0] * 16
    for _ in range(2):  # the second pass knows where the run starts
        out = bytearray(b"%PDF-1.5\n")
        catalog = len(out)
        out += b"1 0 obj\n<< /Type /Catalog >>\nendobj\n"
        rows = b"\x00" + bytes(4) + b"\xff" + b"\x01" + struct.pack(">I", catalog) + b"\x00"
        offsets, starts = [], []
        for index in range(sections):
            offsets.append(len(out))
            previous = b"/Prev %010d " % offsets[index - 1] if index else b""
            out += (
                b"%d 0 obj\n<< /Type /XRef /Size 2 /W [1 4 1] /Root 1 0 R %s/Length %010d >>\n"
                b"stream\n" % (index + 2, previous, lengths[index])
            )
            starts.append(len(out))
            out += rows + b"\nendstream\nendobj\n"
        lengths = [len(out) - start for start in starts]
    out += b" " * (5 * 1024 * 1024 - 8192) + b"x\nstartxref\n%d\n%%%%EOF\n" % offsets[-1]
    result, elapsed = timed(bytes(out))
    assert result is True and elapsed < 0.25


def test_stream_length_with_padding_before_endstream_is_accepted():
    good = xref_stream_pdf()
    for padding in (b"\r\n", b"\n" * 20, b" " * 200):
        assert valid_content(
            "application/pdf", good.replace(b"\nendstream", padding + b"endstream")
        )


def idat_png(width, height, depth, color, body):
    header = struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, 0)
    chunks = [chunk(b"IHDR", header), chunk(b"IDAT", body), chunk(b"IEND", b"")]
    return b"\x89PNG\r\n\x1a\n" + b"".join(chunks)


def test_png_inflation_does_not_recopy_the_rest_of_the_chunk():
    # 4000x4000 16-bit RGBA of zeros packs into ~125 KB; 4 MiB of junk follows it in the same
    # IDAT chunk. Inflating in small steps must not copy that junk once per step.
    row = bytes(1 + 4000 * 8)
    packer = zlib.compressobj(1)
    packed = b"".join(packer.compress(row) for _ in range(4000)) + packer.flush()
    assert len(packed) < 1024 * 1024
    result, elapsed = timed(idat_png(4000, 4000, 16, 6, packed), "image/png")
    assert result is True and elapsed < 1.0
    result, elapsed = timed(idat_png(4000, 4000, 16, 6, packed + b"j" * (4 << 20)), "image/png")
    assert result is False and elapsed < 0.3


def test_png_image_data_is_fed_in_slices_without_losing_the_stream_end():
    noise = bytes((index * 7919 + index // 251) % 256 for index in range(300 * 901))
    packed = zlib.compress(noise, 0)  # stored blocks: larger than one inflate step
    assert len(packed) > 4 * 64 * 1024
    assert valid_content("image/png", idat_png(300, 300, 8, 2, packed))
    header = chunk(b"IHDR", struct.pack(">IIBBBBB", 300, 300, 8, 2, 0, 0, 0))
    pieces = [packed[start : start + 100_000] for start in range(0, len(packed), 100_000)]

    def split(parts):
        chunks = [chunk(b"IDAT", part) for part in parts]
        return b"\x89PNG\r\n\x1a\n" + header + b"".join(chunks) + chunk(b"IEND", b"")

    assert valid_content("image/png", split(pieces))
    assert valid_content("image/png", split([*pieces, b""]))
    for bad in [
        idat_png(300, 300, 8, 2, packed + b"x"),  # data after the zlib stream, same slice
        idat_png(300, 300, 8, 2, packed + b"x" * 200_000),  # ... in a later slice
        split([*pieces, b"x"]),  # ... in a later chunk
        split(pieces[:-1]),  # truncated stream
        idat_png(300, 300, 8, 2, packed[:-1]),
    ]:
        assert not valid_content("image/png", bad)


def test_jpeg_fill_bytes_and_stuffed_scan_data_are_skipped_in_linear_time():
    good = jpeg()
    scan = good.index(b"\xff\xda")
    data_start = scan + 2 + int.from_bytes(good[scan + 2 : scan + 4], "big")
    size = 5 * 1024 * 1024
    for data in [
        good[:scan] + b"\xff" * size + good[scan:],  # fill bytes before a marker
        good[:data_start] + b"\xff" * size + good[-2:],  # fill bytes ending the scan
        good[:data_start] + b"\xff\x00" * (size // 2) + good[data_start:],  # stuffed bytes
        good[:data_start] + b"\xff\xd0" * (size // 2) + good[data_start:],  # restart markers
    ]:
        result, elapsed = timed(data, "image/jpeg")
        assert result is True and elapsed < 0.3
    for bad in [
        good[:scan] + b"\xff" * 64,  # fill bytes and then nothing
        good[:data_start] + b"\xff\x00" * 64,  # the scan never ends
        good[:data_start] + b"\xff" * 64,
        good[:data_start] + b"\x12\xff",
        good[:-2] + b"\xff\x00\xd9",  # a stuffed byte is not a marker
    ]:
        assert not valid_content("image/jpeg", bad)
    assert valid_content("image/jpeg", good[:-2] + b"\xff\xff\xff\xd9")
