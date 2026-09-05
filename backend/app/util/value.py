"""Rough dollar value of a submission, for ranking clients and reporting.

Budget ranges arrive as free text from the intake form and the team's
settings ("$5k - $15k", "Under $5k", "$12,000", "5k-15k", "Not sure yet"),
so this parses whatever numbers it can find: a range counts as its midpoint,
"under X" as half of X, a single amount (or "X+") as itself, and no number
as zero. When the team has priced a proposal, that price wins.
"""
from __future__ import annotations

import re

_AMOUNT = re.compile(r'(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?')


def estimate_budget(text) -> float:
    if not text:
        return 0.0

    amounts = []
    for digits, suffix in _AMOUNT.findall(text):
        value = float(digits.replace(',', ''))
        if suffix.lower() == 'k':
            value *= 1_000
        elif suffix.lower() == 'm':
            value *= 1_000_000
        amounts.append(value)

    if not amounts:
        return 0.0
    if len(amounts) >= 2:
        return (amounts[0] + amounts[1]) / 2

    lowered = text.lower()
    if 'under' in lowered or 'less than' in lowered or lowered.lstrip().startswith('<'):
        return amounts[0] / 2
    return amounts[0]


def submission_value(submission) -> float:
    proposal = submission.proposal
    if proposal and proposal.price and float(proposal.price) > 0:
        return float(proposal.price)
    return estimate_budget(submission.budget_range)
