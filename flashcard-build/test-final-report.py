import importlib.util,random,tempfile,pathlib,json
spec=importlib.util.spec_from_file_location('final_report',str(pathlib.Path(__file__).resolve().parent/'final-report.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def card(i,deck='content',topic=None):
 return {'stable_key':str(i),'set':deck,'paper':'Paper '+str(i%3),'topic':topic or 'Topic '+str(i%9),'spec_id':'leaf'+str(i%25),'front':'Which phrase is used?' if deck=='quotes' else 'What is it?','back':'Answer','point':{'code':'1','title':'Title'}}
a=[card(i,'quotes' if i%7==0 else 'content') for i in range(180)]+[card(1000+i,'mark_scheme') for i in range(9)]
x=m.sample_cards(a,random.Random(20261126),require_recall=True);y=m.sample_cards(a,random.Random(20261126),require_recall=True)
assert [c['stable_key'] for c in x]==[c['stable_key'] for c in y]
assert 40<=len(x)<=90 and sum(c['set']=='mark_scheme' for c in x)==4
assert {c['paper'] for c in a if c['set']!='mark_scheme'} <= {c['paper'] for c in x}
assert {(c['paper'],c['topic']) for c in a if c['set']!='mark_scheme'} <= {(c['paper'],c['topic']) for c in x}
assert {c['set'] for c in a}<={c['set'] for c in x} and any(m.is_recall(c) for c in x)
assert m.plain('<p><strong>Model</strong></p>A &amp; B<ul><li>Point</li></ul>')=='Model A & B Point'
# The original Psychology MARK scattergram is stored as an image tag.
# Its alt describes the actual eight data pairs needed to answer the question.
originals=json.loads((pathlib.Path(__file__).resolve().parent/'mark-original.json').read_text(encoding='utf-8'))
scatter=next(c for c in originals if c.get('catalogue_id')=='AQA_ALEVEL_PSYCH_7182_MARK' and 'Scattergram.' in c.get('front',''))
rendered=m.line(scatter['front'])
assert '[Figure: Synthetic data. Scattergram.' in rendered
assert '1 to 8' in rendered and '18, 16, 15, 17, 12, 9, 11, 7' in rendered
assert '<img' not in rendered and 'media:' not in rendered
assert m.line('Before <img src="media:x" alt="A &amp; B"> after')=='Before [Figure: A & B] after'
assert not m.is_recall(dict(a[0],front='What does the phrase suggest?'))
small=[]
for topic in range(3):
 for leaf in range(5):
  for deck in ('content','evidence'):
   c=card(len(small),deck,topic=f'Topic {topic}')
   c['paper']='Paper 1'; c['spec_id']=f'{topic}-{leaf}';small.append(c)
small += [card(2000+i,'mark_scheme') for i in range(4)]
sample=m.sample_cards(small,random.Random(3),minimum=0)
atomic=[c for c in sample if c['set']!='mark_scheme']
assert len(atomic)==18
for topic in range(3):
 selected=[c for c in atomic if c['topic']==f'Topic {topic}']
 assert len({c['spec_id'] for c in selected})==3
 assert all(len([c for c in selected if c['spec_id']==leaf])==2 for leaf in {c['spec_id'] for c in selected})
class Fail:
 def __init__(self):self.calls=[]
 def compile_subject(self,s):self.calls.append(s);return False
f=Fail()
try:m.load_ready(f);raise AssertionError('missing gate')
except RuntimeError:pass
assert len(f.calls)==5
with tempfile.TemporaryDirectory() as d:
 m.BASE=pathlib.Path(d)
 p=m.BASE/'publication-results.json'
 assert m.publication_status({},'psychology')=='No confirmed publication record'
 assert m.publication_status({'psychology':{'status':'published'}},'psychology')=='Published (recorded)'
print('PASS: five-subject strict gate, deterministic sampling, strata/cap, four MARK cards, quote recall, HTML and absent publication status')
