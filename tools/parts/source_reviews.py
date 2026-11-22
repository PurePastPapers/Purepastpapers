"""Load source-specific crop and scenario corrections for AQA builders."""

from html import escape
import json


def load_source_review(path, paper_id, source_hash):
    correction = json.loads(path.read_text()).get(paper_id, {})
    if correction and correction['question_source_sha256'] != source_hash:
        raise ValueError(f'{paper_id}: reviewed crop source revision mismatch')
    return correction


def reviewed_dependencies(dependencies, scenarios):
    return list(dict.fromkeys([*dependencies, *(label for label, correction in scenarios.items()
                                               if correction.get('link'))]))


def apply_scenarios(scenarios, context, figures, reasons, put, qname):
    for label, correction in scenarios.items():
        if 'region' in correction:
            figures.append({
                'label': correction['label'],
                'source': 'question_paper',
                'image_url': put(f'{qname(label)}_scenario', [correction['region']]),
            })
            reasons.append(f'reviewed scenario from question {label}')
        if 'text' in correction:
            context['shared_stem_html'] = context.get('shared_stem_html', '') + f"<p>{escape(correction['text'])}</p>"
            reasons.append(f'reviewed reference from question {label}')
