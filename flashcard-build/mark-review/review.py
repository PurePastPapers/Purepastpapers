import json,csv,re,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
orig=json.loads((root/'mark-original.json').read_text()); cards=json.loads((root/'mark-candidate.json').read_text()); assert len(orig)==len(cards)==92
for o,c in zip(orig,cards):
 for k in ['front','stable_key','catalogue_card_id','catalogue_id']: assert o[k]==c[k],(k,c['front'])
for c in cards:
 c['tags']=[t for t in c['tags'] if not (t.startswith('PPP::Spec::') or t in ('PPP::Class::direct','PPP::Class::support') or re.match(r'AQA_(?:PSYCH|SOC)_',t))]
 if 'Common trap' not in c['back']:
  c['back']+='<p><strong>Common trap</strong></p><p>Do not omit the explanation linking the response to the question.</p>'
# Exclude 42, which does not establish the perceived hostility the model answer assumes.
reviewed=[c for i,c in enumerate(cards) if i!=42]
(root/'mark-reviewed.json').write_text(json.dumps(reviewed,indent=2,ensure_ascii=False)+'\n')
psy='https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-71821-MS-JUN24_PDF'
soc='https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-71921-MS-JUN24_PDF'
pspec='https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification/subject-content/introductory-topics-in-psychology'
math='https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification/mathematical-requirements-and-exemplifications'
sspec='https://www.aqa.org.uk/subjects/sociology/a-level/sociology-7192/specification/scheme-of-assessment'
verified={4:(psy+' p. 7; '+pspec+' section 3.1.1','Minority influence content corroborated'),44:(psy+' pp. 10–11; '+pspec+' section 3.1.2','Post-event discussion corroborated'),45:(psy+' pp. 15–16; '+pspec+' section 3.1.4','Two-process model corroborated'),61:(psy+' pp. 13–14; '+pspec+' section 3.1.3','Romanian adoptees evaluation corroborated'),65:(soc+' p. 5','Six-mark outline three scoring corroborated; invented example assessed independently'),70:(soc+' p. 4','Four-mark outline two format corroborated for this example'),78:(soc+' p. 5','Six-mark outline three scoring corroborated'),88:(soc+' p. 4','Four-mark outline two scoring corroborated; material example assessed independently')}
for i in [65,88]: verified.pop(i)
for i in [25,30,35,49,62]: verified[i]=(math+' section 6; arithmetic independently recalculated','Arithmetic checked; data are invented, not from a board paper')
with (root/'mark-review'/'sources.tsv').open('w') as f:
 w=csv.writer(f,delimiter='\t');w.writerow(['stable_key','source','verified','note'])
 for i,c in enumerate(cards):
  if i in verified: u,n=verified[i];yes='yes'
  elif i==42: u='https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification/subject-content/issues-and-options-in-psychology section 3.3.9';yes='no';n='Excluded: scenario does not establish perceived hostility.'
  else:u=pspec if i<64 else sspec;yes='no';n='Source opened but individual model and marking points not yet verified.'
  w.writerow([c['stable_key'],u,yes,n])
print('retained',len(reviewed),'verified',len(verified),'unverified',92-len(verified))
