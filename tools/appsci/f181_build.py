#!/usr/bin/env python3
"""Build the independently answerable F181 SAM parts from the unmodified official bundle.

python3 tools/appsci/f181_build.py /private/path/697860-science-in-society.pdf
Source pixels are rendered at 2x and encoded losslessly. Source B in the insert
is publicly withheld; the paper remains incomplete and must not be indexed as a
complete paper. Do not publish pending subject-specific OCR permission.
"""
import base64, hashlib, io, json, sys
from pathlib import Path
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PAPER = 'OCR_F181_SAMPLE'
SHA = '3842719f3e1c6b9128186876fbec4c986f57cf5cfc289ede58d543f8e5415826'
URL = 'https://www.ocr.org.uk/Images/697860-science-in-society.pdf'
pdf = fitz.open(sys.argv[1]); assert hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest() == SHA
assert len(pdf) == 27
# Reviewed point coordinates, in PDF points, top-left origin, 1-indexed pages.
# A region spans the entire printed column width so that marks at the right edge survive.
units = [
 # label, marks, original question regions, exact scheme rows, independent context, description, tag
 ('1(a)(i)',2,[(2,94,317)],[(15,106,212)],[], 'State why peer review is important.', '4.1.2'),
 ('1(b)(ii)',2,[(2,632,721)],[(15,435,605)],[], 'Explain the value of international scientific collaboration.', '1.1.1'),
 ('2(a)',1,[(3,43,170)],[(16,71,238)],[], 'Define a scientific law.', '3.1.1'),
 ('2(b)',1,[(3,191,270)],[(16,238,352)],[], 'Distinguish a scientific theory from a scientific law.', '3.1.2'),
 ('3(b)',4,[(4,182,465)],[(17,71,305)],[(4,43,73)], 'Discuss limitations of collecting samples from icy moons.', '3.3.1'),
 ('5(a)',2,[(6,65,622)],[(19,71,266)],[], 'Order the steps of the scientific method.', '1.2.1'),
 ('5(b)',1,[(6,630,707)],[(19,266,398)],[], 'Distinguish a hypothesis from a prediction.', '3.1.1'),
 ('5(c)',2,[(7,43,193)],[(19,398,691)],[], 'Explain why the scientific method is non-linear.', '1.2.2'),
 ('5(d)',3,[(7,214,516)],[(20,71,356)],[], 'Explain why scientists should develop battery technology.', '3.3.1'),
 ('6(a)',1,[(8,275,371)],[(20,356,448)],[(8,43,251)], 'Calculate a percentage of new car sales.', '2.4.1'),
 ('6(b)(i)',2,[(8,391,540)],[(20,448,581)],[(8,43,251)], 'Calculate the percentage decrease in car sales.', '2.4.1'),
 ('6(b)(ii)',3,[(8,560,776)],[(20,581,721)],[(8,43,251)], 'Explain a prediction about electric car sales.', '2.4.1'),
 ('6(b)(iii)',1,[(9,43,119)],[(21,71,185)],[(8,43,251)], 'Choose a graphical form for the sales data.', '2.3.2'),
 ('6(b)(iv)',2,[(9,140,281)],[(21,185,387)],[(8,43,251)], 'Evaluate the chosen graphical form.', '2.3.2'),
 ('7',6,[(10,43,623),(11,158,178)],[(21,387,768),(22,69,406)],[], 'Discuss the benefits and disadvantages of an electric car for John.', '3.3.1'),
]
assets={}
DIFFICULTIES = {
 '1(a)(i)': ('easy', 'Recall the quality-control purposes of peer review.'),
 '1(b)(ii)': ('easy', 'Recall benefits of international scientific collaboration.'),
 '2(a)': ('easy', 'Recall the meaning of a scientific law.'),
 '2(b)': ('easy', 'Distinguish the explanatory role of a theory from a law.'),
 '3(b)': ('medium', 'Apply scientific-development limitations and matched mitigations to collecting moon samples.'),
 '5(a)': ('easy', 'Sequence familiar stages of the scientific method.'),
 '5(b)': ('easy', 'Distinguish a hypothesis from its testable prediction.'),
 '5(c)': ('medium', 'Explain why evidence can cause scientists to revisit stages of an investigation.'),
 '5(d)': ('medium', 'Apply scientific-development purposes to battery technology.'),
 '6(a)': ('easy', 'Calculate a percentage from the supplied car-sales data.'),
 '6(b)(i)': ('easy', 'Calculate a percentage decrease using the supplied original and final counts.'),
 '6(b)(ii)': ('medium', 'Interpret the data trend and justify a future prediction.'),
 '6(b)(iii)': ('easy', 'Choose a suitable graphical representation for the supplied dataset.'),
 '6(b)(iv)': ('medium', 'Evaluate the strengths and limitations of the graphical form chosen in the preceding part.'),
 '7': ('hard', 'Weigh numerical, practical and environmental trade-offs against a specific driver\'s needs.'),
}
def url(name): return f'assets/appsci/{PAPER}/{name}.webp'
def regions(rows):
 return [{'page': p, 'bbox': [round(34/pdf[p-1].rect.width,6),round(y0/pdf[p-1].rect.height,6),round(550/pdf[p-1].rect.width,6),round(y1/pdf[p-1].rect.height,6)]} for p,y0,y1 in rows]
def render(name,rows):
 imgs=[]
 for p,y0,y1 in rows:
  page=pdf[p-1]; assert page.rotation == 0 and page.cropbox == page.mediabox
  pix=page.get_pixmap(matrix=fitz.Matrix(2,2),clip=fitz.Rect(34,y0,550,y1),alpha=False)
  imgs.append(Image.frombytes('RGB',(pix.width,pix.height),pix.samples))
 canvas=Image.new('RGB',(max(i.width for i in imgs),sum(i.height for i in imgs)),'white')
 y=0
 for im in imgs: canvas.paste(im,(0,y)); y += im.height
 out=io.BytesIO(); canvas.save(out,'WEBP',lossless=True,method=6,exact=True); b=out.getvalue()
 assets[name+'.webp']={'sha256':hashlib.sha256(b).hexdigest(),'base64':base64.b64encode(b).decode()}
 return url(name)
qs=[]
for label,marks,question,scheme,context,preview,tag in units:
 import re
 q=re.match(r'\d+',label).group(); suffix=label[len(q):].replace('(','_').replace(')','') or '_W'
 uid=f'{PAPER}_Q{int(q):02}{suffix}'
 own=render(uid+'_question',question); sch=render(uid+'_scheme',scheme)
 ctx={}
 if context: ctx['stem_image_url']=render(uid+'_context',context)
 u={'question_id':uid,'parent_question_id':f'{PAPER}_Q{int(q):02}','source_type':'real_past_paper','is_sample':False,'paper_id':PAPER,'subject_id':'OCR_L3_APPSCI_AAQ','board':'OCR','level':'Level 3','subject':'Applied Science','spec_code':'H151','qualification_code':'H151','is_as':False,'is_official_sample':True,'subject_category':'STEM','year':None,'series':'Sample','component':'F181','question_number':q,'part_label':label[len(q):], 'marks':marks,'estimated_minutes':max(1,round(marks*1.5)), 'difficulty':'medium','introduced_year':12,'primary_spec_points':['OCR_L3SCI_F181_'+{'1':'BIO','2':'DATA','3':'DEV','4':'COMMS'}[tag[0]]+'_'+tag], 'crossover_spec_points':[], 'preview_text':preview,'include_in_custom_pool':True,'extended_response': q=='7','content':{'question_html':'','question_image_url':own,'mark_scheme_html':'','mark_scheme_image_url':sch},'scheme_scope':'part','scheme_question_number':label,'context':ctx,'provenance':{'review_status':'model_reviewed','reviewer_type':'model','question_source_sha256':SHA,'scheme_source_sha256':SHA,'source_url':URL,'question_source_url':URL,'scheme_source_url':URL,'difficulty_basis':'model judgement, not an OCR rating','source_revision':'Version 3.0 (September 2025)','source_regions':regions(question),'scheme_regions':regions(scheme),'context_regions':regions(context),'original_parts':[label],'part_scheme_check':'verified','render_scale':2,'coordinate_system':'CropBox, zero rotation, 1-indexed pages'}}
 if not u['part_label']: del u['part_label']
 if label=='7': u['crossover_spec_points']=['OCR_L3SCI_F181_DATA_2.4.1']
 u['difficulty'], u['provenance']['difficulty_basis'] = DIFFICULTIES[label]
 if label=='6(b)(iv)': u['depends_on_question_ids']=[f'{PAPER}_Q06_b_iii']
 qs.append(u)
assert sum(q['marks'] for q in qs)==33
BLOCKED=[('1(a)(ii)',2,'Matching Source A extract: original site differs and reuse rights unconfirmed.'),('1(b)(i)',1,'Matching Source A extract: original site differs and reuse rights unconfirmed.'),('1(c)',1,'Matching Source A extract: original site differs and reuse rights unconfirmed.'),('2(c)',1,'Source B withheld from public insert.'),('2(d)',2,'Source B withheld from public insert.'),('3(a)',1,'Source B withheld from public insert.'),('4',9,'Requires both Source A and withheld Source B.')]; assert sum(x[1] for x in BLOCKED)==17
paper={'paper_id':PAPER,'paper_type':'real_past_paper','subject_id':'OCR_L3_APPSCI_AAQ','board':'OCR','level':'Level 3','subject':'Applied Science','spec_code':'H151','qualification_code':'H151','year':None,'series':'Sample','paper_code':'F181','title':'Official sample · H151 F181: Science in society (available questions)','total_marks':50,'available_marks':33,'duration_minutes':75,'is_as':False,'is_official_sample':True,'question_ids':[q['question_id'] for q in qs], 'official_source_url':None,'full_paper_pdf_url':None,'full_mark_scheme_pdf_url':None,'incomplete':True,'coverage_status':'partial','practice_coverage_note':'33 of 50 marks available: seven source-dependent parts are blocked because the matching insert is incomplete or its third-party reuse rights are unconfirmed.','excluded_questions':[{'question_number':label,'marks':marks,'reason':reason} for label,marks,reason in BLOCKED]}
pack={'pack_id':'ocr_f181_sample','papers':[paper],'questions':qs}
(ROOT/'data/packs/appsci'/f'{PAPER}.json').write_text(json.dumps(pack,indent=2,ensure_ascii=False)+'\n')
(ROOT/'data/appsci-assets'/f'{PAPER}.json').write_text(json.dumps({'format':'lossless-webp-catalogue-v1','paper_id':PAPER,'assets':assets},separators=(',',':'))+'\n')
print(len(qs),sum(q['marks'] for q in qs),len(assets))
