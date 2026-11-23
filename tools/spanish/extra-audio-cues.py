#!/usr/bin/env python3
"""Attach verified extra listening cues to the 7692/1 resource map."""
import json
import sys
from pathlib import Path

# Specimen groups begin immediately before the spoken cue, after the identified
# recording title or the three long between-question silences. These boundaries
# correlate with the start points of official archive tracks 02, 23, 39 and 53.
SPECIMEN = [[2, 22, 9.924, 168.473], [23, 38, 168.473, 316.534],
            [39, 52, 316.534, 456.351], [53, 63, 456.351, None]]


# Autumn 2020 publishes one continuous audio file. Spoken question-number
# cues were independently recognized from the signal at 7.622, 121.222,
# 269.621 and 435.953 seconds. Cuts leave leading silence for each cue.
NOV20 = [[2, 13, 7.322, 120.922], [14, 23, 120.922, 269.321],
         [24, 39, 269.321, 435.653], [40, 61, 435.653, 596.000]]

CUES = {'SPECIMEN': SPECIMEN, 'NOV20': NOV20}


def add_cues(papers):
    for paper in papers:
        if paper['series'] not in CUES:
            continue
        for question, cue in zip(paper['questions'][:4], CUES[paper['series']], strict=True):
            first_track, last_track, start, end = cue
            audio = question['audio']
            audio['range'] = {'question': question['reference'], 'tracks': [first_track, last_track],
                              'from_seconds': start, 'to_seconds': end}
            audio['printed_track_range'] = [first_track, last_track]
            fragment = f'{start},{end}' if end is not None else str(start)
            audio['segment_url'] = f"{audio['url']}#t={fragment}"
    return papers


if __name__ == '__main__':
    print(json.dumps(add_cues(json.loads(Path(sys.argv[1]).read_text())), indent=2) + '\n', end='')
