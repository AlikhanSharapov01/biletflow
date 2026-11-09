"""Exact order arithmetic in integer KZT minor units. No database access."""

from typing import NamedTuple

# Proposed demonstration default (3%), saved on every order; not a provider tariff.
PROCESSING_RATE_BPS = 300


class Line(NamedTuple):
    face: int
    discount: int
    fee: int
    eligible: bool = False

    @property
    def paid(self):
        return self.face - self.discount


def split(total, weights):
    """Divide total in proportion to weights; the remainder goes to the largest fractions."""
    whole = sum(weights)
    if not whole:
        return [0] * len(weights)
    shares = [weight * total for weight in weights]
    parts = [share // whole for share in shares]
    leftover = total - sum(parts)
    for index in sorted(range(len(parts)), key=lambda i: (-(shares[i] % whole), i))[:leftover]:
        parts[index] += 1
    return parts


def round_bps(amount, bps):
    return (amount * bps + 5000) // 10000


def discounts(faces, eligible, snapshot):
    """Percentage applies per eligible line; a fixed amount applies once, capped and split."""
    if snapshot is None:
        return [0] * len(faces)
    if snapshot["discount_kind"] == "percentage":
        bps = snapshot["percentage_bps"]
        return [round_bps(face, bps) if ok else 0 for face, ok in zip(faces, eligible, strict=True)]
    weights = [face if ok else 0 for face, ok in zip(faces, eligible, strict=True)]
    return split(min(snapshot["fixed_minor"], sum(weights)), weights)


def is_eligible(type_id, face, snapshot):
    if snapshot is None or face == 0:
        return False
    return snapshot["all_ticket_types"] or str(type_id) in snapshot["ticket_type_ids"]


def hold_quote(types, allocations, snapshot=None, rate_bps=PROCESSING_RATE_BPS):
    """Totals and one Line per allocation, in allocation order so hold and order agree."""
    faces = [types[row.ticket_type_id].price_minor for row in allocations]
    eligible = [
        is_eligible(row.ticket_type_id, face, snapshot)
        for row, face in zip(allocations, faces, strict=True)
    ]
    off = discounts(faces, eligible, snapshot)
    gross, discount = sum(faces), sum(off)
    subtotal = gross - discount
    # The processing fee is rounded once for the order, on what is actually collected.
    fee = round_bps(subtotal, rate_bps)
    fees = split(fee, [face - cut for face, cut in zip(faces, off, strict=True)])
    lines = [
        Line(face, cut, item_fee, ok)
        for face, cut, item_fee, ok in zip(faces, off, fees, eligible, strict=True)
    ]
    return {"gross": gross, "discount": discount, "subtotal": subtotal, "fee": fee}, lines


def quote(types, allocations, data, rate_bps=PROCESSING_RATE_BPS, snapshot=None):
    """hold_quote with the lines reordered to the buyer's recipient order."""
    totals, lines = hold_quote(types, allocations, snapshot, rate_bps)
    by_allocation = {row.id: line for row, line in zip(allocations, lines, strict=True)}
    return totals, [by_allocation[row.allocation_id] for row in data.recipients]
