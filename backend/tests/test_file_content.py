"""Structural PNG/JPEG/PDF validation for support attachments (#75; BF-16).

The builders here are shared with the support attachment tests: they produce real, decodable
files (PNG/JPEG through Pillow, PDF written by hand with exact cross-reference offsets).
"""

import struct
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
