#!/usr/bin/env python3
"""Update only Business aliases, preserving every other subject's migrations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / 'js/config/spec-id-migrations.js'
text = path.read_text()
start, end = text.index('{'), text.rindex('}') + 1
existing = json.loads(text[start:end])
merged = {k: v for k, v in existing.items() if not k.startswith('OCR_L3BUS_')}
merged.update(json.loads((ROOT / 'data/specs/OCR_L3_BUS_CTEC.json').read_text())['legacy_ids'])
path.write_text(text[:start] + json.dumps(merged, indent=2) + text[end:])
print(f'{len(merged)} migration aliases; only OCR_L3BUS entries updated')
