#!/usr/bin/env python3
"""Rebuild the private F180 candidate pack and lossless catalogue from OCR SAM v4.

The result is deliberately not added to the production pack index. The caller must
resolve Applied Science republication rights before release. Third-party Q11(a)
is excluded entirely, including its image bytes. SOURCE must match the manifest hash.
"""
import argparse, base64, hashlib, json, math, re
from io import BytesIO
from pathlib import Path
import fitz
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
PID = 'OCR_F180_SAMPLE'
SHA = '1c7742760f60fdcb7ad62734ad53bbc989ef49a72a1bb409cd04182a2350b616'
SOURCE = 'https://www.ocr.org.uk/Images/697859-fundamentals-of-science.pdf'
DATA = 'https://www.ocr.org.uk/Images/745348-fundamentals-of-science-data-formulae-and-relationships-booklet.pdf'
# Reviewed mappings use the scoped, official specification identifiers.
TAGS = {
'1_a_i':('B1.1.1',[], 'Compare bacterial and plant cell structures.'),
'1_a_ii':('B1.1.1',['B2.1.1'], 'Match cyanobacterial structures to chloroplast components.'),
'1_b':('B1.2.1',[], 'Compare scanning and transmission electron microscopy.'),
'2_a':('B2.2.1',['B1.1.1'], 'Identify mitochondrial structures involved in aerobic respiration.'),
'2_b_i_ii':('B1.1.2',[], 'Calculate a mean and percentage difference for sperm-cell mitochondria.'),
'2_b_iii':('B1.1.2',['B2.2.2'], 'Explain the effect of fewer mitochondria on sperm cells.'),
'3_a_i':('B3.1.3',[], 'Describe dipeptide formation.'),
'3_a_ii':('B3.1.3',[], 'Identify secondary protein structure.'),
'3_b_i':('B4.2.1',[], 'Evaluate random sampling.'),
'3_b_ii':('B4.1.1',[], 'Identify a climatic abiotic factor.'),
'4_a_i':('C1.1.1',[], 'Explain isotopes using sulfur isotopes.'),
'4_a_ii':('C1.1.1',[], 'Calculate relative atomic mass from isotope abundances.'),
'4_b':('C1.1.1',[], 'Complete the electron configuration of sulfur.'),
'5_a_i_ii':('C2.1.1',['C2.1.6'], 'Calculate moles and gas volume from decomposing calcium carbonate.'),
'5_b':('C2.1.4',[], 'Explain the reaction between calcium carbonate and nitric acid.'),
'6_a_i':('C3.1.1',[], 'Define a covalent bond.'),
'6_a_ii':('C3.1.1',[], 'Draw a dot-and-cross diagram of a carbonate ion.'),
'6_b':('C3.2.1',[], 'Identify a structure from its physical properties.'),
'6_c':('C3.1.2',[], 'Identify the formula of aluminium nitrate.'),
'7_a':('C4.1.1',[], 'Explain activation energy.'),
'7_b':('C4.1.1',[], 'Use a Boltzmann distribution to explain catalysis.'),
'8_a':('C2.1.2',['C3.3.1'], 'Balance the equation for ethanol combustion.'),
'8_b':('C3.3.1',[], 'Explain an advantage of ethanol as a fuel.'),
'8_c':('C3.3.1',[], 'Draw the displayed formula of butanal.'),
'9_a':('P1.1.2',[], 'Define potential difference.'),
'9_b_i':('P2.1.3',[], 'Calculate the work done to lift a mass.'),
'9_b_ii_c':('P2.1.4',['P1.1.3','P1.1.1'], 'Calculate crane input power and motor current.'),
'10_a':('P3.1.3',[], 'Explain X-ray production in an X-ray tube.'),
'10_b':('P3.2.1',[], 'Order nuclear radiations by mass.'),
'10_c':('P3.2.3',[], 'Explain indirect DNA damage by nuclear radiation.'),
'10_d':('P3.2.4',['P3.2.1'], 'Explain selection of a radionuclide for radiotherapy.'),
'11_b_i':('B1.2.2',[], 'Calibrate an eyepiece graticule.'),
'11_b_ii':('B1.2.2',[], 'Explain variation in measured white blood-cell widths.'),
'11_b_iii':('B1.2.2',[], 'Improve an estimate of white blood-cell width.'),
}

EASY = {'1_a_i','1_b','2_a','3_a_ii','3_b_ii','4_a_i','4_b','5_b','6_a_i','6_b','6_c','7_a','8_b','8_c','9_a','10_b'}
HARD = {'9_b_ii_c','10_c','10_d'}

def crop(doc, regions, scheme):
    x0,x1=(48,550) if scheme else (30,570)
    images=[]
    for page,y0,y1 in regions:
        pg=doc[page-1]
        if pg.rotation or abs(pg.rect.width-595.32)>1 or abs(pg.rect.height-841.92)>1:
            raise ValueError(f'unexpected page geometry: {page}')
        pix=pg.get_pixmap(matrix=fitz.Matrix(2,2),clip=fitz.Rect(x0,y0,x1,y1),alpha=False)
        images.append(Image.open(BytesIO(pix.tobytes('png'))).convert('RGB'))
    canvas=Image.new('RGB',(max(x.width for x in images),sum(x.height for x in images)+12*(len(images)-1)),'white')
    y=0
    for im in images:
        canvas.paste(im,(0,y));y+=im.height+12
    b=BytesIO();canvas.save(b,format='WEBP',lossless=True,method=6)
    encoded=b.getvalue()
    # The lossless WebP must decode to the exact rendered pixels.
    decoded=Image.open(BytesIO(encoded)).convert('RGB')
    if decoded.tobytes()!=canvas.tobytes(): raise ValueError('lossless round trip failed')
    return encoded

def regions(items,scheme=False):
    x0,x1=(48,550) if scheme else (30,570)
    return [{'page':p,'bbox':[round(x0/595.32,6),round(y0/841.92,6),round(x1/595.32,6),round(y1/841.92,6)]} for p,y0,y1 in items]

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('source',type=Path);ap.add_argument('--output-root',type=Path,default=REPO);a=ap.parse_args()
    if hashlib.sha256(a.source.read_bytes()).hexdigest()!=SHA: raise ValueError('Source checksum mismatch')
    m=json.loads((HERE/'f180-regions.json').read_text());doc=fitz.open(a.source)
    assert len(doc)==39 and m['source_sha256']==SHA
    allowed=[p for p in m['parts'] if not p.get('blocked')]
    assert len(allowed)==34 and sum(p['marks'] for p in allowed)==65
    assert set(TAGS)=={p['id'] for p in allowed}
    all_spec=json.loads((REPO/'data/specs/OCR_L3_APPSCI_AAQ.json').read_text())
    ids={p['id'] for s in all_spec['sections'] for t in s['topics'] for p in t['points']}
    assets={};questions=[]
    for p in allowed:
        key=p['id'];qnum=key.split('_')[0];components=key.split('_')[1:]
        if key in ('2_b_i_ii','5_a_i_ii'): label='(b)(i)–(ii)' if qnum=='2' else '(a)(i)–(ii)'
        elif key=='9_b_ii_c': label='(b)(ii) and (c)'
        else: label=''.join(f'({c})' for c in components)
        qid=f'{PID}_Q{int(qnum):02d}_'+'_'.join(components)
        urls={}
        for kind,field in [('q','q'),('ms','ms'),('context','context')]:
            if not p.get(field): continue
            name=f"Q{int(qnum):02d}_{'_'.join(components)}_{kind}.webp"
            data=crop(doc,p[field],kind=='ms')
            assets[name]={'sha256':hashlib.sha256(data).hexdigest(),'base64':base64.b64encode(data).decode()}
            urls[kind]=f'assets/appsci/{PID}/{name}'
        main,cross,preview=TAGS[key]
        primary=['OCR_L3SCI_'+main]; crossover=['OCR_L3SCI_'+s for s in cross]
        assert all(s in ids for s in primary+crossover),(key,primary,crossover)
        context={'official_resources':[{'kind':'resource_booklet','label':'Data, Formulae and Relationships Booklet','url':DATA}]}
        if 'context' in urls: context['stem_image_url']=urls['context']
        question={'question_id':qid,'parent_question_id':f'{PID}_Q{int(qnum):02d}','source_type':'real_past_paper','is_sample':False,
          'paper_id':PID,'subject_id':'OCR_L3_APPSCI_AAQ','board':'OCR','level':'Level 3','subject':'Applied Science',
          'spec_code':'H151','qualification_code':'H151','eligible_qualification_codes':['H051','H151'],'is_official_sample':True,
          'subject_category':'STEM','year':None,'series':'Sample','component':'F180','question_number':qnum,'part_label':label,
          'marks':p['marks'],'estimated_minutes':max(1,math.ceil(p['marks']*90/70)), 'difficulty':'easy' if key in EASY else 'hard' if key in HARD else 'medium','introduced_year':12,
          'primary_spec_points':primary,'crossover_spec_points':crossover,'preview_text':preview,'include_in_custom_pool':True,
          'extended_response':False,'content':{'question_html':'','question_image_url':urls['q'],'mark_scheme_html':'','mark_scheme_image_url':urls['ms']},
          'scheme_scope':'part','scheme_question_number':qnum+label,'context':context,
          'provenance':{'review_status':'model_reviewed','reviewer_type':'model','question_source_sha256':SHA,'scheme_source_sha256':SHA,
            'question_source_url':SOURCE,'question_revision':'Version 4.0 (September 2025)',
            'source_regions':regions(p['q']),'context_regions':regions(p.get('context',[])),'scheme_regions':regions(p['ms'],True),
            'original_parts': ({'2_b_i_ii':['2(b)(i)','2(b)(ii)'], '5_a_i_ii':['5(a)(i)','5(a)(ii)'], '9_b_ii_c':['9(b)(ii)','9(c)']}.get(key, [qnum+label])), 'difficulty_basis':'Model judgement of recall, reasoning and calculation demand; not teacher calibrated',
            'context_basis':p.get('dependency','Independent unit; printed context preserved where required'),
            'extraction_version':'appsci-f180-regions-v1'}}
        questions.append(question)
    paper={'paper_id':PID,'paper_type':'real_past_paper','subject_id':'OCR_L3_APPSCI_AAQ','board':'OCR','level':'Level 3',
      'subject':'Applied Science','spec_code':'H151','qualification_code':'H151','eligible_qualification_codes':['H051','H151'],
      'year':None,'series':'Sample','paper_code':'F180','title':'Official sample · F180: Fundamentals of science',
      'total_marks':70,'available_marks':65,'coverage_status':'partial','incomplete':True,
      'practice_coverage_note':'65 of 70 marks are available. Question 11(a) is excluded because it requires a third-party photomicrograph; its magnification part also depends on the original physical print size.',
      'duration_minutes':90,'is_official_sample':True,
      'question_ids':[q['question_id'] for q in questions],'data_sheet_url':DATA,
      'assessment_resources':[{'kind':'resource_booklet','label':'Data, Formulae and Relationships Booklet','url':DATA}],
      'section_totals':{'Biology':20,'Chemistry':20,'Physics':20,'Practicals':10},
      'excluded_questions':[{'question_number':'11','part_label':'(a)(i)','marks':2,'reason_type':'third_party_rights_unconfirmed','reason':'The question requires a Getty Images photomicrograph; separate rights are unconfirmed.'},
        {'question_number':'11','part_label':'(a)(ii)','marks':3,'reason_type':'third_party_rights_unconfirmed','reason':'The question requires the credited photomicrograph and faithful physical print size.'}],
      'source_documents':{'question_paper':{'url':SOURCE,'sha256':SHA,'pages':[1,20],'last_question_page':16,'revision':'Version 4.0 (September 2025)'},
        'mark_scheme':{'url':SOURCE,'sha256':SHA,'pages':[21,33]},'bundled_data_booklet':{'url':SOURCE,'sha256':SHA,'pages':[34,39]},
        'standalone_data_booklet':{'url':DATA,'sha256':'bc097fcc7c9e366045d81fe7d89dc686b59453afcb410cc5e95aa225b5ec8e36','pages':[1,6]}}}
    pack={'pack_id':'ocr_f180_sample','papers':[paper],'questions':questions}
    pp=a.output_root/'data/packs/appsci'/f'{PID}.json';cp=a.output_root/'data/appsci-assets'/f'{PID}.json'
    pp.parent.mkdir(parents=True,exist_ok=True);cp.parent.mkdir(parents=True,exist_ok=True)
    pp.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
    cp.write_text(json.dumps({'format':'lossless-webp-catalogue-v1','paper_id':PID,'assets':assets},separators=(',',':'))+'\n')
    print(f'{len(questions)} units, {sum(q["marks"] for q in questions)} marks, {len(assets)} lossless assets; NOT INDEXED')
if __name__=='__main__': main()
