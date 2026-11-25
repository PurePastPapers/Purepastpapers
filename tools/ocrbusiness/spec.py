#!/usr/bin/env python3
"""Build OCR Cambridge Technical Level 3 Business Unit 1-3 topic specs.

The tree follows the printed teaching-content tables in OCR unit PDFs. The
right-hand exemplification column is retained separately from examinable
teaching content. Run from any directory with --repo and --sources arguments.
"""
import argparse
import hashlib
import json
from pathlib import Path

TODAY = "2026-11-25"
SUBJECT = "OCR_L3_BUS_CTEC"
PREFIX = "OCR_L3BUS"
UNITS = [
    {"number": 1, "name": "The business environment", "code": "A/507/8148", "glh": 120, "assessment": "external", "file": "294523", "sha": ""},
    {"number": 2, "name": "Working in business", "code": "F/507/8149", "glh": 60, "assessment": "external", "file": "294526", "sha": ""},
    {"number": 3, "name": "Business decisions", "code": "T/507/8150", "glh": 60, "assessment": "external_optional", "file": "505660", "sha": ""},
]

# Each entry is (printed teaching-content code, exact heading, teaching content,
# OCR exemplification). Lists preserve the official examples and i.e. detail.
DATA = {
1: [
 ("1.1", "different types of business activity", ["primary", "secondary", "tertiary"], "To include purposes, key features and examples of each type."),
 ("1.2", "different sectors of operation", ["private", "public", "third sector"], "To include key features and examples for each sector."),
 ("1.3", "different forms of legal business ownership", ["sole trader", "partnership", "private limited company", "public limited company", "state/government owned", "charity/not-for-profit", "community interest companies (CIC)"], "To include advantages and disadvantages of each form of legal ownership and the most appropriate form of ownership for a particular business."),
 ("1.4", "factors which inform business ownership", ["legal status", "liability", "funding", "control/decision making", "legal/administrative requirements"], "To include the most appropriate form of legal ownership for a particular business."),
 ("1.5", "differing business aims and objectives", ["survival", "financial: break-even; increase revenue; reduce cost; make profit", "growth: physical expansion; increase in market share; increase provision", "reputation (e.g. quality, offering value for money, being ethical, social responsibility, being environmentally friendly)", "being enterprising (e.g. own boss, pursue own interests, being competitive)"], "To include the appropriateness of the objectives of a business."),
 ("2.1", "key tasks of functional areas of businesses", ["finance", "marketing", "sales", "human resources (HR)", "operations management", "customer services", "business support services", "research and development", "purchasing/procurement"], "Different businesses may use other names: Finance may be Accounting; Business Support Services may be IT or Administration; HR may be Personnel; Operations Management may be Production. Tasks are limited to key activities: finance—financial control and record keeping; marketing—promoting the business using different relevant media, including social media; sales—selling products/services; HR—planning recruitment, redundancies, remuneration and reward systems; operations management—converting inputs to outputs; customer services—liaising with customers, managing expectations and resolving queries; business support service—managing resources, maintaining equipment, providing IT and administrative support; research and development—developing new products/services in response to research findings; purchasing/procurement—sourcing and providing materials or services."),
 ("2.2", "how business functions interrelate with other business functions", [], "To include consequences of poor interrelationships. For example, sales activity may affect operations if output must increase; failure to tell operations about likely sales growth may leave insufficient products."),
 ("3.1", "different organisational structures", ["flat structures", "hierarchical/tall structures", "centralised", "decentralised", "matrix"], "To include organisation by function, product/service, geographic location."),
 ("3.2", "elements of organisational structures", ["division of work", "span of control", "chain of command"], "In large organisations, subtasks are often distributed to functional areas such as operations management, finance or marketing."),
 ("3.3", "how the elements of organisational structures impact on business operations", ["communication paths", "accountability, authority and responsibility", "delegation", "empowerment"], "Implications include: authority can be delegated; responsibility cannot. Span of control may increase if chain of command is shorter or a flat structure is adopted. Include advantages and disadvantages of different structures and appropriateness of a structure for a business."),
 ("3.4", "the use of organisation charts to show", ["elements of the organisational structure", "status of different levels of job role: chief executive; directors; managers; supervisors; assistants/operatives"], "Include reporting status (upwards) and command status (downwards), and awareness of key tasks associated with each job role."),
 ("4.1", "what is meant by the terms", ["cost (including fixed and variable costs)", "revenue", "cash flow", "net cash flow", "profit", "break-even", "margin of safety"], "Include definitions and examples. Learners should understand the difference between revenue, profit and cash flow."),
 ("4.2", "how to calculate", ["profit/loss", "break-even point/output"], "Profit = revenue − cost. Break-even output = fixed costs/(selling price − variable cost). Graphical analysis is not required."),
 ("4.3", "how to interpret financial statements", ["income statement", "statement of financial position", "cash flow statement", "cash flow forecast"], "Include description of components and data analysis. A cash flow statement records actual cash inflows and outflows; a cash flow forecast is a prediction. Statement of financial position interpretation is limited to comparisons between different time periods. Include recommendations for future success."),
 ("5.1", "who the main stakeholders are and their objectives", ["internal stakeholders", "external stakeholders"], "A stakeholder is a person, group or organisation with an interest in a business because they are affected, or may be affected, by its activities. Internal stakeholders include owners (sole trader, partners), employees (e.g. chief executive, directors, managers, supervisors, assistants) and trade unions. External groups include shareholders, customers, suppliers, potential investors, lenders, local community, pressure groups, and central/local government (e.g. HMRC, environmental health, planning department). Include internal and external objectives; employee objectives may include job security, pay and benefits, rewards and recognition."),
 ("5.2", "the ways in which different stakeholder groups attempt to alter business behaviour", [], "Consider practical examples from real businesses (e.g. an environmental pressure group may protest about expansion plans, causing negative publicity and a customer boycott or denial of planning permission)."),
 ("5.3", "how businesses respond to different and sometimes conflicting stakeholder objectives", [], "Include how degree of stakeholder influence may determine the response; conflict resolution/management; and benefits and drawbacks of meeting stakeholder needs."),
 ("5.4", "the consequences to a business of not listening to its stakeholders", [], "Include not listening to specific stakeholder groups or an individual stakeholder (e.g. local residents or the business owner)."),
 ("6.1", "the factors which comprise the external business environment", ["social factors", "technological factors", "economic factors: interest rates; exchange rates; inflation; unemployment; taxation", "environmental factors", "political factors", "legal factors: impact of current legislation on business operations; business framework (Companies Act, Partnership Act); consumer protection (Sale and Supply of Goods Act, Supply of Goods and Services Act, Consumer Protection Act); employee protection (Equality Act, Health and Safety at Work Act, Working Time Directive, National Minimum Wage Act); Data Protection Act; Copyright, Designs and Patents Act; planning permission; implications of failing to meet legal requirements", "ethical factors: ethical conduct as an employer (e.g. not exploiting workforce, no child labour, pay above minimum wage/living wage, fair working practices); as a trader (e.g. fair trade, fair prices); environmentally friendly (e.g. waste management, recycling, carbon emissions, transport miles, energy use); sustainability (e.g. fossil fuels, land management, green energy); CSR activities (e.g. charity donations, humanitarian aid, health/welfare schemes, sponsorship of sport/educational/cultural events); impact of operating ethically and consequences of not operating ethically", "competitor factors"], "Include social factors such as demographic issues, attitudes to work, disposable income, social trends and cultural beliefs; technology such as automation, communication, purchasing/sales and mobile; environmental issues such as energy management, carbon emissions, waste reduction, recycling and pollution; political instability, change of government and government initiatives. For legal factors include the purpose and main provisions of itemised legislation; current legislation means the specified legislation or its revised/equivalent version during the qualification. Failure to comply has legal (e.g. fine) and non-legal (e.g. reputational) implications. Ethical means doing what is morally right above what law requires. Include ways a specific business can improve its ethical profile (e.g. a restaurant buying fair trade products), and positive and negative impacts of operating and not operating ethically. Competitive factors include strength of competition, market shares of business and competitors, competitor behaviour and market position."),
 ("6.2", "to identify how the external environment can impact on a business and its stakeholders", [], "Include positive and negative impacts on a business and its stakeholders."),
 ("6.3", "how businesses can respond to changes in their external environment", [], "Include advantages and disadvantages of responses, including seizing opportunities and dealing with threats."),
 ("7.1", "why businesses plan", ["survive/avoid business failure", "develop business ideas and where ideas come from (e.g. problem solving, innovation, accidental discovery, employees, inventors, entrepreneurs)", "avoid unnecessary risk; attitude to risk and uncertainty", "meet objectives"], "Survival includes why businesses fail (e.g. flawed plans, poor financial control, lack of market/competition knowledge, no clear USP, concentration risk such as reliance on one major customer). Attitude to risk may include willingness to take risk or being risk averse."),
 ("7.2", "to determine appropriate sources of finance for businesses", ["savings", "reserves", "overdraft", "loan", "mortgage", "credit card", "hire purchase", "trade credit", "venture capitalist", "share issue", "crowd-funding"], "Include internal/external and short/long-term sources, advantages and disadvantages, and appropriateness to a specific business."),
 ("7.3", "what may be included in a business plan", ["identification of a product or service", "unique selling point", "how to protect a product/service", "prioritisation of business objectives", "market research results, including competitor analysis", "financial requirements (e.g. cash flow forecast, sources of finance to approach)", "resource requirements (e.g. finance, number and skills of employees, premises and location)"], "Include what a business plan can be used for and who may wish to see one."),
 ("8.1", "factors affecting the success/failure of a business", ["financial", "non-financial", "short-term", "long-term"], "Include past and present success/failure."),
 ("8.2", "how to conduct a SWOT (Strengths, Weaknesses, Opportunities and Threats) analysis", [], "SWOT assesses a business’ current position. Strengths and weaknesses are internal and within control; opportunities and threats are external and must be managed."),
 ("8.3", "how to interpret business performance", ["financial analysis", "assessment of non-financial data", "comparison with organisational objectives", "comparison with industrial averages", "comparison with similar businesses", "trends over time", "methods to improve performance"], "Include assessing current performance against past performance and assessing different measurements of current performance. Industrial averages may include benchmarking. Methods should include specific recommendations for future objectives."),
],
2: [
 ("1.1", "the authority protocols", ["authority in the workplace for decision making (e.g. when to escalate a complaint)", "authority in the workplace for authorisation (e.g. signing letters, payment authorisation)", "reasons for authority protocols"], "Link to job roles and organisation charts; explain chain of command and levels of authority."),
 ("1.2", "the confidentiality protocols", ["organisational procedures to maintain confidentiality", "storage of data and documentation: manual; electronic", "implications of breaching confidentiality", "reasons why confidentiality may need to be breached"], "Include how and why confidentiality is maintained, benefits/drawbacks and importance to individual and organisation. Practical procedures include limiting access, need-to-know basis, IT systems and bcc."),
 ("1.3", "the constraints on document content", ["voluntary: organisational; ethical; codes of practice", "legislation: copyright; data protection; consumer protection; equal opportunities"], "Include avoidance of plagiarism and need to quote sources."),
 ("1.4", "the checking protocols", ["checking documents", "checking arrangements", "implications of poor checking"], "Include self/other checks for accuracy, omissions and confusion. Communications about meetings, travel and accommodation must reach all necessary parties. Include how/why checks are done and benefits, drawbacks and importance."),
 ("1.5", "the IT security protocols", ["protection of information against unauthorised access", "inappropriate use of IT equipment and software"], "Include why/how data is protected (e.g. passwords, screen savers, locked files) and consequences of inappropriate use."),
 ("1.6", "the employment protocols", ["health and safety legislation", "equal opportunities legislation", "contractual obligations in contract of employment (e.g. hours, leave, paternity/maternity leave)", "minimum professional behaviour: punctuality; appearance and dress code; appropriate language"], "Minimum professional behaviour includes open and honest dealings with stakeholders/third parties (e.g. anti-bribery and corruption policy), reporting sick and staying in contact under sickness/absence policy, and suitable dress."),
 ("2.1", "the factors that influence meeting arrangements", ["meeting criteria (e.g. internal/external, urgency, priority, purpose, personnel)", "personnel availability (e.g. diary, electronic diary, calendars, scheduling software)", "venue/room (e.g. availability, location, resources, refreshments, catering, shared office space)", "resource packs (e.g. documentation, visitor badges)", "business costs (e.g. cost-effective/timely method, face-to-face or virtual, attendees)"], "Include choosing a suitable date/time from diary/calendar entries and costs. Consider telephone, video or web conference and serviced offices."),
 ("2.2", "the factors that influence business travel arrangements", ["travel criteria: destination; dates/times; personnel; special requirements", "transport timetables and schedules", "calculation and comparison of costs"], "Interpret timetables/schedules to determine whether a mode of transport (e.g. train/plane/bus) is available and suitable."),
 ("2.3", "the factors that influence business accommodation arrangements", ["accommodation criteria (e.g. location, grade, cost, meal arrangements)", "personnel requirements (e.g. room type, access, dietary requirements)", "calculation and comparison of costs"], "Include payment arrangements, car parking and transport links."),
 ("3.1", "the purpose, interpretation and completion of business documents", ["transaction documents: purchase order; invoice; credit note; statement of account", "employee documents: travel expense claim form", "other internal documents: petty cash voucher; stock requisition form; IT requisition form; reprographics requisition form"], "Documents may be paper-based or electronic. Interpret and use contents (e.g. complete a credit note in response to a complaint). Understand E&OE, T&C, COD and Terms 30 Days. Travel claims include mileage and cost calculations."),
 ("3.2", "the purpose and interpretation of other business documents", ["bank statement", "budget variance report", "delivery note", "goods received note", "payslip (including deductions, gross and net pay)", "receipt", "remittance advice", "request for repair form"], "Calculate absolute and percentage budget variance; use favourable/adverse. Tax and National Insurance calculations on payslips are not required."),
 ("3.3", "how to make payments and advantages/disadvantages of each method", ["cheque", "credit card", "debit card", "online/digital payment methods", "bank payments: paying-in slip; electronic transfer"], "Include key features, advantages and disadvantages to payer and payee (e.g. employees, suppliers, utility companies, hotels, travel companies and transport providers)."),
 ("3.4", "the purpose, completion and checking of meeting documentation", ["notice of meeting", "agenda", "minutes", "conference documentation for delegates (e.g. publicity, invitations, joining instructions, evaluation forms); staff (e.g. help sheets, attendance register); presenters (e.g. prompt cards, slides)"], "Include benefits of meeting documentation and importance of checking."),
 ("4.1", "the reasons for prioritising business tasks", ["workload", "conflicting demands on time", "importance of meeting internal/external and interim/final deadlines", "impacts of missing deadlines"], "Some deadlines are more important than others. Include impacts of missed deadlines on other business areas and reputation."),
 ("4.2", "the factors that influence task prioritisation", ["urgency", "importance", "significance of originator (e.g. line manager, customer, third party)", "interactivity of tasks", "time required", "complexity", "time commitments", "resource constraints", "diary clashes", "proximity of appointments (time/location)", "suitability for delegation"], "Encourage practical prioritisation: whether correspondence needs an urgent response, whether event locations make same-day attendance possible, whether a task can be delegated, and whether a manager should wait for requested figures."),
 ("4.3", "how to use information to inform prioritisation", ["internal sources: business objectives; stakeholder resources and budget", "external sources: changes in economy; external stakeholder requirements, feedback and availability", "data sources: numerical; graphical; tabular"], "Economic changes include exchange/interest rates. Data may include pie charts, spreadsheets, charts, tables and graphs, e.g. customer satisfaction results, sales trends and costings."),
 ("4.4", "how to assign priorities and identify appropriate actions", ["high priority", "medium priority", "low priority"], "Assign or comment on high/medium/low priority. Explain reasons to persuade others to accept the priority and agree actions."),
 ("4.5", "the need to change priorities when necessary", ["change deadlines", "delegate tasks"], "Understand that priorities sometimes must change."),
 ("5.1", "the characteristics which inform the design of business communications", ["audience (e.g. internal/external; specialist)", "purpose (e.g. inform, persuade, thank, handle complaint)", "content (e.g. complexity, numerical, graphical)", "business function (e.g. Marketing, HR)", "available resources"], "Consider design of business documentation."),
 ("5.2", "how communication design characteristics impact resource use", ["quality of paper/card", "colour or black and white", "hardcopy/electronic copy", "cost of consumables", "ease/cost of distribution", "timescales"], "Consider costs, IT, reprographics, printing, waste and environmental issues. Decide if colour printing is needed; quality may differ for internal drafts and external communications. Consumables include paper, ink, postage and typesetting."),
 ("5.3", "how and when to use different types of communication", ["formal: letter; report; notice", "verbal: telephone; message; face to face", "electronic: email; SMS/text; MMS/picture message; social media; web page; presentation slides", "marketing documents: business card; press release; promotional literature; questionnaire; data collection sheet", "recruitment documents: job description; person specification; job advertisement; application form"], "Include suitability for situation, audience, content, resource efficiency, speed, clarity and effectiveness. Standard written report elements: title, introduction, body, conclusions, recommendations, appendix and references if required."),
 ("5.4", "how to review business communications to ensure they are fit for purpose", ["type appropriate for audience", "tone", "layout/design: logo; letterhead; font; corporate colours; images", "relevance of information"], "Communications should suit purpose and audience. Review for errors and possible improvements."),
],
3: [
 ("1.1", "different types of business decision", ["strategic", "tactical", "operational"], "Include meaning, key features and examples of each type."),
 ("1.2", "different criteria used when making business decisions", ["internal: attitude to risk; organisational objectives; core competencies; internal stakeholder impact; business ethics; financial considerations; time; opportunity cost (e.g. consequences of decisions and alternatives)", "external: level and nature of risk; external stakeholder impacts; uncertainty; market changes; external environment changes"], "Different decisions give different priority to each criterion. Risk includes financial, reputation, likelihood of success, familiarity and competence (Ansoff’s Matrix). Core competencies include an overview of Hamel and Prahalad. Ethics includes business/stakeholder ethical objectives and, where appropriate, CSR. Financial considerations include availability of finance."),
 ("1.3", "the use of different types of information when making business decisions", ["internal and external", "qualitative and quantitative", "historic and forecasted", "primary and secondary research"], "Include meaning, strengths, weaknesses and examples of each information type."),
 ("1.4", "how to judge the validity of information used to make decisions", ["reliability", "bias", "relevance", "complexity", "degree of detail", "currency (up to date)", "intended use", "quality"], "Include numerical and non-numerical information."),
 ("1.5", "the purposes, benefits and importance of communication", ["communication with internal stakeholders, external stakeholders and the media", "communication before, during and after decisions are made"], "Especially communication with employees, local community, lenders and media."),
 ("1.6", "factors affecting the quality of decision-making", ["access to relevant information", "access to decision-making tools", "availability of finance", "key personnel (knowledge, skills, experience, analytical/problem-solving skills, solution focus)", "manager training in decision-making skills", "power differentials and potential bias", "consultation"], "Include seeking advice and expertise from consultancies."),
 ("2.1", "how to use profitability data", ["costs and revenues", "gross and net profit/loss", "profitability ratios: net profit ratio; gross profit ratio", "business performance data", "importance of profit/profitability"], "Include calculations and/or interpretation in context."),
 ("2.2", "how to use break-even analysis", ["draw, label and interpret a break-even graph", "calculate profit/loss at given output by graph and formula, including margin of safety", "factors affecting break-even output", "ways to lower break-even output"], "Include calculation/interpretation in context and usefulness of break-even analysis."),
 ("2.3", "how to use contribution data", ["calculate unit contribution", "significance of contribution", "special order decisions"], "Include calculation and/or interpretation in context."),
 ("2.4", "how to use cash-flow data", ["interpret cash-flow position", "ways to improve cash-flow"], "Include calculations/interpretation in context and benefits of cash-flow management."),
 ("2.5", "how to use investment appraisal", ["calculate and interpret payback period", "average rate of return (ARR)", "net present value (NPV)"], "Include interpretation, advantages/disadvantages and usefulness of each appraisal method and its data."),
 ("3.1", "factors involved in workforce planning", ["size of workforce", "skills of workforce", "availability of workforce", "training requirements: induction; on-the-job; off-the-job; internal; external"], "Include purpose and importance of workforce planning and the importance of a skills audit."),
 ("3.2", "how to use workforce performance data", ["calculate and interpret absenteeism, labour turnover, productivity and wastage", "interpret trends over time", "use industrial averages for comparison", "causes, effects and solutions for poor workforce performance"], "Explain terms and use formulae. Include benefits of calculating measures and the impact a decision would have on them."),
 ("4.1", "how to use market research information", ["types: text; data; charts and tables; graphs and pie charts", "identify data correlations", "make estimations: line of best fit; graphical extrapolation; data patterns", "use Time Series Analysis to calculate and interpret moving averages"], "Include strengths/weaknesses of information types, validity/usefulness, and information about customers, competitors and the wider business environment. Interpret in context."),
 ("4.2", "how to use marketing decision-making tools", ["Boston Matrix", "Porter’s Five Forces model", "Porter’s Generic Competitive Strategies"], "Include practical application, meaning, benefits and weaknesses of each tool."),
 ("4.3", "considerations when making marketing decisions", ["target market", "product/service features", "place/channels of distribution", "pricing", "promotion", "corporate image"], "Include product/service perception and intended audience, and how businesses create market identity."),
 ("4.4", "how constraints on marketing impact business decisions", ["legal", "ethical", "social", "financial", "time available", "corporate policy"], "Include internal and external constraints."),
 ("5.1", "issues and key tasks involved in resource management", ["physical resources (e.g. rooms, furniture, equipment)", "IT resources (e.g. computers, projectors, printers)", "inventory management: stock control charts; EPOS data; RFID"], "Include interpretation of data in context."),
 ("5.2", "how to use project management tools", ["Gantt charts", "project plan", "risk register"], "Include interpretation of data in context."),
 ("5.3", "how to use and interpret critical path analysis (CPA)", ["critical path network diagrams", "earliest start times (EST)", "latest finish times (LFT)", "float time for an activity", "identify a project’s critical path"], "Include why CPA is useful."),
 ("5.4", "how change is managed", ["causes of change: internal; external", "resistors to change", "importance of encouraging a positive workforce response", "importance and impact of change"], "Include examples of causes, resistors and responses to change."),
 ("5.5", "factors involved in contingency planning", ["purpose, importance, benefits and drawbacks of contingency planning", "how to create contingency plans"], "Suggest suitable contingencies a business could make."),
 ("6.1", "how to use business decision-making tools", ["internal organisational audit", "external business environmental audit", "competitor analysis", "stakeholder analysis", "Ansoff’s matrix"], "Use in context. Internal audit includes relevant internal factors, including attitude to risk, core competencies, portfolio analysis, market research and SWOT. Include tool strengths/limitations. External audit includes relevant financial, legal, ethical, economic, political, social, environmental and technological factors."),
 ("6.2", "how different strategies help a business achieve competitive advantage in different circumstances", ["diversification", "horizontal and vertical integration", "retrenchment", "change of strategic direction", "market entry", "change product/service provision", "change market positioning", "market growth", "mergers", "rebranding"], "Consider different circumstances, e.g. emerging, maturing and declining positions."),
 ("6.3", "how to make business decisions", ["identify issues/causes", "identify and prioritise decision-making criteria", "analyse and synthesise supporting information"], "Encourage a structured approach to making decisions."),
],
}

LOS = {
1: ["Understand different types of businesses and their objectives", "Understand how the functional areas of businesses work together to support the activities of businesses", "Understand the effect of different organisational structures on how businesses operate", "Be able to use financial information to check the financial health of businesses", "Understand the relationship between businesses and stakeholders", "Understand the external influences and constraints on businesses and how businesses could respond", "Understand why businesses plan", "Be able to assess the performance of businesses to inform future business activities"],
2: ["Understand protocols to be followed when working in business", "Understand factors that influence the arrangement of business meetings", "Be able to use business documents", "Be able to prioritise business tasks", "Understand how to communicate effectively with stakeholders"],
3: ["Understand factors to be taken into account when making business decisions", "Be able to use financial data to inform business decisions", "Understand how human resource information informs business decisions", "Understand how marketing information informs business decisions", "Be able to use resource, project and change management information to inform business decisions", "Be able to use information to make and justify business decisions"],
}

def pdf_page(unit, code):
    # OCR table page numbers are PDF pages; ranges verified against the teaching tables.
    n = unit
    ranges = {1: [("1.", 3, 4), ("2.", 5, 5), ("3.", 5, 6), ("4.", 6, 7), ("5.", 7, 8), ("6.", 8, 10), ("7.", 10, 11), ("8.", 12, 13)],
              2: [("1.", 3, 4), ("2.", 4, 5), ("3.", 5, 6), ("4.", 7, 8), ("5.", 8, 10)],
              3: [("1.", 3, 4), ("2.", 4, 5), ("3.", 5, 6), ("4.", 6, 7), ("5.", 7, 9), ("6.", 9, 10)]}
    major = code.split('.')[0] + '.'
    lo, hi = next((a, b) for prefix, a, b in ranges[n] if prefix == major)
    return list(range(lo, hi + 1))

def build(repo, sources):
    sections = []
    point_order, legacy = [], {}
    for u in UNITS:
        pdf = sources / f"{u['file']}.pdf"
        if not pdf.exists(): raise FileNotFoundError(pdf)
        u["sha"] = hashlib.sha256(pdf.read_bytes()).hexdigest()
        sec_id = f"{PREFIX}_SEC_U{u['number']}"
        topic = {"id": f"{PREFIX}_U{u['number']}", "code": str(u['number']), "title": u['name'], "kind": "unit",
                 "learning_outcomes": [], "points": []}
        for lo_n, lo_title in enumerate(LOS[u['number']], 1):
            topic["learning_outcomes"].append({"code": f"LO{lo_n}", "title": lo_title})
        for code, title, body, ex in DATA[u['number']]:
            lo_n = int(code.split('.')[0])
            pid = f"{PREFIX}_U{u['number']}_TC{code}"
            point_order.append(pid)
            point = {"id": pid, "code": code, "title": title, "kind": "topic", "learning_outcome": f"LO{lo_n}",
                     "official_reference": {"unit": f"Unit {u['number']}", "learning_outcome": f"LO{lo_n}", "teaching_content_code": code,
                                             "source_pages": pdf_page(u['number'], code), "source_file": f"{u['file']}.pdf"},
                     "content": body, "exemplification": ex}
            topic["points"].append(point)
        note = "Mandatory externally examined unit (120 GLH)." if u['number'] == 1 else ("Mandatory externally examined unit (60 GLH)." if u['number'] == 2 else "Optional externally examined unit (60 GLH); included as a reference in this qualification scope.")
        sections.append({"id": sec_id, "title": f"Unit {u['number']}: {u['name']}", "note": note, "assessment_method": "external", "glh": u["glh"], "topics": [topic]})

    # Legacy coarse leaves resolve to every official leaf within the matching
    # semantic learning outcome; old U1_1.7 is performance/official LO8.
    legacy_map = {
      "OCR_L3BUS_U1_1.1": (1, 1), "OCR_L3BUS_U1_1.2": (1, 2), "OCR_L3BUS_U1_1.3": (1, 3),
      "OCR_L3BUS_U1_1.4": (1, 4), "OCR_L3BUS_U1_1.5": (1, 5), "OCR_L3BUS_U1_1.6": (1, 6), "OCR_L3BUS_U1_1.7": (1, 8),
      "OCR_L3BUS_U2_2.1": (2, 1), "OCR_L3BUS_U2_2.2": (2, 2), "OCR_L3BUS_U2_2.3": (2, 3), "OCR_L3BUS_U2_2.4": (2, 4), "OCR_L3BUS_U2_2.5": (2, 5),
    }
    for old, (unit, lo) in legacy_map.items():
        legacy[old] = [f"{PREFIX}_U{unit}_TC{code}" for code, *_ in DATA[unit] if int(code.split('.')[0]) == lo]
    # Preserve the retired coarse points as lookup-only nodes. Runtime indexing
    # removes any section marked legacy from selectable curriculum trees while
    # still resolving saved records that refer to their original point IDs.
    old_tree = [
      (1, "The business environment", [
        ("1.1", "Types of business and their objectives"),
        ("1.2", "Functional areas of business and how they work together"),
        ("1.3", "Organisational structures"),
        ("1.4", "Financial information: costs, revenue, break-even, cash flow and accounts"),
        ("1.5", "Businesses and their stakeholders"),
        ("1.6", "External influences and constraints on business"),
        ("1.7", "Assessing business performance to inform future activities"),
      ]),
      (2, "Working in business", [
        ("2.1", "Protocols to be followed when working in business"),
        ("2.2", "Organising and arranging meetings"),
        ("2.3", "Using business documents"),
        ("2.4", "Prioritising business activities"),
        ("2.5", "Communicating effectively with stakeholders"),
      ]),
    ]
    for unit, title, old_points in old_tree:
        legacy_topic = {"id": f"{PREFIX}_U{unit}_LEGACY", "code": str(unit), "title": title,
                        "kind": "legacy", "points": []}
        for code, old_title in old_points:
            legacy_topic["points"].append({"id": f"{PREFIX}_U{unit}_{code}", "code": code, "title": old_title})
        sections.append({"id": f"{PREFIX}_SEC_U{unit}_LEGACY", "title": f"Unit {unit}: {title}",
                         "note": "Externally examined",
                         "legacy": True, "topics": [legacy_topic]})
    scope_url = "https://www.ocr.org.uk/qualifications/cambridge-technicals/business/units/"
    ev = {
      "subject_id": SUBJECT, "qualification": "Cambridge Technical Extended Certificate in Business", "qualification_number": "601/7699/4",
      "qualification_scope": {"url": scope_url, "verified_at": TODAY, "mandatory_units": ["Unit 1", "Unit 2", "Unit 4"],
       "optional_unit_selection": "Choose two 60 GLH units from Units 3, 5, 8, 11, 16, 17, 19, 20 and 21. Unit 3 is externally assessed; the other listed units are internally assessed.",
       "exam_leaf_scope": "Units 1 and 2 are mandatory examination leaves. Unit 3 leaves are included as optional externally examined reference content and are not qualification-mandatory. Unit 4 is mandatory internal assessment and is intentionally absent from examination leaves.",
       "evidence": ["OCR Units page identifies Extended Certificate, 360 GLH, QN 601/7699/4; mandatory units include Unit 1, Unit 2 and Unit 4; two 60 GLH optional units are selected from Units 3, 5, 8, 11, 16, 17, 19, 20 and 21.", "The same page identifies Unit 3 Business decisions as externally assessed (E), Unit 4 Customers and communication as internally assessed (I), and Units 5, 8, 11, 16, 17, 19, 20 and 21 as internally assessed (I)."]},
      "sources": [{"unit": f"Unit {u['number']}", "title": f"Cambridge Technicals Level 3 Business: Unit {u['number']} {u['name']}",
        "version": "Version 3; opportunities for applying learning across units updated August 2016" if u['number']==1 else ("First teaching September 2016; OCR 2015"),
        "url": f"https://www.ocr.org.uk/Images/{u['file']}-" + ("the-business-environment" if u['number']==1 else "working-in-business" if u['number']==2 else "business-decisions") + ".pdf",
        "sha256": u['sha'], "source_file": f"{u['file']}.pdf", "pages": list(range(3, 14 if u['number']==1 else 11)), "table": "Teaching content: Learning outcomes / Teaching content / Exemplification"} for u in UNITS]
    }
    spec = {"subject_id": SUBJECT, "specification_version": "ocr-cambridge-technicals-business-v3-unit1-3-2026-11-25",
      "official_source_url": "https://www.ocr.org.uk/qualifications/cambridge-technicals/business/units/", "order_status": "verified",
      "official_source": {"title": "OCR Cambridge Technicals Level 3 Business Units 1, 2 and 3", "version": "2016 Suite, unit specification Version 3 (Unit 1); first teaching September 2016",
        "issue_date": "August 2016", "first_teaching": 2016, "url": "https://www.ocr.org.uk/qualifications/cambridge-technicals/business/units/", "verified_at": TODAY,
        "source_pdfs": [{"unit": f"Unit {u['number']}", "url": ev['sources'][u['number']-1]['url'], "sha256": u['sha']} for u in UNITS]},
      "approach": "Official OCR teaching-content table order. Printed teaching-content codes are preserved independently within each unit; each point retains the learning outcome, complete teaching content and separate exemplification.",
      "notes": "Learning outcome titles are official OCR wording. Unit 1 and Unit 2 are mandatory externally assessed units in the Extended Certificate. Unit 4 is also mandatory but internally assessed. Unit 3 is an optional externally assessed reference because this qualification chooses two 60 GLH units from its published optional set. Unit 4 and other internal optional units are not included as examination leaves. Legacy U1_1.1 maps by meaning to LO1 (actual teaching codes 1.1–1.5), not directly to OCR teaching code 1.1.",
      "legacy_ids": legacy, "point_order": point_order, "sections": sections}
    (repo / "data/specs/OCR_L3_BUS_CTEC.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
    (repo / "data/imports/ocrbusiness/spec-evidence.json").write_text(json.dumps(ev, ensure_ascii=False, indent=2) + "\n")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    ap.add_argument("--sources", type=Path, default=Path(__file__).resolve().parents[3] / "business-research" / "sources")
    args = ap.parse_args()
    build(args.repo, args.sources)
