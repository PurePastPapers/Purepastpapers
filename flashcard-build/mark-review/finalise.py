import csv,json,pathlib,re
r=pathlib.Path(__file__).resolve().parent.parent
orig=json.loads((r/'mark-original.json').read_text()); x=json.loads((r/'mark-candidate.json').read_text())
# Source locations refer to the pages of the actual AQA PDFs opened in review.
p1='https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-71821-MS-JUN24_PDF'
p2='https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-71822-MS-JUN23.PDF'
p3='https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2022/june/AQA-71823-MS-JUN22.PDF'
s1='https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-71921-MS-JUN24_PDF'
math='https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification/mathematical-requirements-and-exemplifications'
sc='https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification/scheme-of-assessment'
verified={
 1:(p2+' pp. 18–19','Stratified sampling and representativeness.'),
 4:(p1+' p. 7','Minority influence: consistency and flexibility.'),
 5:(p2+' p. 20','Spearman for ordinal association.'),
 21:('https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-71823-MS-JUN23.PDF pp. 3–4','Androcentrism; cultural claim is explicitly conditional.'),
 25:(math+' section 6','Independently recomputed population SD sqrt(8/3).'),
 30:(math+' section 6','Independently recomputed 18/60 = 3/10 = 30%.'),
 31:(sc+' section 4.0','Extended response: coherent, relevant, substantiated line of reasoning.'),
 35:(math+' section 6','Independently recomputed mean 5, median 4, mode 4, range 7.'),
 43:(p3+' p. 3','Wilcoxon for difference, related design and ordinal scores.'),
 44:(p1+' pp. 10–11','Post-event discussion and memory contamination.'),
 45:(p1+' pp. 15–16','Two-process model: classical and operant conditioning.'),
 49:(math+' section 6; '+ 'https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification/subject-content/psychology-in-context section 3.2.3','Independently recomputed +6, −2, ties 2, s=2, N=8.'),
 61:(p1+' pp. 13–14','Romanian adoptee study and recovery limitations.'),
 62:(math+' section 6','Independently recomputed 5/10 = 50%.'),
 63:(p2+' p. 22','Informed consent, protection from harm and withdrawal.'),
 70:(s1+' p. 4','Outline two: two clearly developed points in this example.'),
 78:(s1+' p. 5','Outline three: distinct, developed points in this example.')}
verified.pop(21)  # AQA source establishes androcentrism, not the full conditional cultural-bias claim.
traps={1:'Do not treat a convenient sample as representative of the whole sixth form.',5:'Do not infer causation from a correlation.',25:'Do not divide by N−1 when the question specifies the population procedure.',30:'Do not use 18 as the denominator.',31:'Do not substitute a memorised topic summary for an argument answering the question.',35:'Do not use the largest score as the range.',43:'Do not choose an unrelated test for the same participants.',62:'Do not divide the frequency for B by the number of categories.',63:'Do not assume that a partial explanation secures informed consent.'}
kept=[]; quarantine=[]
for i,c in enumerate(x):
 for k in ('front','stable_key','catalogue_card_id','catalogue_id'): assert c[k]==orig[i][k]
 c['tags']=[t for t in c['tags'] if not (t.startswith('PPP::Spec::') or t in ('PPP::Class::direct','PPP::Class::support') or re.match(r'AQA_(?:PSYCH|SOC)_',t))]
 if i in verified:
  if 'Common trap' not in c['back']:
   if i not in traps: quarantine.append((i,c));continue
   c['back']+='<p><strong>Common trap</strong></p><p>'+traps[i]+'</p>'
  kept.append(c)
 else: quarantine.append((i,c))
(r/'mark-reviewed.json').write_text(json.dumps(kept,indent=2,ensure_ascii=False)+'\n')
(r/'mark-review'/'quarantined.json').write_text(json.dumps([c for i,c in quarantine],indent=2,ensure_ascii=False)+'\n')
with (r/'mark-review'/'sources.tsv').open('w') as f:
 w=csv.writer(f,delimiter='\t');w.writerow(['stable_key','source','verified','verdict'])
 for i,c in enumerate(x):
  if i in verified and not any(j==i for j,_ in quarantine):u,n=verified[i];w.writerow([c['stable_key'],u,'yes','retained: '+n])
  else:
   source=(p1+'; '+p2+'; '+p3 if i<64 else s1+'; https://filestore.aqa.org.uk/resources/sociology/AQA-71922-SMS.PDF')
   note='quarantined: source search did not establish every substantive claim or a specific marking point'
   if i==42:note='quarantined: scenario does not establish perceived hostility needed for hostile attribution bias'
   if i in (86,87):note='quarantined: back refers to a specific past paper, contrary to brief'
   w.writerow([c['stable_key'],source,'no',note])
print('retained',len(kept),'quarantined',len(quarantine))
