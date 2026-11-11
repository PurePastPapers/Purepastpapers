// DEMO question bank — A-Level Physics, Chemistry, Biology and Computer Science.
// Original demo content (not from any exam board paper). Field key: see alevel-maths.mjs.

export default [
  {
    subject: 'EDX_ALEVEL_PHYS_9PH0', code: 'P1', title: 'Demo Paper A: Mechanics, circuits and fields',
    questions: [
      { m: 3, d: 'e', p: ['M2_2.1'],
        q: `A car travelling at 12 m s^{−1} accelerates uniformly at 1.5 m s^{−2} for 8.0 s.
(a) Calculate the final velocity of the car. [1]
(b) Calculate the distance travelled during the acceleration. [2]`,
        ms: `(a) v = 12 + 1.5 × 8.0 = 24 m s^{−1} :: (1)
(b) Use of s = ut + {{1|2}}at^2 :: (1)
s = 96 + 48 = 144 m :: (1)` },
      { m: 3, d: 'e', p: ['M1_1.2'],
        q: `A student measures the diameter of a wire as 0.52 ± 0.01 mm.
(a) Calculate the percentage uncertainty in the diameter. [1]
(b) Calculate the percentage uncertainty in the cross-sectional area of the wire. [2]`,
        ms: `(a) {{0.01|0.52}} × 100 = 1.9% :: (1)
(b) Area depends on diameter squared, so the percentage uncertainty doubles :: (1)
3.8% :: (1)` },
      { m: 6, d: 'h', p: ['M2_2.2'], x: ['M2_2.1', '@EDX_MATH_PURE_TRIG'],
        q: `A ball is kicked from ground level with a speed of 18 m s^{−1} at an angle of 35° above the horizontal. Ignore air resistance.
(a) Show that the vertical component of the initial velocity is about 10 m s^{−1}. [1]
(b) Calculate the time of flight. [2]
(c) Calculate the horizontal range. [2]
(d) State how air resistance would affect the range. [1]`,
        ms: `(a) 18 sin 35° = 10.3 m s^{−1} :: (1)
(b) Use of v = u + at with v = −10.3 m s^{−1}, or equivalent :: (1)
t = 2.1 s :: (1)
(c) Horizontal component = 18 cos 35° = 14.7 m s^{−1} :: (1)
Range = 14.7 × 2.1 = 31 m :: (1)
(d) The range would be smaller :: (1)` },
      { m: 5, d: 'm', p: ['M2_2.4'], x: ['M2_2.6'],
        q: `A car of mass 1200 kg moving at 15 m s^{−1} collides with a stationary car of mass 800 kg. The two cars move off together.
(a) Calculate the velocity of the cars immediately after the collision. [2]
(b) Calculate the kinetic energy transferred to other forms in the collision. [3]`,
        ms: `(a) Conservation of momentum: 1200 × 15 = 2000 × v :: (1)
v = 9.0 m s^{−1} :: (1)
(b) Initial E_{k} = {{1|2}} × 1200 × 15^2 = 135 000 J :: (1)
Final E_{k} = {{1|2}} × 2000 × 9.0^2 = 81 000 J :: (1)
Energy transferred = 54 000 J :: (1)` },
      { m: 5, d: 'm', p: ['M3_3.6'], x: ['M3_3.7'],
        q: `A cell of e.m.f. 1.5 V and internal resistance 0.50 Ω is connected to a 2.5 Ω resistor.
(a) Calculate the current in the circuit. [2]
(b) Calculate the terminal potential difference. [1]
(c) Calculate the power dissipated in the 2.5 Ω resistor. [2]`,
        ms: `(a) Use of ε = I(R + r) :: (1)
I = {{1.5|3.0}} = 0.50 A :: (1)
(b) V = IR = 0.50 × 2.5 = 1.25 V :: (1)
(c) Use of P = I^2 R :: (1)
P = 0.63 W :: (1)` },
      { m: 4, d: 'm', p: ['M3_3.5'], x: ['M3_3.3'],
        q: `A potential divider consists of a 6.0 V supply connected across a 10 kΩ fixed resistor in series with a thermistor. At 20 °C the thermistor has a resistance of 15 kΩ.
(a) Calculate the potential difference across the thermistor at 20 °C. [2]
(b) Explain what happens to this potential difference as the temperature rises. [2]`,
        ms: `(a) V = 6.0 × {{15|10 + 15}} :: (1)
V = 3.6 V :: (1)
(b) The resistance of the thermistor decreases :: (1)
It takes a smaller share of the supply p.d., so the p.d. across it decreases :: (1)` },
      { m: 6, d: 'h', p: ['M7_7.4'], x: ['M7_7.3', '@EDX_MATH_PURE_EXP_6.3'],
        q: `A 470 μF capacitor is charged to 12 V and then discharged through a 22 kΩ resistor.
(a) Calculate the time constant of the circuit. [1]
(b) Calculate the potential difference across the capacitor after 15 s. [2]
(c) Calculate the time taken for the potential difference to fall to 3.0 V. [3]`,
        ms: `(a) RC = 22 × 10^3 × 470 × 10^{−6} = 10.3 s :: (1)
(b) Use of V = V_{0}e^{−t/RC} :: (1)
V = 12 × e^{−15/10.3} = 2.8 V :: (1)
(c) 3.0 = 12 × e^{−t/10.3} :: (1)
Takes logs: t = 10.3 × ln 4 :: (1)
t = 14 s :: (1)` },
      { m: 6, d: 'h', p: ['M12_12.3'], x: ['M6_6.3', 'M12_12.1'],
        q: `A satellite orbits the Earth at a height of 400 km above the surface.
Mass of Earth = 5.97 × 10^{24} kg, radius of Earth = 6.37 × 10^6 m, G = 6.67 × 10^{−11} N m^2 kg^{−2}.
(a) Show that the orbital speed of the satellite is about 7.7 km s^{−1}. [3]
(b) Calculate the orbital period of the satellite. [2]
(c) State how the period would differ for a satellite in a higher orbit. [1]`,
        ms: `(a) Equates gravitational force and centripetal force: {{GMm|r^2}} = {{mv^2|r}} :: (1)
r = 6.37 × 10^6 + 4.0 × 10^5 = 6.77 × 10^6 m :: (1)
v = √({{GM|r}}) = 7670 m s^{−1} :: (1)
(b) T = {{2πr|v}} :: (1)
T = 5500 s (about 92 minutes) :: (1)
(c) The period would be longer :: (1)` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_PHYS_9PH0', code: 'P2', title: 'Demo Paper B: Materials, waves and nuclear physics',
    questions: [
      { m: 4, d: 'e', p: ['M4_4.4'],
        q: `A steel wire of length 2.0 m and cross-sectional area 5.0 × 10^{−7} m^2 extends by 1.0 mm when a force of 50 N is applied.
(a) Calculate the stress in the wire. [1]
(b) Calculate the strain. [1]
(c) Calculate the Young modulus of steel. [2]`,
        ms: `(a) Stress = {{50|5.0 × 10^{−7}}} = 1.0 × 10^8 Pa :: (1)
(b) Strain = {{1.0 × 10^{−3}|2.0}} = 5.0 × 10^{−4} :: (1)
(c) Young modulus = stress ÷ strain :: (1)
= 2.0 × 10^{11} Pa :: (1)` },
      { m: 5, d: 'm', p: ['M5_5.5'],
        q: `Light of wavelength 590 nm is incident normally on a diffraction grating with 300 lines per mm.
(a) Calculate the angle at which the second-order maximum is observed. [3]
(b) Determine the highest order of maximum that can be observed. [2]`,
        ms: `(a) d = {{1 × 10^{−3}|300}} = 3.33 × 10^{−6} m :: (1)
Use of nλ = d sin θ with n = 2 :: (1)
θ = 20.7° :: (1)
(b) n is largest when sin θ = 1: n = {{d|λ}} = 5.6 :: (1)
Highest order = 5 :: (1)` },
      { m: 5, d: 'm', p: ['M5_5.7'],
        q: `Light of wavelength 400 nm is incident on a metal surface with a work function of 2.3 eV.
h = 6.63 × 10^{−34} J s, c = 3.00 × 10^8 m s^{−1}, e = 1.60 × 10^{−19} C.
(a) Calculate the energy of a photon of this light in eV. [2]
(b) Calculate the maximum kinetic energy of the photoelectrons in eV. [1]
(c) Explain why increasing the intensity of the light does not change this maximum kinetic energy. [2]`,
        ms: `(a) E = {{hc|λ}} = 4.97 × 10^{−19} J :: (1)
= 3.1 eV :: (1)
(b) 3.1 − 2.3 = 0.8 eV :: (1)
(c) Each electron absorbs one photon, and the photon energy depends only on frequency :: (1)
Greater intensity means more photons per second, so more electrons, not more energy per electron :: (1)` },
      { m: 4, d: 'm', p: ['M9_9.1'], x: ['M3_3.7'],
        q: `A 2.0 kW kettle heats 1.5 kg of water from 20 °C to 100 °C. The specific heat capacity of water is 4200 J kg^{−1} K^{−1}.
(a) Calculate the energy needed. [2]
(b) Calculate the minimum time taken. [1]
(c) Suggest why the actual time is longer. [1]`,
        ms: `(a) Use of ΔE = mcΔθ = 1.5 × 4200 × 80 :: (1)
= 5.0 × 10^5 J :: (1)
(b) t = {{5.04 × 10^5|2000}} = 250 s :: (1)
(c) Energy is transferred to the surroundings and to the kettle itself :: (1)` },
      { m: 5, d: 'm', p: ['M11_11.3'],
        q: `A sample of iodine-131 has a half-life of 8.0 days and an initial activity of 6.4 × 10^5 Bq.
(a) Calculate the decay constant in s^{−1}. [2]
(b) Calculate the activity after 24 days. [1]
(c) Calculate the initial number of undecayed nuclei. [2]`,
        ms: `(a) λ = {{ln 2|8.0 × 86 400}} :: (1)
= 1.0 × 10^{−6} s^{−1} :: (1)
(b) Three half-lives: 8.0 × 10^4 Bq :: (1)
(c) Use of A = λN :: (1)
N = 6.4 × 10^{11} :: (1)` },
      { m: 6, d: 'h', p: ['M13_13.2'], x: ['M13_13.1'],
        q: `A mass of 0.25 kg attached to a spring of stiffness 40 N m^{−1} oscillates with simple harmonic motion of amplitude 5.0 cm.
(a) Calculate the period of the oscillation. [2]
(b) Calculate the maximum speed of the mass. [2]
(c) Calculate the maximum acceleration of the mass. [1]
(d) State the position of the mass when its kinetic energy is greatest. [1]`,
        ms: `(a) T = 2π√({{m|k}}) :: (1)
T = 0.50 s :: (1)
(b) ω = 12.6 rad s^{−1}; v_{max} = ωA :: (1)
= 0.63 m s^{−1} :: (1)
(c) a_{max} = ω^2 A = 8.0 m s^{−2} :: (1)
(d) At the equilibrium position :: (1)` },
    ],
  },
  {
    subject: 'OCR_ALEVEL_CHEM_H432', code: 'P1', title: 'Demo Paper: Foundations, energy and organic chemistry',
    questions: [
      { m: 3, d: 'e', p: ['2.1.3'],
        q: `A student reacts 2.50 g of calcium carbonate, CaCO_{3}, with an excess of hydrochloric acid.
(a) Calculate the amount, in mol, of CaCO_{3} used. [1]
(b) Calculate the volume of carbon dioxide formed at room temperature and pressure. (1 mol of gas occupies 24.0 dm^3 at RTP.) [2]`,
        ms: `(a) {{2.50|100.1}} = 0.0250 mol :: (1)
(b) 1 mol of CaCO_{3} forms 1 mol of CO_{2} :: (1)
0.0250 × 24.0 = 0.600 dm^3 :: (1)` },
      { m: 3, d: 'e', p: ['2.2.1', '3.1.1'],
        q: `(a) Write the full electron configuration of a sulfur atom. [1]
(b) Write the full electron configuration of a Ca^{2+} ion. [1]
(c) Define the term first ionisation energy. [1]`,
        ms: `(a) 1s^2 2s^2 2p^6 3s^2 3p^4 :: (1)
(b) 1s^2 2s^2 2p^6 3s^2 3p^6 :: (1)
(c) The energy required to remove one electron from each atom in one mole of gaseous atoms to form one mole of gaseous 1+ ions :: (1)` },
      { m: 5, d: 'm', p: ['3.2.1'], x: ['2.1.3', '2.1.4'],
        q: `25.0 cm^3 of 1.00 mol dm^{−3} hydrochloric acid is added to 25.0 cm^3 of 1.00 mol dm^{−3} sodium hydroxide in a polystyrene cup. The temperature rises by 6.8 °C.
Calculate the enthalpy change of neutralisation, in kJ mol^{−1}. Assume the solution has a density of 1.00 g cm^{−3} and a specific heat capacity of 4.18 J g^{−1} K^{−1}. [5]`,
        ms: `q = mcΔT = 50.0 × 4.18 × 6.8 :: (1)
= 1421 J :: (1)
Amount of water formed = 0.0250 mol :: (1)
ΔH = {{1421|0.0250}} = 56 800 J mol^{−1} :: (1)
ΔH = −56.8 kJ mol^{−1} (sign required) :: (1)` },
      { m: 4, d: 'm', p: ['3.2.3'],
        q: `Ammonia is manufactured by the equilibrium N_{2}(g) + 3H_{2}(g) ⇌ 2NH_{3}(g), for which ΔH = −92 kJ mol^{−1}.
Explain the effect on the equilibrium yield of ammonia of:
(a) increasing the pressure [2]
(b) increasing the temperature. [2]`,
        ms: `(a) Yield increases :: (1)
The position of equilibrium shifts to the right, the side with fewer gas molecules :: (1)
(b) Yield decreases :: (1)
The forward reaction is exothermic, so equilibrium shifts to the left to absorb the added energy :: (1)` },
      { m: 4, d: 'm', p: ['3.1.2', '3.1.3'], x: ['2.1.5'],
        q: `(a) Explain the trend in reactivity of the Group 2 metals down the group. [2]
(b) Write an equation for the reaction of chlorine with cold, dilute aqueous sodium hydroxide and state the type of reaction. [2]`,
        ms: `(a) Atomic radius and shielding increase down the group :: (1)
Ionisation energies decrease, so electrons are lost more easily and reactivity increases :: (1)
(b) Cl_{2} + 2NaOH → NaCl + NaClO + H_{2}O :: (1)
Disproportionation :: (1)` },
      { m: 5, d: 'm', p: ['4.1.3'], x: ['4.1.1'],
        q: `But-1-ene reacts with hydrogen bromide.
(a) Name the mechanism of this reaction. [1]
(b) Identify the major organic product and explain why it is the major product. [3]
(c) Describe a chemical test that distinguishes an alkene from an alkane. [1]`,
        ms: `(a) Electrophilic addition :: (1)
(b) 2-bromobutane :: (1)
It forms via a secondary carbocation :: (1)
which is more stable than the primary carbocation that leads to 1-bromobutane :: (1)
(c) Bromine water is decolourised by the alkene only :: (1)` },
      { m: 6, d: 'h', p: ['5.1.1'],
        q: `The initial rate of the reaction A + B → C was measured in three experiments.
| Experiment | [A] / mol dm^{−3} | [B] / mol dm^{−3} | Initial rate / mol dm^{−3} s^{−1} |
| 1 | 0.10 | 0.10 | 2.0 × 10^{−4} |
| 2 | 0.20 | 0.10 | 4.0 × 10^{−4} |
| 3 | 0.20 | 0.20 | 1.6 × 10^{−3} |
(a) Determine the order of reaction with respect to A and with respect to B. [2]
(b) Write the rate equation. [1]
(c) Calculate the rate constant, k, and give its units. [3]`,
        ms: `(a) First order with respect to A: doubling [A] doubles the rate :: (1)
Second order with respect to B: doubling [B] quadruples the rate :: (1)
(b) rate = k[A][B]^2 :: (1)
(c) k = {{2.0 × 10^{−4}|0.10 × 0.10^2}} :: (1)
k = 0.20 :: (1)
dm^6 mol^{−2} s^{−1} :: (1)` },
      { m: 6, d: 'h', p: ['5.1.3'], x: ['2.1.4'],
        q: `(a) Calculate the pH of 0.0150 mol dm^{−3} hydrochloric acid. [1]
(b) Calculate the pH of 0.100 mol dm^{−3} ethanoic acid. K_{a} = 1.74 × 10^{−5} mol dm^{−3}. [3]
(c) Explain how a solution containing ethanoic acid and sodium ethanoate resists a change in pH when a small amount of acid is added. [2]`,
        ms: `(a) pH = −log(0.0150) = 1.82 :: (1)
(b) [H^{+}] = √(K_{a} × [HA]) :: (1)
[H^{+}] = 1.32 × 10^{−3} mol dm^{−3} :: (1)
pH = 2.88 :: (1)
(c) The added H^{+} ions react with ethanoate ions, CH_{3}COO^{−} :: (1)
The equilibrium CH_{3}COOH ⇌ H^{+} + CH_{3}COO^{−} shifts to the left, removing most of the added H^{+} :: (1)` },
      { m: 6, d: 'h', p: ['5.2.3'], x: ['2.1.5'],
        q: `Standard electrode potentials: Zn^{2+}/Zn = −0.76 V, Cu^{2+}/Cu = +0.34 V, Ag^{+}/Ag = +0.80 V.
(a) Calculate the standard cell potential of a zinc–copper cell. [1]
(b) Write the overall equation for the reaction in this cell. [1]
(c) Predict, with a reason, whether silver ions will oxidise copper metal. [2]
(d) Give two reasons why a reaction predicted to be feasible may not be observed. [2]`,
        ms: `(a) 0.34 − (−0.76) = 1.10 V :: (1)
(b) Zn + Cu^{2+} → Zn^{2+} + Cu :: (1)
(c) Yes: the Ag^{+}/Ag potential is more positive than Cu^{2+}/Cu :: (1)
So Ag^{+} gains electrons and Cu is oxidised (cell potential +0.46 V) :: (1)
(d) The activation energy may be high, so the reaction is too slow :: (1)
Conditions may not be standard, for example the concentrations are not 1 mol dm^{−3} :: (1)` },
      { m: 5, d: 'm', p: ['6.1.2'], x: ['4.2.4', '6.3.2'],
        q: `Compound X has the molecular formula C_{3}H_{6}O. It gives an orange precipitate with 2,4-dinitrophenylhydrazine but does not react with Tollens' reagent.
(a) Identify compound X and explain your reasoning. [2]
(b) State the wavenumber range of the infrared absorption you would expect for its functional group. [1]
(c) Predict the number of peaks in the proton NMR spectrum of X and explain your answer. [2]`,
        ms: `(a) X contains a carbonyl group but is not an aldehyde, so it is a ketone :: (1)
Propanone, CH_{3}COCH_{3} :: (1)
(b) C=O absorption at about 1630–1820 cm^{−1} :: (1)
(c) One peak :: (1)
All six protons are in the same chemical environment :: (1)` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_BIOL_9BN0', code: 'P1', title: 'Demo Paper: Topics 1–8 short and extended answers',
    questions: [
      { m: 3, d: 'e', p: ['T1_1.1'],
        q: `Describe how the structure of an artery is related to its function. [3]`,
        ms: `Thick wall to withstand high blood pressure :: (1)
Elastic fibres stretch and recoil to maintain pressure and smooth the flow of blood :: (1)
Narrow lumen maintains high pressure, or smooth endothelium reduces friction :: (1)` },
      { m: 4, d: 'm', p: ['T2_2.1'],
        q: `Using Fick's law, explain how the alveoli are adapted for efficient gas exchange. [4]`,
        ms: `Rate of diffusion is proportional to surface area × concentration difference ÷ thickness of the exchange surface :: (1)
Many alveoli provide a large surface area :: (1)
Walls one cell thick give a short diffusion distance :: (1)
Ventilation and blood flow maintain a steep concentration gradient :: (1)` },
      { m: 4, d: 'm', p: ['T2_2.4'], x: ['T2_2.3'],
        q: `Explain the effect of increasing substrate concentration on the initial rate of an enzyme-catalysed reaction. [4]`,
        ms: `At low concentrations the rate increases as substrate concentration increases :: (1)
More frequent collisions, so more enzyme–substrate complexes form :: (1)
At high concentrations the rate levels off :: (1)
All active sites are occupied, so enzyme concentration is the limiting factor :: (1)` },
      { m: 5, d: 'm', p: ['T2_2.6'], x: ['T2_2.5', 'T2_2.7'],
        q: `(a) Describe the process of transcription. [3]
(b) Explain how a mutation that changes one base in a gene could affect the protein produced. [2]`,
        ms: `(a) The DNA double helix unwinds and hydrogen bonds between the strands break :: (1)
Free RNA nucleotides pair with complementary bases on the template (antisense) strand :: (1)
RNA polymerase joins the nucleotides to form mRNA :: (1)
(b) The altered triplet may code for a different amino acid, changing the primary structure :: (1)
This may change the folding and tertiary structure, so the protein may not function :: (1)` },
      { m: 6, d: 'h', p: ['T4_4.3'], x: ['T2_2.7', 'T2_2.8'],
        q: `Cystic fibrosis is caused by a recessive allele. In one population, 1 in 2500 babies is born with cystic fibrosis.
(a) Use the Hardy–Weinberg equation to estimate the percentage of the population who are carriers. [4]
(b) State two assumptions made when using the Hardy–Weinberg equation. [2]`,
        ms: `(a) q^2 = {{1|2500}} = 0.0004 :: (1)
q = 0.02 :: (1)
p = 0.98 :: (1)
2pq = 0.0392, so about 3.9% are carriers :: (1)
(b) Any two: random mating; large population; no selection; no mutation; no migration :: (2)` },
      { m: 5, d: 'm', p: ['T5_5.2'],
        q: `Describe how ATP and reduced NADP are produced in the light-dependent reactions of photosynthesis. [5]`,
        ms: `Light energy excites electrons in chlorophyll :: (1)
Electrons pass along the electron transport chain in the thylakoid membrane, releasing energy :: (1)
The energy is used to produce ATP from ADP and inorganic phosphate (photophosphorylation) :: (1)
Photolysis of water produces electrons, hydrogen ions and oxygen :: (1)
Electrons and hydrogen ions reduce NADP :: (1)` },
      { m: 6, d: 'h', p: ['T6_6.5'], x: ['T6_6.4'],
        q: `Describe the roles of T helper cells and B cells in the specific immune response to a bacterial infection. [6]`,
        ms: `Antigen-presenting cells (such as macrophages) display bacterial antigens :: (1)
T helper cells with complementary receptors bind to the antigen and are activated :: (1)
Activated T helper cells divide and release cytokines :: (1)
Cytokines stimulate B cells that have bound the same antigen to divide by mitosis :: (1)
B cells differentiate into plasma cells that secrete antibodies specific to the antigen :: (1)
Memory cells remain and give a faster, larger secondary response :: (1)` },
      { m: 6, d: 'h', p: ['T8_8.1'],
        q: `Explain how an action potential is generated and propagated along the axon of a neurone. [6]`,
        ms: `A stimulus causes voltage-gated sodium ion channels to open :: (1)
Sodium ions diffuse in, depolarising the membrane to about +40 mV :: (1)
Sodium channels close and voltage-gated potassium ion channels open :: (1)
Potassium ions diffuse out, repolarising the membrane :: (1)
Local currents depolarise the next section of membrane :: (1)
The refractory period ensures the impulse travels in one direction only :: (1)` },
    ],
  },
  {
    subject: 'OCR_ALEVEL_CS_H446', code: 'P1', title: 'Demo Paper: Computer systems and algorithms',
    questions: [
      { m: 3, d: 'e', p: ['1.1.1'],
        q: `Describe the role of each of these registers during the fetch–decode–execute cycle: the program counter, the memory address register and the accumulator. [3]`,
        ms: `Program counter: holds the address of the next instruction to be fetched :: (1)
Memory address register: holds the address in memory that is about to be read from or written to :: (1)
Accumulator: holds the results of calculations carried out by the ALU :: (1)` },
      { m: 4, d: 'm', p: ['1.4.1'],
        q: `(a) Convert the denary number −37 into 8-bit two's complement binary. Show your working. [2]
(b) Convert the hexadecimal number 3F into denary. [1]
(c) State the range of values that can be stored in 8-bit two's complement. [1]`,
        ms: `(a) 37 = 00100101; invert and add 1 :: (1)
11011011 :: (1)
(b) 63 :: (1)
(c) −128 to 127 :: (1)` },
      { m: 5, d: 'm', p: ['1.4.3'],
        q: `(a) Simplify the Boolean expression (A ∧ B) ∨ (A ∧ ¬B) ∨ (¬A ∧ B). Show each step. [3]
(b) Complete a truth table to confirm that your simplified expression is equivalent. [2]`,
        ms: `(a) (A ∧ B) ∨ (A ∧ ¬B) = A ∧ (B ∨ ¬B) = A :: (1)
A ∨ (¬A ∧ B) = (A ∨ ¬A) ∧ (A ∨ B) :: (1)
= A ∨ B :: (1)
(b) Correct outputs for the original expression: 0, 1, 1, 1 for AB = 00, 01, 10, 11 :: (1)
Matching outputs for A ∨ B :: (1)` },
      { m: 5, d: 'm', p: ['1.3.2'],
        q: `A database contains the tables Student(StudentID, Name, Form) and Result(StudentID, Subject, Mark).
(a) Write an SQL query to list the name and mark of every student who scored more than 70 in Maths, with the highest mark first. [4]
(b) Explain what is meant by a foreign key. [1]`,
        ms: `(a) Example answer:
~~~
SELECT Student.Name, Result.Mark
FROM Student INNER JOIN Result ON Student.StudentID = Result.StudentID
WHERE Result.Subject = 'Maths' AND Result.Mark > 70
ORDER BY Result.Mark DESC;
~~~
Correct fields selected :: (1)
Tables joined on StudentID :: (1)
Both conditions in WHERE :: (1)
ORDER BY Mark DESC :: (1)
(b) A field in one table that is the primary key of another table, used to link the two :: (1)` },
      { m: 4, d: 'm', p: ['1.3.3'],
        q: `Explain two differences between packet switching and circuit switching. [4]`,
        ms: `Packet switching splits data into packets that may take different routes :: (1)
whereas circuit switching sets up a dedicated path for the whole communication :: (1)
Packet switching shares links between many users, making efficient use of the network :: (1)
whereas a circuit is reserved even when no data is being sent :: (1)` },
      { m: 6, d: 'h', p: ['2.3.1'],
        q: `The list [2, 5, 8, 12, 16, 23, 38, 56, 72, 91] is stored in an array indexed from 0.
(a) Show the steps of a binary search for the value 23. [3]
(b) State the worst-case time complexity of binary search and explain why. [2]
(c) State the precondition for binary search to work. [1]`,
        ms: `(a) Midpoint index 4 (16): 23 is larger, so search indexes 5–9 :: (1)
Midpoint index 7 (56): 23 is smaller, so search indexes 5–6 :: (1)
Midpoint index 5 (23): found :: (1)
(b) O(log n) :: (1)
The number of items still to be searched halves with each comparison :: (1)
(c) The list must be sorted :: (1)` },
      { m: 8, d: 'h', p: ['2.2.1'], x: ['2.1.3'],
        q: `(a) Write a recursive function that returns the nth Fibonacci number, where fib(0) = 0 and fib(1) = 1. [4]
(b) Explain one disadvantage of using recursion for this problem. [2]
(c) Describe how an iterative solution would avoid this disadvantage. [2]`,
        ms: `(a) Example answer:
~~~
function fib(n)
    if n <= 1 then
        return n
    else
        return fib(n - 1) + fib(n - 2)
    endif
endfunction
~~~
Function defined with a parameter :: (1)
Correct base case :: (1)
Two recursive calls with n − 1 and n − 2 :: (1)
Results added and returned :: (1)
(b) Each call adds a stack frame, and the same values are recalculated many times :: (1)
so time and memory use grow very quickly and the stack may overflow :: (1)
(c) A loop keeps only the previous two values in variables :: (1)
so it uses constant memory and each value is calculated once :: (1)` },
      { m: 9, d: 'h', t: 15, p: ['1.5.2'], x: ['1.5.1'],
        q: `A company plans to use an artificial intelligence system to decide which job applicants are invited to interview.
Discuss the moral, ethical and legal issues that the company should consider. [9]`,
        ms: `Marked by level of response: 7–9 marks for a thorough, balanced discussion with a justified conclusion.
Indicative content:
- Bias: a system trained on past decisions may reproduce discrimination against some groups
- Transparency: applicants may be unable to find out why they were rejected
- Accountability: who is responsible for an unfair decision
- Legislation: the Data Protection Act and the Equality Act apply to automated decisions and personal data
- Benefits: consistent, fast screening of large numbers of applications
- Mitigation: human review of decisions, auditing outcomes and testing for bias` },
    ],
  },
];
