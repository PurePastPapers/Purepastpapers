#!/bin/sh
# Segment every fetched question paper. usage: tools/import/run-extract.sh <work_dir>
# Images go to assets/questions/9MA0/<paper_id>/, JSON to <work_dir>/qp/.
set -e
W=${1:-.import-cache/9MA0/work}
for f in .import-cache/9MA0/*.question_paper.pdf; do
  id=$(basename "$f" .question_paper.pdf)
  case "$id" in *SAMPLE*|*SPECIMEN*|*2019_JUNE_P3*) continue;; esac
  python3 -I tools/import/extract_qp.py "$id" "$f" "$W/qp" "assets/questions/9MA0/$id" 2>&1 | grep -v "Syntax\|Cannot\|CropBox" || true
done
for id in EDX_9MA0_2019_JUNE_P3S EDX_9MA0_2019_JUNE_P3M; do
  python3 -I tools/import/extract_manual.py "$id" ".import-cache/9MA0/$id.question_paper.pdf" "$W/qp" "assets/questions/9MA0/$id" tools/import/manual/9MA0.json
done
for f in .import-cache/9MA0/*.mark_scheme.pdf; do
  id=$(basename "$f" .mark_scheme.pdf)
  case "$id" in *SAMPLE*|*SPECIMEN*) continue;; esac
  python3 -I tools/import/extract_ms.py "$id" "$f" "$W/ms" "assets/schemes/9MA0/$id" 2>&1 | grep -v "Syntax\|Cannot\|CropBox" || true
done
