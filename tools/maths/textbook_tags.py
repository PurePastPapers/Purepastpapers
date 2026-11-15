#!/usr/bin/env python3
"""Associate reviewed question rationales with the supplied textbook contents.

Specific links need positive named-skill evidence. If that evidence cannot
distinguish subsections of a broad official point, retain a conservative chapter
scope instead of claiming every subsection is assessed. No question ID changes.
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Additional named-skill evidence beyond the exact subsection heading. These
# cues only rank sections already related to the question's official skill ID.
CUES = {
 'P1_1.1': r'index law|laws of indices|indices', 'P1_1.2': r'expand.*bracket|expanding',
 'P1_1.3': r'factoris|factoriz', 'P1_1.4': r'negative.*power|fractional.*power|rational.*power|fractional indices|negative indices',
 'P1_1.5': r'surd|radical', 'P1_1.6': r'rationalis|rationaliz|denominator',
 'P1_2.1': r'solve.*quadratic|quadratic.*root', 'P1_2.2': r'complet.*square',
 'P1_2.4': r'quadratic.*graph|parabola|quadratic.*sketch', 'P1_2.5': r'discriminant|equal roots|no real roots|distinct.*roots',
 'P1_2.6': r'quadratic.*model|model.*quadratic',
 'P1_3.1': r'linear simultaneous|two linear', 'P1_3.2': r'quadratic.*simultaneous|simultaneous.*quadratic',
 'P1_3.3': r'simultaneous.*graph|graph.*simultaneous', 'P1_3.4': r'linear inequal',
 'P1_3.5': r'quadratic inequal|inequal.*quadratic', 'P1_3.6': r'inequal.*graph|graph.*inequal', 'P1_3.7': r'shaded.*region|feasible.*region',
 'P1_4.1': r'cubic', 'P1_4.2': r'quartic', 'P1_4.3': r'reciprocal|inverse proportion',
 'P1_4.4': r'intersection|intersect', 'P1_4.5': r'translat|horizontal.*shift|vertical.*shift',
 'P1_4.6': r'stretch|scal', 'P1_4.7': r'reflect|combined.*transform|combining.*transform',
 'P1_5.1': r'gradient.*intercept', 'P1_5.2': r'equation.*line|line.*equation',
 'P1_5.3': r'parallel|perpendicular', 'P1_5.4': r'distance|length|area.*triangle', 'P1_5.5': r'linear model|model.*straight|straight.*model',
 'P1_6.1': r'midpoint|bisector', 'P1_6.2': r'circle.*equation|equation.*circle|centre|center|radius|radii|complet.*square',
 'P1_6.3': r'intersection|intersect|simultaneous', 'P1_6.4': r'tangent|chord', 'P1_6.5': r'triangle|pythagor',
 'P1_7.1': r'algebraic fraction|rational expression', 'P1_7.2': r'divid.*polynomial|polynomial.*divis|algebraic division|quotient',
 'P1_7.3': r'factor theorem|remainder theorem|polynomial.*root|known.*root',
 'P1_7.4': r'deduction|exhaustion|counter.?example', 'P1_7.5': r'proof|prove',
 'P1_8.1': r'pascal', 'P1_8.2': r'factorial', 'P1_8.3': r'binomial.*expan|expan.*binomial|coefficient',
 'P1_8.4': r'binomial.*parameter|binomial.*coefficient', 'P1_8.5': r'estimat|approximat',
 'P1_9.1': r'cosine rule', 'P1_9.2': r'sine rule', 'P1_9.3': r'area.*triangle|triangle.*area',
 'P1_9.4': r'triangle.*length|length.*triangle|triangle.*angle', 'P1_9.5': r'trigonometric.*graph|sin.*graph|cos.*graph|tan.*graph',
 'P1_9.6': r'trigonometric.*transform|transform.*trig', 'P1_10.1': r'quadrant',
 'P1_10.2': r'exact.*trig|exact.*sin|exact.*cos|exact.*tan', 'P1_10.3': r'pythagorean|sin.*cos.*identit',
 'P1_10.4': r'simple.*trigonometric.*equation|linear.*trig', 'P1_10.5': r'quadratic.*trig|trig.*quadratic',
 'P1_10.6': r'identit.*equation|equation.*identit',
 'P1_11.1': r'two.dimensional|2.?d', 'P1_11.2': r'vector.*add|scalar.*multipl|linear combination',
 'P1_11.3': r'magnitude|direction|unit vector', 'P1_11.4': r'position vector|distance.*point',
 'P1_11.5': r'collinear|parallel|geometr|ratio', 'P1_11.6': r'vector.*model|model.*vector',
 'P1_12.1': r'gradient.*curve|instantaneous.*gradient', 'P1_12.2': r'first principles|limit.*derivative',
 'P1_12.3': r'power rule|polynomial|fractional power|negative power|rational power|differentiat.*power',
 'P1_12.4': r'differentiat.*quadratic', 'P1_12.5': r'several terms|two.*terms|multiple terms',
 'P1_12.6': r'tangent|normal', 'P1_12.7': r'increas|decreas|monotonic',
 'P1_12.8': r'second derivative|second order', 'P1_12.9': r'stationary|turning point|minimum|maximum',
 'P1_12.10': r'gradient.*sketch|sketch.*gradient|derivative.*graph|graph.*derivative',
 'P1_12.11': r'optimis|optimiz|profit|volume.*maximum|model.*differentiat',
 'P1_13.1': r'power rule|polynomial|integrat.*power', 'P1_13.2': r'indefinite|antiderivative',
 'P1_13.3': r'integration constant|constant of integration|recover.*function|find.*function|initial.*condition',
 'P1_13.4': r'definite integral|integral.*limit', 'P1_13.5': r'area under|area.*curve',
 'P1_13.6': r'below.*axis|negative.*area', 'P1_13.7': r'between.*curve|between.*line|enclosed.*area',
 'P1_14.1': r'exponential.*graph|graph.*exponential', 'P1_14.2': r'e\^|eˣ|gradient.*exponential',
 'P1_14.3': r'growth|decay|exponential.*model|model.*exponential', 'P1_14.4': r'inverse.*exponential',
 'P1_14.5': r'logarithm.*law|laws.*log', 'P1_14.6': r'logarithm.*equation|exponential.*equation|solve.*log',
 'P1_14.7': r'natural log|\bln\b', 'P1_14.8': r'logarithmic.*graph|linearise|linearize|non.linear.*data|log.*straight',
 'P2_1.1': r'contradiction', 'P2_1.2': r'algebraic fraction|rational expression', 'P2_1.3': r'partial fraction',
 'P2_1.4': r'repeated.*factor', 'P2_1.5': r'algebraic division|polynomial.*division',
 'P2_2.1': r'modulus|absolute', 'P2_2.2': r'domain|range|one.to.one|mapping',
 'P2_2.3': r'composite|composition', 'P2_2.4': r'inverse', 'P2_2.5': r'modulus.*transform|transform.*modulus',
 'P2_2.6': r'combined.*transform|combining.*transform|sequence.*transform', 'P2_2.7': r'modulus.*equation|modulus.*inequal|solve.*modulus',
 'P2_3.1': r'arithmetic.*sequence|arithmetic.*term', 'P2_3.2': r'arithmetic.*sum|arithmetic.*series',
 'P2_3.3': r'geometric.*sequence|geometric.*term', 'P2_3.4': r'geometric.*sum|geometric.*series',
 'P2_3.5': r'infinity|infinite|convergen', 'P2_3.6': r'sigma', 'P2_3.7': r'recurren|periodic|sequence.*iterat',
 'P2_3.8': r'series.*model|sequence.*model|loan|annuit|saving',
 'P2_4.1': r'binomial.*expan|fractional.*expan|negative.*expan', 'P2_4.2': r'coefficient|validity|valid range',
 'P2_4.3': r'partial fraction', 'P2_5.1': r'radian', 'P2_5.2': r'arc length|perimeter',
 'P2_5.3': r'sector|segment', 'P2_5.4': r'trigonometric equation', 'P2_5.5': r'small.angle',
 'P2_6.1': r'secant|cosecant|cotangent', 'P2_6.2': r'graph|sketch', 'P2_6.3': r'\bsec\b|\bcosec\b|\bcot\b',
 'P2_6.4': r'pythagorean|identit', 'P2_6.5': r'arcsin|arccos|arctan|inverse trig',
 'P2_7.1': r'addition formula|compound.angle', 'P2_7.2': r'angle addition', 'P2_7.3': r'double.angle',
 'P2_7.4': r'trigonometric.*equation|solve.*trig', 'P2_7.5': r'r.cos|r.sin|harmonic|amplitude|phase',
 'P2_7.6': r'prove.*identit|proof.*identit', 'P2_7.7': r'trigonometric.*model|model.*trig|periodic.*model',
 'P2_8.1': r'cartesian|eliminat.*parameter', 'P2_8.2': r'trigonometric.*identit',
 'P2_8.3': r'sketch|curve.*shape', 'P2_8.4': r'intersect', 'P2_8.5': r'parametric.*model|model.*parametric',
 'P2_9.1': r'differentiat.*sin|differentiat.*cos', 'P2_9.2': r'exponential|logarithm|\bln\b',
 'P2_9.3': r'chain rule', 'P2_9.4': r'product rule', 'P2_9.5': r'quotient rule',
 'P2_9.6': r'trigonometric|\btan\b|\bsec\b', 'P2_9.7': r'parametric', 'P2_9.8': r'implicit',
 'P2_9.9': r'second derivative|nature.*stationary|stationary.*nature', 'P2_9.10': r'connected.*rate|related.*rate|rate.*change',
 'P2_10.1': r'sign.*change|change.*sign|bracket.*root', 'P2_10.2': r'iterat|cobweb|staircase',
 'P2_10.3': r'newton.?raphson', 'P2_10.4': r'numerical.*model|model.*numerical',
 'P2_11.1': r'integrat.*sin|integrat.*cos|exponential|\bln\b|logarithm', 'P2_11.2': r'linear argument|linear.*substitut',
 'P2_11.3': r'trigonometric.*identit|double.angle', 'P2_11.4': r'reverse chain',
 'P2_11.5': r'substitution|substitut', 'P2_11.6': r'integration by parts|integrat.*by parts',
 'P2_11.7': r'partial fraction', 'P2_11.8': r'area|enclosed', 'P2_11.9': r'trapez',
 'P2_11.10': r'differential equation|separat.*variab', 'P2_11.11': r'differential.*model|model.*differential|growth|decay|cooling',
 'P2_11.12': r'limit.*sum|sum.*limit|riemann', 'P2_12.1': r'coordinate|distance',
 'P2_12.2': r'vector|scalar', 'P2_12.3': r'collinear|parallel|geometr|ratio|cuboid|plane',
 'P2_12.4': r'mechanic|force|velocity|acceleration',
 'A1_1.1': r'population|census|sample.*definition', 'A1_1.2': r'random sampl|systematic|stratif',
 'A1_1.3': r'quota|opportunity|non.random', 'A1_1.4': r'type.*data|continuous|discrete|categorical',
 'A1_1.5': r'large data|weather|beijing|heathrow|leeming|leuchars|camborne|perth|jacksonville',
 'A1_2.1': r'\bmean\b|\bmode\b|median', 'A1_2.2': r'quartile|percentile', 'A1_2.3': r'interquartile|\biqr\b|\brange\b',
 'A1_2.4': r'variance|standard deviation|sxx|s_xx', 'A1_2.5': r'coding|coded',
 'A1_3.1': r'outlier|cleaning|anomal', 'A1_3.2': r'box.?plot', 'A1_3.3': r'cumulative.*frequency',
 'A1_3.4': r'histogram|frequency density', 'A1_3.5': r'compar.*data|compar.*distribution|compare.*spread',
 'A1_4.1': r'correlation|scatter', 'A1_4.2': r'regression|predict|extrapolat|interpolat',
 'A1_5.1': r'probabilit', 'A1_5.2': r'venn|set diagram', 'A1_5.3': r'independen|mutually exclusive', 'A1_5.4': r'tree diagram|probability tree',
 'A1_6.1': r'discrete.*distribution|distribution.*table', 'A1_6.2': r'binomial|bin\(',
 'A1_6.3': r'cumulative|at least|at most', 'A1_7.1': r'hypothes|significance|p.value',
 'A1_7.2': r'critical.*value|critical.*region|acceptance.*region', 'A1_7.3': r'one.tailed|upper.tail|lower.tail', 'A1_7.4': r'two.tailed',
 'A1_8.1': r'construct.*model', 'A1_8.2': r'assum|particle.*model|smooth|light|inextensible',
 'A1_8.3': r'unit|dimension|newton.*unit', 'A1_8.4': r'vector|resultant',
 'A1_9.1': r'displacement.time|position.time', 'A1_9.2': r'velocity.time|speed.time',
 'A1_9.3': r'suvat|uniform acceleration|constant acceleration', 'A1_9.4': r'time.independent|v.?squared|v²',
 'A1_9.5': r'gravity|vertical|free fall', 'A1_10.1': r'force diagram|newton.*first',
 'A1_10.2': r'resultant|vector', 'A1_10.3': r'newton.*second|f ?= ?ma|acceleration',
 'A1_10.4': r'two.dimensional|2.?d|plane', 'A1_10.5': r'connected|coupled', 'A1_10.6': r'pulley',
 'A1_11.1': r'function.*time|time.*function', 'A1_11.2': r'differentiat',
 'A1_11.3': r'maximum|minimum|stationary', 'A1_11.4': r'integrat|displacement', 'A1_11.5': r'constant acceleration|suvat',
 'A2_1.1': r'exponential|logarithm|linearise|linearize', 'A2_1.2': r'correlation coefficient|pmcc', 'A2_1.3': r'hypothes|significan',
 'A2_2.1': r'set notation|complement|union|intersection', 'A2_2.2': r'conditional|given that',
 'A2_2.3': r'venn', 'A2_2.4': r'bayes|probability formula', 'A2_2.5': r'tree',
 'A2_3.1': r'normal.*model|select.*normal', 'A2_3.2': r'probability|proportion|percent',
 'A2_3.3': r'inverse normal|quantile|percentile', 'A2_3.4': r'standardis|standardiz|z.score',
 'A2_3.5': r'unknown.*mean|unknown.*deviation|find.*mean|find.*deviation|determin.*mean|parameter',
 'A2_3.6': r'continuity|normal approximation|approximat.*binomial', 'A2_3.7': r'hypothes|significan|p.value',
 'A2_4.1': r'moment', 'A2_4.2': r'resultant.*moment', 'A2_4.3': r'equilibrium|balance',
 'A2_4.4': r'centre.*mass|center.*mass', 'A2_4.5': r'tilt|toppl|about to turn',
 'A2_5.1': r'resolv|component', 'A2_5.2': r'inclined|slope|inclination', 'A2_5.3': r'friction|coefficient',
 'A2_6.1': r'horizontal.*project|project.*horizontal', 'A2_6.2': r'horizontal.*component|vertical.*component',
 'A2_6.3': r'project.*angle|angle.*project|launch.*angle', 'A2_6.4': r'range|greatest.*height|trajectory|flight|projectile',
 'A2_7.1': r'static.*particle', 'A2_7.2': r'model.*static|static.*assum', 'A2_7.3': r'limiting.*friction|friction.*equilibrium',
 'A2_7.4': r'ladder|rod|beam|rigid', 'A2_7.5': r'accelerat.*inclined|inclined.*accelerat|dynamics', 'A2_7.6': r'connected|pulley',
 'A2_8.1': r'vector.*kinematic|position vector|velocity vector', 'A2_8.2': r'vector.*projectile',
 'A2_8.3': r'one.dimensional|one dimension', 'A2_8.4': r'differentiat.*vector|vector.*differentiat', 'A2_8.5': r'integrat.*vector|vector.*integrat',
}
STOP = {'using','finding','solving','functions','function','equations','equation','modelling','problems','with','and','the','from','two','more','terms','integrating','differentiating','methods'}


def main():
    document = json.loads((ROOT/'data/curriculum/maths-textbooks.json').read_text())
    by_point = defaultdict(list)
    for book in document['books']:
        for chapter in book['chapters']:
            for section in chapter['sections']:
                item = {**section, 'book': book['id'], 'year': book['year'], 'chapter_id': chapter['id']}
                for point in section['official_points']: by_point[point].append(item)
    output, stats, audit = {}, Counter(), []
    for path in sorted((ROOT/'data/packs/maths').glob('*.json')):
        for question in json.loads(path.read_text())['questions']:
            text = ' '.join([question['preview_text'], question['provenance']['difficulty_basis'], question['provenance'].get('year_basis') or '']).lower()
            requirements = {}
            for point in dict.fromkeys(question['primary_spec_points'] + question['crossover_spec_points']):
                candidates = by_point[point]
                preferred_year = 12 if question.get('is_as') or point in question['crossover_spec_points'] else question['introduced_year']
                if question.get('is_as') and any(c['year'] == 12 for c in candidates):
                    candidates = [c for c in candidates if c['year'] == 12]
                scored = []
                for candidate in candidates:
                    key = candidate['id'].removeprefix('TB_MATH_')
                    pattern = CUES.get(key)
                    named = bool(pattern and re.search(pattern, text))
                    words = {w for w in re.findall(r'[a-z]{4,}', candidate['title'].lower()) if w not in STOP}
                    word_hits = sum(bool(re.search(r'\b'+re.escape(w.rstrip('s'))+r'\w*', text)) for w in words)
                    score = 6 * named + min(word_hits, 3) + (candidate['year'] == preferred_year)
                    scored.append((score, named, word_hits, candidate))
                best = max(s[0] for s in scored)
                selected = [s[3] for s in scored if s[0] == best and (s[1] or s[2])]
                precision = 'subsection'
                if not selected:
                    precision = 'chapter'
                    preferred = [c for c in candidates if c['year'] == preferred_year] or candidates
                    chapter = Counter(c['chapter_id'] for c in preferred).most_common(1)[0][0]
                    selected = [c for c in preferred if c['chapter_id'] == chapter]
                requirements[point] = {'ids': [c['id'] for c in selected], 'precision': precision}
                stats[precision] += 1
            output[question['question_id']] = {'requirements': requirements}
            audit.append({'id': question['question_id'], 'summary': question['preview_text'],
                          'primary': {p: requirements[p] for p in question['primary_spec_points']}})
    result = {'version': document['version'], 'source_basis': 'Existing model-reviewed question skill tags, editorial summaries and difficulty rationales, associated to the owner-supplied contents. Positive named-skill cues select subsections; ambiguous relationships retain chapter scope. This is not independent teacher review.',
              'counts': dict(stats), 'questions': output}
    (ROOT/'data/imports/maths/textbook-question-links.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    private = ROOT.parent/'math-research/textbook-mapping-audit.json'
    private.write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n')
    print('Question associations', len(output), 'official skill relationships', dict(stats))


if __name__ == '__main__':
    main()
