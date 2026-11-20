#!/usr/bin/env python3
"""Reviewed own crops and minimum contexts for GCSE parts the automatic tools could not place.

refine.py keeps the build's crops for questions with irregular printed labels ("8 (a)" on one
line, "(i)" before "(b)"), so their parts kept the build's "Original question information and
preceding context" image: every earlier part with its answer lines and marks, which made an
unselected sibling look like the task (audit 2026-11-19).

CONTEXTS lists, for each part, the pixel rows of its question's Qnn_full.webp that it needs:
the question introduction, its letter's lead-in, and an earlier figure or table only where
its wording uses it. Each was chosen by reading the rendered question. An empty list means
the part's own crop is complete. Pixels are cut from the published render, never redrawn.
The full question stays available behind "Show full question for context".

    python3 tools/parts/manual-contexts.py [--dry-run]
"""
import argparse, base64, hashlib, io, json, re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GAP = 12

# question id -> {unit tag: context rows} in that question's Qnn_full.webp; rows are
# [first_row, end_row) pairs. {'own': rows, 'context': rows} also replaces the part's own
# crop where the build crop started inside an earlier part.
# The 13 GCSE science questions refine.py left as "scheme_only" (61 parts), audit 2026-11-20.
# Rows were proposed from the printed part labels (tesseract word boxes, positioning only) and
# every part was then checked by eye against the rendered question; own crops stop at the next
# part's label or the question total, never in the booklet pages after the paper. Overrides
# made on review: 1PH0 Nov 2020 1F Q7 (c)/(d) (the "*(d)" label was not read); 1H Q8 (b)/(c);
# 1H Q9 (c) and 1SC0 1PH Q6 (c) get the (a) lead-in because they use Figure 12; the 1PH0 June
# 2022 (a)(ii) items "1." and "2." are split, item 2 keeping the (ii) lead-in.
# Then the 82 refined questions recut-from-full.py could not prove (audit 2026-11-20): their
# crops are cut from rows found the same way (line-by-line label reading; Maths lead-ins and
# figures printed between a part's marks and the next label go to the next part's context;
# fraction numerators and exponents above a label line stay with their part), each reviewed by
# eye. Overrides on review: 1PH0 June 2024 1H Q7(a)(iii) gets the (a)(ii) "show that" value;
# 1PH0 June 2024 2F Q7(c) gets Figure 19a from (b)(ii); 1MA1 June 2023 1H Q14 and Nov 2024 1H
# Q10 boundaries around exponents; 1MA1 June 2024 1H Q2(b) gets Kevin's working. A part that
# depends on an earlier one also shows that part's rows.
CONTEXTS = {
    'EDX_1BI0_2020_NOVEMBER_1F_Q10': {
        'U01': {'own': [(677, 907)], 'context': [(0, 96), (96, 677)]},
        'U02': {'own': [(907, 1094)], 'context': [(0, 96), (96, 677)]},
        'U03': {'own': [(1232, 1750)], 'context': [(0, 96), (1094, 1232)]},
        'U04': {'own': [(1750, 1853)], 'context': [(0, 96), (1094, 1232)]},
        'U05': {'own': [(1853, 2207)], 'context': [(0, 96)]},
    },
    'EDX_1BI0_2020_NOVEMBER_1H_Q04': {
        'U01': {'own': [(677, 907)], 'context': [(0, 96), (96, 677)]},
        'U02': {'own': [(907, 1094)], 'context': [(0, 96), (96, 677)]},
        'U03': {'own': [(1232, 1750)], 'context': [(0, 96), (1094, 1232)]},
        'U04': {'own': [(1750, 1853)], 'context': [(0, 96), (1094, 1232)]},
        'U05': {'own': [(1853, 2207)], 'context': [(0, 96)]},
    },
    'EDX_1BI0_2020_NOVEMBER_1H_Q06': {
        'U01': {'own': [(552, 748)], 'context': [(36, 552)]},
        'U02': {'own': [(748, 912)], 'context': [(36, 552)]},
        'U03': {'own': [(912, 1162)], 'context': [(36, 552)]},
        'U04': {'own': [(1162, 1305)], 'context': []},
        'U05': {'own': [(1305, 1703)], 'context': []},
    },
    'EDX_1BI0_2022_JUNE_1F_Q07': {
        'U01': {'own': [(528, 755)], 'context': [(0, 490), (490, 528)]},
        'U02': {'own': [(755, 858)], 'context': [(0, 490), (490, 528)]},
        'U03': {'own': [(858, 984)], 'context': [(0, 490)]},
        'U04': {'own': [(984, 2061)], 'context': [(0, 490)]},
    },
    'EDX_1BI0_2024_JUNE_2F_Q04': {
        'U01': {'own': [(74, 522)], 'context': [(0, 74)]},
        'U02': {'own': [(522, 718)], 'context': [(0, 74)]},
        'U03': {'own': [(756, 987)], 'context': [(0, 74), (718, 756)]},
        'U04': {'own': [(987, 1091)], 'context': [(0, 74), (718, 756)]},
        'U05': {'own': [(1091, 1198)], 'context': [(0, 74), (718, 756)]},
        'U06': {'own': [(1623, 1872)], 'context': [(0, 74), (1198, 1623)]},
        'U07': {'own': [(1872, 1998)], 'context': [(0, 74), (1198, 1623)]},
        'U08': {'own': [(1998, 2325)], 'context': [(0, 74)]},
    },
    'EDX_1CH0_2020_NOVEMBER_1F_Q07': {
        'U01': {'own': [(74, 506)], 'context': [(35, 74)]},
        'U02': {'own': [(506, 1038)], 'context': [(35, 74)]},
        'U03': {'own': [(1038, 1306)], 'context': [(35, 74)]},
        'U04': {'own': [(1306, 1410)], 'context': []},
        'U05': {'own': [(1410, 1611)], 'context': []},
    },
    'EDX_1CH0_2020_NOVEMBER_1H_Q07': {
        'U01': {'own': [(204, 512)], 'context': [(35, 204)]},
        'U02': {'own': [(512, 1167)], 'context': [(35, 204)]},
        'U03': {'own': [(1167, 1375)], 'context': []},
    },
    'EDX_1CH0_2020_NOVEMBER_1H_Q08': {
        'U01': {'own': [(96, 410)], 'context': [(35, 96)]},
        'U02': {'own': [(410, 817)], 'context': [(35, 96)]},
        'U03': {'own': [(856, 1029)], 'context': [(817, 856)]},
        'U04': {'own': [(1029, 1216)], 'context': [(817, 856)]},
        'U05': {'own': [(1216, 1663)], 'context': []},
    },
    'EDX_1CH0_2022_JUNE_1F_Q05': {
        'U01': {'own': [(35, 315)], 'context': []},
        'U02': {'own': [(315, 856)], 'context': []},
        'U03': {'own': [(917, 1113)], 'context': [(856, 917)]},
        'U04': {'own': [(1113, 1814)], 'context': [(856, 917)]},
    },
    'EDX_1CH0_2022_JUNE_2F_Q08': {
        'U01': {'own': [(914, 1255)], 'context': [(0, 395), (395, 914)]},
        'U02': {'own': [(1255, 1571)], 'context': [(0, 395), (395, 914)]},
        'U03': {'own': [(1571, 1767)], 'context': [(0, 395), (395, 914)]},
        'U04': {'own': [(1844, 1970)], 'context': [(0, 395), (1767, 1844)]},
        'U05': {'own': [(1970, 2271)], 'context': [(0, 395), (1767, 1844)]},
        'U06': {'own': [(2271, 2618)], 'context': [(0, 395)]},
    },
    'EDX_1CH0_2022_JUNE_2H_Q02': {
        'U01': {'own': [(914, 1255)], 'context': [(0, 395), (395, 914)]},
        'U02': {'own': [(1255, 1571)], 'context': [(0, 395), (395, 914)]},
        'U03': {'own': [(1571, 1767)], 'context': [(0, 395), (395, 914)]},
        'U04': {'own': [(1844, 1970)], 'context': [(0, 395), (1767, 1844)]},
        'U05': {'own': [(1970, 2301)], 'context': [(0, 395), (1767, 1844)]},
    },
    'EDX_1CH0_2023_JUNE_1F_Q06': {
        'U01': {'own': [(74, 195)], 'context': [(36, 74)]},
        'U02': {'own': [(195, 450)], 'context': [(36, 74)]},
        'U03': {'own': [(450, 638)], 'context': []},
        'U04': {'own': [(638, 802)], 'context': []},
        'U05': {'own': [(802, 1404)], 'context': []},
        'U06': {'own': [(1404, 2381)], 'context': []},
    },
    'EDX_1CH0_2023_JUNE_2H_Q03': {
        'U01': {'own': [(427, 707)], 'context': [(0, 427)]},
        'U02': {'own': [(707, 1007)], 'context': [(0, 427)]},
        'U03': {'own': [(1007, 1212)], 'context': [(0, 427)]},
        'U04': {'own': [(1272, 1520)], 'context': [(0, 427), (1212, 1272)]},
        'U05': {'own': [(1520, 1989)], 'context': [(0, 427), (1212, 1272)]},
    },
    'EDX_1CH0_2023_JUNE_2H_Q04': {
        'U01': {'own': [(35, 336)], 'context': []},
        'U02': {'own': [(644, 867)], 'context': [(336, 644)]},
        'U03': {'own': [(867, 1256)], 'context': [(336, 644)]},
        'U04': {'own': [(1459, 1803)], 'context': [(1256, 1459)]},
        'U05': {'own': [(1803, 2303)], 'context': [(1256, 1459)]},
    },
    'EDX_1CH0_2023_JUNE_2H_Q06': {
        'U01': {'own': [(1226, 1446)], 'context': [(0, 609), (609, 1226)]},
        'U02': {'own': [(1446, 1788)], 'context': [(0, 609), (609, 1226)]},
        'U03': {'own': [(1788, 1946)], 'context': [(0, 609)]},
        'U04': {'own': [(1946, 2194)], 'context': [(0, 609)]},
        'U05': {'own': [(2194, 2390)], 'context': [(0, 609)]},
    },
    'EDX_1CH0_2025_JUNE_1F_Q03': {
        'U01': {'own': [(277, 511)], 'context': [(81, 277)]},
        'U02': {'own': [(511, 1398)], 'context': [(81, 277)]},
        'U03': {'own': [(1985, 2098)], 'context': [(1398, 1985)]},
        'U04': {'own': [(2098, 2715)], 'context': [(1398, 1985)]},
        'U05': {'own': [(3264, 3400)], 'context': [(2715, 3264)]},
        'U06': {'own': [(3400, 3882)], 'context': [(2715, 3264)]},
    },
    'EDX_1MA1_2019_JUNE_1F_Q14': {
        'U01': {'own': [(17, 252)], 'context': []},
        'U02': {'own': [(463, 688)], 'context': [(252, 463)]},
    },
    'EDX_1MA1_2019_JUNE_1F_Q19': {
        'U01': {'own': [(38, 354)], 'context': []},
        'U02': {'own': [(354, 755)], 'context': []},
    },
    'EDX_1MA1_2019_JUNE_1H_Q18': {
        'U01': {'own': [(36, 438)], 'context': []},
        'U02': {'own': [(438, 1025)], 'context': []},
    },
    'EDX_1MA1_2019_JUNE_2F_Q08': {
        'U01': {'own': [(22, 195)], 'context': []},
        'U02': {'own': [(195, 352)], 'context': []},
        'U03': {'own': [(352, 660)], 'context': []},
    },
    'EDX_1MA1_2019_JUNE_2H_Q20': {
        'U01': {'own': [(348, 502)], 'context': [(0, 348)]},
        'U02': {'own': [(586, 1156)], 'context': [(0, 348), (502, 586)]},
    },
    'EDX_1MA1_2019_JUNE_3H_Q18': {
        'U01': {'own': [(34, 642)], 'context': []},
        'U02': {'own': [(642, 1201)], 'context': []},
    },
    'EDX_1MA1_2020_NOVEMBER_1H_Q11': {
        'U01': {'own': [(39, 386)], 'context': []},
        'U02': {'own': [(386, 660)], 'context': []},
        'U03': {'own': [(660, 1105)], 'context': []},
    },
    'EDX_1MA1_2020_NOVEMBER_2H_Q10': {
        'U01': {'own': [(38, 223)], 'context': []},
        'U02': {'own': [(223, 417)], 'context': []},
        'U03': {'own': [(417, 644)], 'context': []},
    },
    'EDX_1MA1_2020_NOVEMBER_2H_Q20': {
        'U01': {'own': [(224, 548)], 'context': [(0, 224)]},
        'U02': {'own': [(548, 1409)], 'context': [(0, 224)]},
    },
    'EDX_1MA1_2020_NOVEMBER_3F_Q09': {
        'U01': {'own': [(36, 267)], 'context': []},
        'U02': {'own': [(267, 500)], 'context': []},
        'U03': {'own': [(500, 704)], 'context': []},
    },
    'EDX_1MA1_2020_NOVEMBER_3F_Q23': {
        'U01': {'own': [(34, 197)], 'context': []},
        'U02': {'own': [(197, 509)], 'context': []},
        'U03': {'own': [(509, 859)], 'context': []},
    },
    'EDX_1MA1_2020_NOVEMBER_3H_Q01': {
        'U01': {'own': [(165, 328)], 'context': [(0, 165)]},
        'U02': {'own': [(328, 638)], 'context': [(0, 165)]},
        'U03': {'own': [(638, 970)], 'context': [(0, 165)]},
    },
    'EDX_1MA1_2020_NOVEMBER_3H_Q12': {
        'U01': {'own': [(40, 612)], 'context': []},
        'U02': {'own': [(612, 1197)], 'context': []},
    },
    'EDX_1MA1_2021_NOVEMBER_2F_Q12': {
        'U01': {'own': [(38, 362)], 'context': []},
        'U02': {'own': [(362, 524)], 'context': [(38, 362)]},
    },
    'EDX_1MA1_2022_JUNE_1F_Q12': {
        'U01': {'own': [(40, 351)], 'context': []},
        'U02': {'own': [(351, 805)], 'context': []},
    },
    'EDX_1MA1_2022_JUNE_2F_Q14': {
        'U01': {'own': [(191, 295)], 'context': [(0, 191)]},
        'U02': {'own': [(295, 385)], 'context': [(0, 191)]},
    },
    'EDX_1MA1_2022_JUNE_3F_Q17': {
        'U01': {'own': [(20, 148)], 'context': []},
        'U02': {'own': [(148, 392)], 'context': []},
        'U03': {'own': [(392, 594)], 'context': []},
    },
    'EDX_1MA1_2022_JUNE_3H_Q09': {
        'U01': {'own': [(44, 595)], 'context': []},
        'U02': {'own': [(721, 947)], 'context': [(595, 721)]},
    },
    'EDX_1MA1_2022_JUNE_3H_Q17': {
        'U01': {'own': [(363, 1078)], 'context': [(0, 363)]},
        'U02': {'own': [(1876, 2287)], 'context': [(0, 363), (1078, 1876)]},
    },
    'EDX_1MA1_2022_NOVEMBER_1F_Q20': {
        'U01': {'own': [(40, 426)], 'context': []},
        'U02': {'own': [(426, 890)], 'context': []},
    },
    'EDX_1MA1_2022_NOVEMBER_1F_Q26': {
        'U01': {'own': [(43, 518)], 'context': []},
        'U02': {'own': [(518, 900)], 'context': []},
    },
    'EDX_1MA1_2022_NOVEMBER_1H_Q02': {
        'U01': {'own': [(40, 426)], 'context': []},
        'U02': {'own': [(426, 890)], 'context': []},
    },
    'EDX_1MA1_2022_NOVEMBER_2F_Q12': {
        'U01': {'own': [(40, 249)], 'context': []},
        'U02': {'own': [(249, 707)], 'context': []},
    },
    'EDX_1MA1_2022_NOVEMBER_3F_Q17': {
        'U01': {'own': [(35, 185)], 'context': []},
        'U02': {'own': [(185, 505)], 'context': []},
    },
    'EDX_1MA1_2022_NOVEMBER_3F_Q29': {
        'U01': {'own': [(36, 230)], 'context': []},
        'U02': {'own': [(230, 776)], 'context': []},
    },
    'EDX_1MA1_2022_NOVEMBER_3H_Q09': {
        'U01': {'own': [(36, 230)], 'context': []},
        'U02': {'own': [(230, 776)], 'context': []},
    },
    'EDX_1MA1_2023_JUNE_1F_Q13': {
        'U01': {'own': [(7, 187)], 'context': []},
        'U02': {'own': [(187, 431)], 'context': []},
        'U03': {'own': [(431, 612)], 'context': []},
    },
    'EDX_1MA1_2023_JUNE_1H_Q14': {
        'U01': {'own': [(7, 226)], 'context': []},
        'U02': {'own': [(226, 715)], 'context': []},
    },
    'EDX_1MA1_2023_JUNE_2F_Q20': {
        'U01': {'own': [(39, 348)], 'context': []},
        'U02': {'own': [(348, 596)], 'context': []},
    },
    'EDX_1MA1_2023_JUNE_2H_Q01': {
        'U01': {'own': [(155, 463)], 'context': [(0, 155)]},
        'U02': {'own': [(463, 712)], 'context': [(0, 155)]},
    },
    'EDX_1MA1_2023_NOVEMBER_1F_Q19': {
        'U01': {'own': [(32, 186)], 'context': []},
        'U02': {'own': [(186, 366)], 'context': []},
        'U03': {'own': [(366, 677)], 'context': []},
    },
    'EDX_1MA1_2023_NOVEMBER_1H_Q02': {
        'U01': {'own': [(35, 183)], 'context': []},
        'U02': {'own': [(183, 366)], 'context': []},
        'U03': {'own': [(366, 677)], 'context': []},
    },
    'EDX_1MA1_2023_NOVEMBER_2F_Q18': {
        'U01': {'own': [(40, 460)], 'context': []},
        'U02': {'own': [(460, 641)], 'context': [(40, 460)]},
    },
    'EDX_1MA1_2023_NOVEMBER_2H_Q17': {
        'U01': {'own': [(34, 240)], 'context': []},
        'U02': {'own': [(240, 538)], 'context': []},
        'U03': {'own': [(538, 1128)], 'context': []},
    },
    'EDX_1MA1_2023_NOVEMBER_3H_Q18': {
        'U01': {'own': [(690, 789)], 'context': [(0, 690)]},
        'U02': {'own': [(899, 1202)], 'context': [(0, 690), (789, 899)]},
    },
    'EDX_1MA1_2024_JUNE_1F_Q21': {
        'U01': {'own': [(40, 528)], 'context': []},
        'U02': {'own': [(890, 1112)], 'context': [(528, 890)]},
    },
    'EDX_1MA1_2024_JUNE_1H_Q02': {
        'U01': {'own': [(40, 528)], 'context': []},
        'U02': {'own': [(890, 1112)], 'context': [(528, 890)]},
    },
    'EDX_1MA1_2024_JUNE_1H_Q12': {
        'U01': {'own': [(811, 917)], 'context': [(0, 811)]},
        'U02': {'own': [(917, 1027)], 'context': [(0, 811)]},
        'U03': {'own': [(1027, 1172)], 'context': [(0, 811)]},
    },
    'EDX_1MA1_2024_JUNE_1H_Q17': {
        'U01': {'own': [(7, 255)], 'context': []},
        'U02': {'own': [(255, 594)], 'context': []},
    },
    'EDX_1MA1_2024_JUNE_2F_Q19': {
        'U01': {'own': [(0, 406)], 'context': []},
        'U02': {'own': [(406, 539)], 'context': [(0, 406)]},
    },
    'EDX_1MA1_2024_JUNE_2H_Q19': {
        'U01': {'own': [(451, 957)], 'context': [(0, 451)]},
        'U02': {'own': [(957, 1202)], 'context': [(0, 451)]},
    },
    'EDX_1MA1_2024_JUNE_3H_Q15': {
        'U01': {'own': [(41, 354)], 'context': []},
        'U02': {'own': [(354, 670)], 'context': []},
        'U03': {'own': [(670, 1201)], 'context': []},
    },
    'EDX_1MA1_2024_NOVEMBER_1F_Q20': {
        'U01': {'own': [(40, 570)], 'context': []},
        'U02': {'own': [(570, 1149)], 'context': []},
    },
    'EDX_1MA1_2024_NOVEMBER_1H_Q03': {
        'U01': {'own': [(40, 570)], 'context': []},
        'U02': {'own': [(570, 1149)], 'context': []},
    },
    'EDX_1MA1_2024_NOVEMBER_1H_Q10': {
        'U01': {'own': [(7, 227)], 'context': []},
        'U02': {'own': [(227, 624)], 'context': []},
    },
    'EDX_1MA1_2024_NOVEMBER_1H_Q16': {
        'U01': {'own': [(40, 385)], 'context': []},
        'U02': {'own': [(385, 1196)], 'context': []},
    },
    'EDX_1MA1_2025_JUNE_1F_Q11': {
        'U01': {'own': [(7, 315)], 'context': []},
        'U02': {'own': [(315, 617)], 'context': []},
    },
    'EDX_1MA1_2025_JUNE_1H_Q07': {
        'U01': {'own': [(39, 238)], 'context': []},
        'U02': {'own': [(238, 715)], 'context': []},
        'U03': {'own': [(715, 1138)], 'context': []},
    },
    'EDX_1MA1_2025_JUNE_1H_Q09': {
        'U01': {'own': [(800, 986)], 'context': [(0, 800)]},
        'U02': {'own': [(1771, 1879)], 'context': [(0, 800), (986, 1771)]},
    },
    'EDX_1MA1_2025_JUNE_1H_Q16': {
        'U01': {'own': [(40, 292)], 'context': []},
        'U02': {'own': [(360, 940)], 'context': [(292, 360)]},
    },
    'EDX_1PH0_2020_NOVEMBER_1F_Q07': {
        'U01': {'own': [(35, 372)], 'context': []},
        'U02': {'own': [(372, 735)], 'context': []},
        'U03': {'own': [(734, 966)], 'context': []},
        'U04': {'own': [(1013, 1873)], 'context': []},
    },
    'EDX_1PH0_2020_NOVEMBER_1F_Q09': {
        'U01': {'own': [(35, 273)], 'context': []},
        'U02': {'own': [(273, 513)], 'context': []},
        'U03': {'own': [(513, 969)], 'context': []},
        'U04': {'own': [(969, 1988)], 'context': []},
        'U05': {'own': [(1988, 2908)], 'context': []},
    },
    'EDX_1PH0_2020_NOVEMBER_1H_Q08': {
        'U01': {'own': [(35, 1078)], 'context': []},
        'U02': {'own': [(1076, 1604)], 'context': []},
        'U03': {'own': [(1604, 2674)], 'context': []},
    },
    'EDX_1PH0_2020_NOVEMBER_1H_Q09': {
        'U01': {'own': [(483, 812)], 'context': [(35, 483)]},
        'U02': {'own': [(812, 1133)], 'context': [(35, 483)]},
        'U03': {'own': [(1133, 2205)], 'context': []},
        'U04': {'own': [(2205, 2800)], 'context': [(35, 483)]},
    },
    'EDX_1PH0_2021_NOVEMBER_1F_Q07': {
        'U01': {'own': [(74, 412)], 'context': [(0, 74)]},
        'U02': {'own': [(949, 1193)], 'context': [(0, 74), (412, 949)]},
        'U03': {'own': [(1193, 1621)], 'context': [(0, 74), (412, 949)]},
        'U04': {'own': [(1910, 2171)], 'context': [(0, 74), (1621, 1910)]},
        'U05': {'own': [(2171, 2591)], 'context': [(0, 74), (1621, 1910)]},
        'U06': {'own': [(2591, 3677)], 'context': [(0, 74)]},
    },
    'EDX_1PH0_2021_NOVEMBER_1F_Q10': {
        'U01': {'own': [(182, 409)], 'context': [(0, 182)]},
        'U02': {'own': [(409, 717)], 'context': [(0, 182)]},
        'U03': {'own': [(717, 1017)], 'context': [(0, 182)]},
        'U04': {'own': [(1565, 1683)], 'context': [(0, 182), (1017, 1565)]},
        'U05': {'own': [(1683, 2071)], 'context': [(0, 182), (1017, 1565)]},
        'U06': {'own': [(2071, 2403)], 'context': [(0, 182), (1017, 1565)]},
    },
    'EDX_1PH0_2021_NOVEMBER_2H_Q10': {
        'U01': {'own': [(189, 535)], 'context': [(35, 189)]},
        'U02': {'own': [(535, 1039)], 'context': [(35, 189)]},
        'U03': {'own': [(1039, 2557)], 'context': []},
    },
    'EDX_1PH0_2022_JUNE_1F_Q10': {
        'U01': {'own': [(211, 449)], 'context': [(35, 211)]},
        'U02': {'own': [(449, 684)], 'context': [(35, 211)]},
        'U03': {'own': [(684, 842)], 'context': [(35, 211), (449, 526)]},
        'U04': {'own': [(842, 945)], 'context': [(35, 211)]},
        'U05': {'own': [(1440, 1566)], 'context': [(945, 1440)]},
        'U06': {'own': [(1566, 1982)], 'context': [(945, 1440)]},
        'U07': {'own': [(1982, 2403)], 'context': [(945, 1440)]},
    },
    'EDX_1PH0_2022_JUNE_1H_Q04': {
        'U01': {'own': [(211, 449)], 'context': [(35, 211)]},
        'U02': {'own': [(449, 684)], 'context': [(35, 211)]},
        'U03': {'own': [(684, 842)], 'context': [(35, 211), (449, 526)]},
        'U04': {'own': [(842, 945)], 'context': [(35, 211)]},
        'U05': {'own': [(1440, 1566)], 'context': [(945, 1440)]},
        'U06': {'own': [(1566, 1982)], 'context': [(945, 1440)]},
        'U07': {'own': [(1982, 2403)], 'context': [(945, 1440)]},
    },
    'EDX_1PH0_2023_JUNE_2H_Q10': {
        'U01': {'own': [(1172, 1504)], 'context': [(35, 1172)]},
        'U02': {'own': [(1504, 1706)], 'context': [(35, 1172)]},
        'U03': {'own': [(1706, 2594)], 'context': []},
        'U04': {'own': [(2594, 3666)], 'context': []},
    },
    'EDX_1PH0_2024_JUNE_1H_Q07': {
        'U01': {'own': [(590, 770)], 'context': [(35, 590)]},
        'U02': {'own': [(770, 1278)], 'context': [(35, 590)]},
        'U03': {'own': [(1278, 1541)], 'context': [(35, 590), (770, 1278)]},
        'U04': {'own': [(1541, 1961)], 'context': []},
        'U05': {'own': [(2678, 2857)], 'context': [(1961, 2678)]},
        'U06': {'own': [(2857, 3210)], 'context': [(1961, 2678)]},
        'U07': {'own': [(3210, 3410)], 'context': [(1961, 2678)]},
    },
    'EDX_1PH0_2024_JUNE_2F_Q05': {
        'U01': {'own': [(290, 700)], 'context': [(36, 290)]},
        'U02': {'own': [(700, 842)], 'context': [(36, 290)]},
        'U03': {'own': [(842, 1092)], 'context': []},
        'U04': {'own': [(2151, 2250)], 'context': [(1092, 2151)]},
        'U05': {'own': [(2250, 2680)], 'context': [(1092, 2151)]},
    },
    'EDX_1PH0_2024_JUNE_2F_Q07': {
        'U01': {'own': [(1179, 1317)], 'context': [(35, 1179)]},
        'U02': {'own': [(1317, 1377)], 'context': [(35, 1179)]},
        'U03': {'own': [(1377, 1505)], 'context': [(35, 1179)]},
        'U04': {'own': [(1505, 1804)], 'context': [(35, 1179)]},
        'U05': {'own': [(1804, 2186)], 'context': []},
        'U06': {'own': [(2186, 3191)], 'context': []},
        'U07': {'own': [(3191, 4287)], 'context': [(2186, 3191)]},
    },
    'EDX_1PH0_2025_JUNE_1F_Q05': {
        'U01': {'own': [(35, 261)], 'context': []},
        'U02': {'own': [(261, 540)], 'context': []},
        'U03': {'own': [(1012, 1177)], 'context': [(540, 1012)]},
        'U04': {'own': [(1177, 1597)], 'context': [(540, 1012)]},
        'U05': {'own': [(1597, 1876)], 'context': [(540, 1012)]},
    },
    'EDX_1PH0_2025_JUNE_1H_Q07': {
        'U01': {'own': [(35, 344)], 'context': []},
        'U02': {'own': [(344, 495)], 'context': []},
        'U03': {'own': [(495, 599)], 'context': []},
        'U04': {'own': [(599, 1438)], 'context': []},
        'U05': {'own': [(1438, 2046)], 'context': []},
    },
    'EDX_1SC0_2020_NOVEMBER_1CH_Q05': {
        'U01': {'own': [(96, 410)], 'context': [(35, 96)]},
        'U02': {'own': [(410, 817)], 'context': [(35, 96)]},
        'U03': {'own': [(856, 1029)], 'context': [(817, 856)]},
        'U04': {'own': [(1029, 1216)], 'context': [(817, 856)]},
        'U05': {'own': [(1216, 1663)], 'context': []},
    },
    'EDX_1SC0_2020_NOVEMBER_1PF_Q06': {
        'U01': {'own': [(35, 273)], 'context': []},
        'U02': {'own': [(273, 513)], 'context': []},
        'U03': {'own': [(513, 969)], 'context': []},
        'U04': {'own': [(969, 1988)], 'context': []},
        'U05': {'own': [(1988, 2908)], 'context': []},
    },
    'EDX_1SC0_2020_NOVEMBER_1PH_Q06': {
        'U01': {'own': [(483, 812)], 'context': [(35, 483)]},
        'U02': {'own': [(812, 1133)], 'context': [(35, 483)]},
        'U03': {'own': [(1133, 2205)], 'context': []},
        'U04': {'own': [(2205, 2800)], 'context': [(35, 483)]},
    },
    'EDX_1SC0_2021_NOVEMBER_2CH_Q06': {
        'U01': {'own': [(134, 399)], 'context': [(0, 74), (74, 134)]},
        'U02': {'own': [(399, 639)], 'context': [(0, 74), (74, 134)]},
        'U03': {'own': [(639, 876)], 'context': [(0, 74)]},
        'U04': {'own': [(876, 1890)], 'context': [(0, 74)]},
        'U05': {'own': [(1890, 2487)], 'context': [(0, 74)]},
    },
    'EDX_1SC0_2022_JUNE_1CF_Q03': {
        'U01': {'own': [(35, 315)], 'context': []},
        'U02': {'own': [(315, 857)], 'context': []},
        'U03': {'own': [(917, 1113)], 'context': [(857, 917)]},
        'U04': {'own': [(1113, 1814)], 'context': [(857, 917)]},
    },
    'EDX_1SC0_2022_JUNE_2CF_Q05': {
        'U01': {'own': [(914, 1255)], 'context': [(0, 395), (395, 914)]},
        'U02': {'own': [(1255, 1571)], 'context': [(0, 395), (395, 914)]},
        'U03': {'own': [(1571, 1767)], 'context': [(0, 395), (395, 914)]},
        'U04': {'own': [(1844, 1970)], 'context': [(0, 395), (1767, 1844)]},
        'U05': {'own': [(1970, 2271)], 'context': [(0, 395), (1767, 1844)]},
        'U06': {'own': [(2271, 2618)], 'context': [(0, 395)]},
    },
    'EDX_1SC0_2022_JUNE_2CH_Q01': {
        'U01': {'own': [(1074, 1415)], 'context': [(0, 541), (541, 1074)]},
        'U02': {'own': [(1415, 1731)], 'context': [(0, 541), (541, 1074)]},
        'U03': {'own': [(1731, 1927)], 'context': [(0, 541), (541, 1074)]},
        'U04': {'own': [(2004, 2130)], 'context': [(0, 541), (1927, 2004)]},
        'U05': {'own': [(2130, 2461)], 'context': [(0, 541), (1927, 2004)]},
    },
    'EDX_1SC0_2023_JUNE_1CF_Q04': {
        'U01': {'own': [(74, 195)], 'context': [(36, 74)]},
        'U02': {'own': [(195, 450)], 'context': [(36, 74)]},
        'U03': {'own': [(450, 638)], 'context': []},
        'U04': {'own': [(638, 802)], 'context': []},
        'U05': {'own': [(802, 1404)], 'context': []},
        'U06': {'own': [(1404, 2381)], 'context': []},
    },
    'EDX_1SC0_2023_JUNE_2CH_Q02': {
        'U01': {'own': [(427, 707)], 'context': [(0, 427)]},
        'U02': {'own': [(707, 1007)], 'context': [(0, 427)]},
        'U03': {'own': [(1007, 1212)], 'context': [(0, 427)]},
        'U04': {'own': [(1272, 1520)], 'context': [(0, 427), (1212, 1272)]},
        'U05': {'own': [(1520, 1989)], 'context': [(0, 427), (1212, 1272)]},
    },
    'EDX_1SC0_2023_JUNE_2CH_Q04': {
        'U01': {'own': [(1226, 1446)], 'context': [(0, 609), (609, 1226)]},
        'U02': {'own': [(1446, 1788)], 'context': [(0, 609), (609, 1226)]},
        'U03': {'own': [(1788, 1946)], 'context': [(0, 609)]},
        'U04': {'own': [(1946, 2194)], 'context': [(0, 609)]},
        'U05': {'own': [(2194, 2390)], 'context': [(0, 609)]},
    },
    'EDX_1SC0_2024_JUNE_1PF_Q06': {
        'U01': {'own': [(825, 953)], 'context': [(0, 81), (81, 825)]},
        'U02': {'own': [(953, 1398)], 'context': [(0, 81), (81, 825)]},
        'U03': {'own': [(1474, 1854)], 'context': [(0, 81), (1398, 1474)]},
        'U04': {'own': [(1854, 2715)], 'context': [(0, 81), (1398, 1474)]},
        'U05': {'own': [(2715, 3939)], 'context': [(0, 81)]},
    },
    'EDX_1SC0_2024_JUNE_2BF_Q03': {
        'U01': {'own': [(74, 522)], 'context': [(0, 74)]},
        'U02': {'own': [(522, 718)], 'context': [(0, 74)]},
        'U03': {'own': [(756, 987)], 'context': [(0, 74), (718, 756)]},
        'U04': {'own': [(987, 1091)], 'context': [(0, 74), (718, 756)]},
        'U05': {'own': [(1091, 1198)], 'context': [(0, 74), (718, 756)]},
        'U06': {'own': [(1623, 1872)], 'context': [(0, 74), (1198, 1623)]},
        'U07': {'own': [(1872, 1998)], 'context': [(0, 74), (1198, 1623)]},
        'U08': {'own': [(1998, 2325)], 'context': [(0, 74)]},
    },
    'EDX_1SC0_2024_JUNE_2PF_Q03': {
        'U01': {'own': [(290, 700)], 'context': [(36, 290)]},
        'U02': {'own': [(700, 842)], 'context': [(36, 290)]},
        'U03': {'own': [(842, 1092)], 'context': []},
        'U04': {'own': [(2151, 2250)], 'context': [(1092, 2151)]},
        'U05': {'own': [(2250, 2680)], 'context': [(1092, 2151)]},
    },
    'EDX_1SC0_2025_JUNE_1CF_Q02': {
        'U01': {'own': [(275, 511)], 'context': [(81, 275)]},
        'U02': {'own': [(511, 1398)], 'context': [(81, 275)]},
        'U03': {'own': [(1985, 2098)], 'context': [(1398, 1985)]},
        'U04': {'own': [(2098, 2715)], 'context': [(1398, 1985)]},
        'U05': {'own': [(3269, 3395)], 'context': [(2715, 3269)]},
        'U06': {'own': [(3395, 3883)], 'context': [(2715, 3269)]},
    },
}

# Part labels the build recorded wrongly (checked against the printed paper).
LABELS = {
    'EDX_1SC0_2020_NOVEMBER_1CH_Q05_U05': '(c)',      # printed *(c), 6 marks; recorded as (b)(ii)
    'EDX_1PH0_2020_NOVEMBER_1F_Q09_U05': '(d)',       # original_parts said (c)
    'EDX_1SC0_2020_NOVEMBER_1PF_Q06_U05': '(d)',
    'EDX_1PH0_2022_JUNE_1F_Q10_U02': '(a)(ii) 1',     # two 1-mark items under (a)(ii)
    'EDX_1PH0_2022_JUNE_1F_Q10_U03': '(a)(ii) 2',
    'EDX_1PH0_2022_JUNE_1H_Q04_U02': '(a)(ii) 1',
    'EDX_1PH0_2022_JUNE_1H_Q04_U03': '(a)(ii) 2',
}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    packs = {}
    for path in (ROOT / 'data/packs').glob('*/*.json'):
        packs[path] = None
    done = 0
    for path in sorted(packs):
        pack = json.loads(path.read_text())
        parents = {q['parent_question_id'] for q in pack['questions']} & set(CONTEXTS)
        if not parents:
            continue
        slug, pid = path.parent.name, path.stem
        cat_path = ROOT / 'data' / f'{slug}-assets' / f'{pid}.json'
        catalogue = json.loads(cat_path.read_text())
        assets = catalogue['assets']
        for parent in sorted(parents):
            qn = re.search(r'_(Q\d+)$', parent).group(1)
            full = np.asarray(Image.open(io.BytesIO(base64.b64decode(assets[f'{qn}_full.webp']['base64']))).convert('L'))
            for unit in pack['questions']:
                if unit['parent_question_id'] != parent:
                    continue
                tag = re.search(r'_(U\d+|P\d+)$', unit['question_id']).group(1)
                if tag not in CONTEXTS[parent]:
                    raise SystemExit(f'{unit["question_id"]}: no context decision recorded')
                rows = CONTEXTS[parent][tag]
                if isinstance(rows, dict):
                    own_rows, rows = rows.get('own'), rows.get('context', [])
                    if own_rows:
                        pieces = [full[a:b] for a, b in own_rows]
                        out = np.full((sum(p.shape[0] for p in pieces) + GAP * (len(pieces) - 1), full.shape[1]), 255, np.uint8)
                        y = 0
                        for p in pieces:
                            out[y:y + p.shape[0]] = p
                            y += p.shape[0] + GAP
                        buf = io.BytesIO()
                        Image.fromarray(out, 'L').convert('RGB').save(buf, 'WEBP', lossless=True, quality=100, method=4)
                        data = buf.getvalue()
                        own_name = unit['content']['question_image_url'].rsplit('/', 1)[1]
                        assets[own_name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
                        unit['provenance']['own_rows_from_full'] = own_rows
                if unit['question_id'] in LABELS:
                    unit['part_label'] = LABELS[unit['question_id']]
                    unit['provenance']['original_parts'] = [LABELS[unit['question_id']].split(' ')[0]]
                ctx = unit.setdefault('context', {})
                old = re.search(r'data-math-image="assets/[a-z]+/[A-Z0-9_]+/([A-Za-z0-9_]+\.webp)"', ctx.get('shared_stem_html', ''))
                ctx.pop('shared_stem_html', None)
                name = f'{qn}_{tag}_context.webp'
                if old and old.group(1) != f'{qn}_stem.webp':
                    assets.pop(old.group(1), None)
                if not rows:
                    if ctx.get('stem_image_url'):
                        assets.pop(ctx.pop('stem_image_url').rsplit('/', 1)[1], None)
                    unit['provenance'].pop('context_rows_from_full', None)
                else:
                    pieces = [full[a:b] for a, b in rows]
                    out = np.full((sum(p.shape[0] for p in pieces) + GAP * (len(pieces) - 1), full.shape[1]), 255, np.uint8)
                    y = 0
                    for p in pieces:
                        out[y:y + p.shape[0]] = p
                        y += p.shape[0] + GAP
                    buf = io.BytesIO()
                    Image.fromarray(out, 'L').convert('RGB').save(buf, 'WEBP', lossless=True, quality=100, method=4)
                    data = buf.getvalue()
                    assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
                    ctx['stem_image_url'] = f'assets/{slug}/{pid}/{name}'
                    unit['provenance']['context_rows_from_full'] = rows
                unit['provenance']['context_reviewed'] = 'model review of the rendered question, 2026-11-20'
                if not ctx:
                    unit.pop('context')
                done += 1
        # drop catalogue entries nothing references any more
        text = json.dumps(pack)
        for name in [n for n in assets if f'/{n}"' not in text and not n.endswith(('_full.webp', '_scheme.webp'))]:
            if re.match(r'Q\d+_(U\d+|P\d+)_context\.webp$|Q\d+_stem\.webp$', name):
                assets.pop(name)
        if not a.dry_run:
            path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
            newline = '\n' if cat_path.read_text().endswith('\n') else ''
            cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
    print(f'{done} parts given a reviewed context')


if __name__ == '__main__':
    main()
