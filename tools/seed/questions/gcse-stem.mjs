// DEMO question bank — GCSE Mathematics, sciences and Computer Science.
// Original demo content (not from any exam board paper). Field key: see alevel-maths.mjs.

export default [
  {
    subject: 'EDX_GCSE_MATH_1MA1', code: 'F', title: 'Demo Paper A: Foundation and crossover', tier: 'Foundation',
    questions: [
      { m: 2, d: 'e', p: ['NUM_1.2'],
        q: `Work out {{3|4}} + {{2|5}}. Give your answer as a mixed number. [2]`,
        ms: `{{15|20}} + {{8|20}} :: M1
1{{3|20}} :: A1` },
      { m: 3, d: 'e', p: ['RATIO_3.1'],
        q: `Amir, Beth and Cara share £180 in the ratio 2 : 3 : 4. Work out how much each person receives. [3]`,
        ms: `180 ÷ 9 = 20 :: M1
Multiplies 20 by 2, 3 and 4 :: M1
£40, £60 and £80 :: A1` },
      { m: 4, d: 'e', p: ['ALG_2.3', 'ALG_2.1'],
        q: `(a) Solve 5x − 7 = 2x + 11. [2]
(b) Expand and simplify 3(2x + 1) − 2(x − 4). [2]`,
        ms: `(a) 3x = 18 :: M1
x = 6 :: A1
(b) 6x + 3 − 2x + 8 :: M1
4x + 11 :: A1` },
      { m: 4, d: 'e', p: ['RATIO_3.3'],
        q: `(a) A jacket costs £60. In a sale its price is reduced by 15%. Work out the sale price. [2]
(b) In the same sale a pair of shoes costs £34 after a 15% reduction. Work out the original price of the shoes. [2]`,
        ms: `(a) 0.85 × 60 :: M1
£51 :: A1
(b) 34 ÷ 0.85 :: M1
£40 :: A1` },
      { m: 4, d: 'm', p: ['GEOM_4.7', 'GEOM_4.8'],
        q: `Triangle ABC has a right angle at B. AB = 8 cm and BC = 15 cm.
(a) Work out the length of AC. [2]
(b) Work out the size of angle BAC. Give your answer to 1 decimal place. [2]`,
        ms: `(a) 8^2 + 15^2 = 289 :: M1
AC = 17 cm :: A1
(b) tan A = {{15|8}} :: M1
61.9° :: A1` },
      { m: 4, d: 'm', p: ['ALG_2.7'],
        q: `Solve the simultaneous equations 3x + 2y = 16 and 5x − 2y = 8. [4]`,
        ms: `Adds the equations: 8x = 24 :: M1
x = 3 :: A1
Substitutes: 9 + 2y = 16 :: M1
y = 3.5 :: A1` },
      { m: 4, d: 'm', p: ['PROB_5.3'], x: ['NUM_1.2'],
        q: `A bag contains 5 red counters and 3 blue counters. Two counters are taken at random without replacement. Work out the probability that both counters are the same colour. [4]`,
        ms: `{{5|8}} × {{4|7}} for two reds :: M1
{{3|8}} × {{2|7}} for two blues :: M1
{{20|56}} + {{6|56}} :: M1
{{26|56}} = {{13|28}} :: A1` },
      { m: 3, d: 'm', p: ['NUM_1.5'],
        q: `(a) Write 0.00056 in standard form. [1]
(b) Work out (3.2 × 10^5) × (4 × 10^{−2}). Give your answer in standard form. [2]`,
        ms: `(a) 5.6 × 10^{−4} :: B1
(b) 12.8 × 10^3 :: M1
1.28 × 10^4 :: A1` },
      { m: 4, d: 'm', p: ['ALG_2.4'],
        q: `Here are the first four terms of a sequence: 4, 11, 18, 25.
(a) Find an expression for the nth term. [2]
(b) Is 200 a term in this sequence? Show how you decide. [2]`,
        ms: `(a) 7n :: M1
7n − 3 :: A1
(b) 7n − 3 = 200 gives n = 29 :: M1
Yes, because n is a whole number (it is the 29th term) :: A1` },
    ],
  },
  {
    subject: 'EDX_GCSE_MATH_1MA1', code: 'H', title: 'Demo Paper B: Higher', tier: 'Higher',
    questions: [
      { m: 3, d: 'm', p: ['RATIO_3.2'],
        q: `y is inversely proportional to the square of x. When x = 4, y = 5. Find the value of y when x = 10. [3]`,
        ms: `y = {{k|x^2}} :: M1
k = 5 × 16 = 80 :: A1
y = {{80|100}} = 0.8 :: A1` },
      { m: 4, d: 'h', p: ['NUM_1.7'],
        q: `Rationalise the denominator of {{6|3 − √3}}. Give your answer in the form a + √b, where a and b are integers. [4]`,
        ms: `Multiplies numerator and denominator by 3 + √3 :: M1
Denominator: 9 − 3 = 6 :: A1
{{6(3 + √3)|6}} :: M1
3 + √3 :: A1` },
      { m: 5, d: 'h', p: ['ALG_2.9'],
        q: `Solve 2x^2 − 5x − 4 = 0. Give your solutions correct to 2 decimal places. [5]`,
        ms: `Substitutes into the quadratic formula with a = 2, b = −5, c = −4 :: M1
x = {{5 ± √(25 + 32)|4}} :: A1
√57 = 7.55 :: M1
x = 3.14 :: A1
x = −0.64 :: A1` },
      { m: 5, d: 'h', p: ['GEOM_4.11'],
        q: `In triangle PQR, PQ = 7 cm, PR = 9 cm and angle QPR = 52°.
(a) Calculate the length of QR. Give your answer to 3 significant figures. [3]
(b) Calculate the area of triangle PQR. Give your answer to 3 significant figures. [2]`,
        ms: `(a) QR^2 = 7^2 + 9^2 − 2 × 7 × 9 × cos 52° :: M1
QR^2 = 52.4 :: A1
QR = 7.24 cm :: A1
(b) {{1|2}} × 7 × 9 × sin 52° :: M1
24.8 cm^2 :: A1` },
      { m: 5, d: 'h', p: ['ALG_2.14'], x: ['ALG_2.6'],
        q: `Prove algebraically that the difference between the squares of any two consecutive odd numbers is a multiple of 8. [5]`,
        ms: `Writes two consecutive odd numbers as 2n + 1 and 2n + 3 :: B1
(2n + 3)^2 − (2n + 1)^2 :: M1
4n^2 + 12n + 9 − 4n^2 − 4n − 1 :: M1
8n + 8 :: A1
= 8(n + 1), which is a multiple of 8 :: A1` },
      { m: 7, d: 'h', p: ['ALG_2.11'], x: ['ALG_2.6'],
        q: `The functions f and g are such that f(x) = 3x − 2 and g(x) = x^2 + 1.
(a) Find fg(2). [2]
(b) Find f^{−1}(x). [2]
(c) Solve gf(x) = 26. [3]`,
        ms: `(a) g(2) = 5 :: M1
fg(2) = 13 :: A1
(b) y = 3x − 2, so x = {{y + 2|3}} :: M1
f^{−1}(x) = {{x + 2|3}} :: A1
(c) (3x − 2)^2 + 1 = 26 :: M1
3x − 2 = 5 or 3x − 2 = −5 :: M1
x = {{7|3}} or x = −1 :: A1` },
      { m: 5, d: 'h', p: ['NUM_1.6'], x: ['RATIO_3.4'],
        q: `A runner covers a distance of 120 m, correct to the nearest 10 m, in a time of 8.2 seconds, correct to 1 decimal place. Work out the upper bound for the runner's average speed. Give your answer to 3 significant figures. [5]`,
        ms: `Upper bound of distance = 125 m :: B1
Lower bound of time = 8.15 s :: B1
Uses upper bound of distance ÷ lower bound of time :: M1
125 ÷ 8.15 :: M1
15.3 m/s :: A1` },
      { m: 6, d: 'h', p: ['ALG_2.9'], x: ['ALG_2.8'],
        q: `(a) Write x^2 − 6x + 11 in the form (x − a)^2 + b. [2]
(b) Write down the coordinates of the turning point of the graph of y = x^2 − 6x + 11. [2]
(c) Explain why the equation x^2 − 6x + 11 = 0 has no real solutions. [2]`,
        ms: `(a) (x − 3)^2 :: M1
(x − 3)^2 + 2 :: A1
(b) (3, 2) :: B1 B1
(c) (x − 3)^2 is never negative, so the smallest value of the expression is 2 :: M1
The expression is never 0, so the graph does not cross the x-axis :: A1` },
    ],
  },
  {
    subject: 'EDX_GCSE_BIOL_1BI0', code: 'P12', title: 'Demo Paper: Papers 1 and 2 mixed questions',
    questions: [
      { m: 3, d: 'e', p: ['B1_1.1'],
        q: `Give three structures found in a plant cell that are not found in an animal cell. [3]`,
        ms: `Cell wall :: (1)
Chloroplasts :: (1)
Permanent vacuole :: (1)` },
      { m: 5, d: 'm', p: ['B1_1.4'],
        q: `A student puts a potato cylinder of mass 2.50 g into pure water. After 30 minutes its mass is 2.80 g.
(a) Calculate the percentage change in mass. [2]
(b) Explain why the mass of the cylinder increased. [3]`,
        ms: `(a) {{2.80 − 2.50|2.50}} × 100 :: (1)
+12% :: (1)
(b) Water moved into the potato cells by osmosis :: (1)
from a dilute solution to a more concentrated solution :: (1)
through a partially permeable membrane :: (1)` },
      { m: 4, d: 'm', p: ['B1_1.3'],
        q: `(a) Explain why amylase stops working at 70 °C. [2]
(b) Name the products of the digestion of proteins and of lipids. [2]`,
        ms: `(a) The enzyme is denatured: the shape of its active site changes :: (1)
The substrate no longer fits, so no enzyme–substrate complexes form :: (1)
(b) Proteins: amino acids :: (1)
Lipids: fatty acids and glycerol :: (1)` },
      { m: 4, d: 'm', p: ['B6_6.1'],
        q: `(a) Write the word equation for photosynthesis. [1]
(b) A student increases the light intensity given to a plant. The rate of photosynthesis increases and then stays constant. Explain these results. [3]`,
        ms: `(a) carbon dioxide + water → glucose + oxygen :: (1)
(b) At first light is the limiting factor, so more light increases the rate :: (1)
The rate levels off because another factor is now limiting :: (1)
such as carbon dioxide concentration or temperature :: (1)` },
      { m: 5, d: 'h', p: ['B3_3.2'],
        q: `Cystic fibrosis is caused by a recessive allele (f). Two parents are both heterozygous for cystic fibrosis.
(a) What is meant by heterozygous? [1]
(b) Draw a Punnett square to find the probability that their child will have cystic fibrosis. [4]`,
        ms: `(a) Having two different alleles of a gene :: (1)
(b) Parental gametes F and f shown for both parents :: (1)
Offspring genotypes FF, Ff, Ff, ff :: (1)
ff identified as having cystic fibrosis :: (1)
Probability = 0.25, 25% or 1 in 4 :: (1)` },
      { m: 6, d: 'h', t: 8, p: ['B7_7.3'],
        q: `Describe how the body controls blood glucose concentration after a meal and during a long period without food. [6]`,
        ms: `Marked by level of response: 5–6 marks for a detailed, logically sequenced account of both situations.
Indicative content:
- After a meal the blood glucose concentration rises, which is detected by the pancreas
- The pancreas releases insulin
- Insulin causes glucose to move from the blood into cells; the liver and muscles convert glucose to glycogen
- Without food the blood glucose concentration falls and the pancreas releases glucagon
- Glucagon causes the liver to convert glycogen back to glucose
- This is an example of negative feedback` },
    ],
  },
  {
    subject: 'EDX_GCSE_CHEM_1CH0', code: 'P12', title: 'Demo Paper: Papers 1 and 2 mixed questions',
    questions: [
      { m: 3, d: 'e', p: ['C1_1.1'], x: ['C1_1.2'],
        q: `An atom of sodium has an atomic number of 11 and a mass number of 23.
(a) State the number of protons, neutrons and electrons in this atom. [2]
(b) Write the electronic configuration of sodium. [1]`,
        ms: `(a) 11 protons and 11 electrons :: (1)
12 neutrons :: (1)
(b) 2.8.1 :: (1)` },
      { m: 4, d: 'm', p: ['C1_1.5'], x: ['C1_1.3'],
        q: `Explain why sodium chloride has a high melting point and conducts electricity when molten but not when solid. [4]`,
        ms: `It has a giant ionic lattice with strong electrostatic forces between oppositely charged ions :: (1)
A large amount of energy is needed to overcome these forces :: (1)
When solid the ions are fixed in position and cannot move :: (1)
When molten the ions are free to move and carry charge :: (1)` },
      { m: 5, d: 'h', p: ['C1_1.6'],
        q: `Magnesium burns in oxygen: 2Mg + O_{2} → 2MgO.
Calculate the mass of magnesium oxide produced when 4.8 g of magnesium burns completely. Relative atomic masses: Mg = 24, O = 16. [5]`,
        ms: `Moles of Mg = {{4.8|24}} :: (1)
= 0.20 mol :: (1)
Moles of MgO = 0.20 mol (ratio 1 : 1) :: (1)
Relative formula mass of MgO = 40 :: (1)
Mass = 0.20 × 40 = 8.0 g :: (1)` },
      { m: 4, d: 'm', p: ['C3_3.2'],
        q: `Molten lead bromide is electrolysed.
(a) Name the product formed at each electrode. [2]
(b) Explain why the lead bromide must be molten. [2]`,
        ms: `(a) Lead at the negative electrode (cathode) :: (1)
Bromine at the positive electrode (anode) :: (1)
(b) The ions must be free to move :: (1)
so that they can carry charge to the electrodes; in a solid they are fixed in place :: (1)` },
      { m: 4, d: 'm', p: ['C7_7.1'],
        q: `Use collision theory to explain why increasing the temperature increases the rate of a reaction. [4]`,
        ms: `Particles gain kinetic energy and move faster :: (1)
so collisions are more frequent :: (1)
More particles have energy equal to or greater than the activation energy :: (1)
so a greater proportion of collisions are successful :: (1)` },
      { m: 4, d: 'm', p: ['C8_8.1'],
        q: `Describe how crude oil is separated into fractions by fractional distillation. [4]`,
        ms: `The crude oil is heated until most of it evaporates :: (1)
The vapour enters a fractionating column that is hotter at the bottom and cooler at the top :: (1)
Vapours rise and condense at the level where the temperature is below their boiling point :: (1)
Fractions with larger molecules and higher boiling points are collected lower down :: (1)` },
    ],
  },
  {
    subject: 'EDX_GCSE_PHYS_1PH0', code: 'P12', title: 'Demo Paper: Papers 1 and 2 mixed questions',
    questions: [
      { m: 3, d: 'e', p: ['P3_3.1'],
        q: `Calculate the kinetic energy of a car of mass 1200 kg travelling at 15 m/s. [3]`,
        ms: `KE = {{1|2}} × m × v^2 :: (1)
{{1|2}} × 1200 × 15^2 :: (1)
135 000 J :: (1)` },
      { m: 4, d: 'm', p: ['P10_10.3'], x: ['P10_10.1'],
        q: `A kettle is connected to the 230 V mains supply. The current in the kettle is 10 A.
(a) Calculate the power of the kettle. [2]
(b) Calculate the energy transferred by the kettle in 3 minutes. [2]`,
        ms: `(a) P = V × I = 230 × 10 :: (1)
2300 W :: (1)
(b) E = P × t = 2300 × 180 :: (1)
414 000 J :: (1)` },
      { m: 4, d: 'm', p: ['P14_14.1'],
        q: `Describe a method to determine the density of a small, irregularly shaped stone. [4]`,
        ms: `Measure the mass of the stone using a balance :: (1)
Lower the stone into a displacement can, or a measuring cylinder partly filled with water :: (1)
Measure the volume of water displaced, which equals the volume of the stone :: (1)
Density = mass ÷ volume :: (1)` },
      { m: 4, d: 'm', p: ['P6_6.3', 'P6_6.2'],
        q: `(a) The count rate from a radioactive source falls from 800 counts per minute to 100 counts per minute in 15 hours. Calculate the half-life of the source. [2]
(b) Describe what happens in the nucleus of an atom when it emits a beta particle. [2]`,
        ms: `(a) 800 → 400 → 200 → 100 is three half-lives :: (1)
Half-life = 5 hours :: (1)
(b) A neutron changes into a proton :: (1)
and a fast-moving electron is emitted from the nucleus :: (1)` },
      { m: 6, d: 'h', p: ['P2_2.2', 'P2_2.3'],
        q: `A car of mass 1000 kg accelerates uniformly from 10 m/s to 25 m/s in 6.0 s.
(a) Calculate the acceleration of the car. [2]
(b) Calculate the resultant force on the car. [2]
(c) Calculate the distance travelled during the acceleration. Use v^2 − u^2 = 2as. [2]`,
        ms: `(a) a = {{25 − 10|6.0}} :: (1)
2.5 m/s^2 :: (1)
(b) F = m × a = 1000 × 2.5 :: (1)
2500 N :: (1)
(c) s = {{25^2 − 10^2|2 × 2.5}} :: (1)
105 m :: (1)` },
      { m: 3, d: 'm', p: ['P4_4.1'],
        q: `(a) A sound wave has a frequency of 250 Hz and a wavelength of 1.36 m. Calculate the speed of the wave. [2]
(b) State whether sound waves are transverse or longitudinal. [1]`,
        ms: `(a) v = f × λ = 250 × 1.36 :: (1)
340 m/s :: (1)
(b) Longitudinal :: (1)` },
      { m: 4, d: 'm', p: ['P7_7.2'],
        q: `Describe the life cycle of a star that is about the same size as the Sun, starting from a main sequence star. [4]`,
        ms: `Main sequence star: the forces from fusion and gravity are balanced :: (1)
When hydrogen runs out it expands to become a red giant :: (1)
It then loses its outer layers and the core collapses to a white dwarf :: (1)
The white dwarf cools to become a black dwarf :: (1)` },
    ],
  },
  {
    subject: 'EDX_GCSE_COMBSCI_1SC0', code: 'MIX', title: 'Demo Paper: Biology, chemistry and physics',
    questions: [
      { m: 3, d: 'e', p: ['B2_2.1'],
        q: `Describe what happens to a cell during mitosis. [3]`,
        ms: `One set of chromosomes is pulled to each end of the cell :: (1)
The nucleus divides :: (1)
The cytoplasm and cell membrane divide to form two genetically identical cells :: (1)` },
      { m: 4, d: 'm', p: ['B8_8.3'],
        q: `Compare aerobic and anaerobic respiration in human muscle cells. [4]`,
        ms: `Aerobic respiration uses oxygen; anaerobic respiration does not :: (1)
Aerobic respiration produces carbon dioxide and water :: (1)
Anaerobic respiration produces lactic acid :: (1)
Aerobic respiration transfers much more energy, because glucose is fully oxidised :: (1)` },
      { m: 3, d: 'e', p: ['C6_6.1'],
        q: `Explain why the Group 1 metals become more reactive down the group. [3]`,
        ms: `The atoms get larger, so the outer electron is further from the nucleus :: (1)
The attraction between the nucleus and the outer electron is weaker (more shielding) :: (1)
so the outer electron is lost more easily :: (1)` },
      { m: 4, d: 'm', p: ['C3_3.1'],
        q: `Describe how to make pure, dry crystals of copper sulfate from copper oxide and dilute sulfuric acid. [4]`,
        ms: `Add copper oxide to warm sulfuric acid until it is in excess (no more dissolves) :: (1)
Filter to remove the excess copper oxide :: (1)
Heat the solution gently to evaporate some of the water, then leave it to crystallise :: (1)
Pat the crystals dry with filter paper :: (1)` },
      { m: 4, d: 'm', p: ['P10_10.2'], x: ['P10_10.1'],
        q: `A 4 Ω resistor and a 6 Ω resistor are connected in series with a 12 V battery.
(a) Calculate the total resistance. [1]
(b) Calculate the current in the circuit. [2]
(c) Calculate the potential difference across the 6 Ω resistor. [1]`,
        ms: `(a) 10 Ω :: (1)
(b) I = V ÷ R = 12 ÷ 10 :: (1)
1.2 A :: (1)
(c) V = 1.2 × 6 = 7.2 V :: (1)` },
      { m: 5, d: 'h', p: ['P3_3.1'], x: ['P8_8.1'],
        q: `A student of mass 60 kg runs up a flight of stairs of vertical height 4.0 m in 5.0 s. Gravitational field strength = 10 N/kg.
(a) Calculate the gain in gravitational potential energy of the student. [2]
(b) Calculate the useful power developed by the student. [2]
(c) Explain why the total energy transferred by the student's muscles is greater than your answer to (a). [1]`,
        ms: `(a) ΔGPE = m × g × Δh = 60 × 10 × 4.0 :: (1)
2400 J :: (1)
(b) P = {{2400|5.0}} :: (1)
480 W :: (1)
(c) Some energy is dissipated to the surroundings, heating the body and the air :: (1)` },
    ],
  },
  {
    subject: 'OCR_GCSE_CS_J277', code: 'P12', title: 'Demo Paper: Computer systems and algorithms',
    questions: [
      { m: 3, d: 'e', p: ['1.2.4'],
        q: `(a) Convert the binary number 10110110 into denary. [1]
(b) Convert the binary number 10110110 into hexadecimal. [1]
(c) State what is meant by an overflow error. [1]`,
        ms: `(a) 182 :: (1)
(b) B6 :: (1)
(c) The result of a calculation needs more bits than are available to store it :: (1)` },
      { m: 4, d: 'm', p: ['1.1.1'],
        q: `Describe the purpose of the arithmetic logic unit (ALU), the control unit, the cache and the registers in a CPU. [4]`,
        ms: `ALU: carries out arithmetic calculations and logical comparisons :: (1)
Control unit: decodes instructions and sends signals to coordinate the other components :: (1)
Cache: very fast memory that stores frequently used instructions and data :: (1)
Registers: small, fast storage locations in the CPU that hold data being processed :: (1)` },
      { m: 4, d: 'm', p: ['1.3.1'],
        q: `Explain two differences between a star network topology and a mesh network topology. [4]`,
        ms: `In a star every device connects to a central switch; in a mesh devices connect directly to each other :: (1)
so if the switch fails the whole star network fails, but a mesh can re-route data :: (1)
A star needs less cabling :: (1)
so it is cheaper and simpler to set up than a full mesh :: (1)` },
      { m: 4, d: 'm', p: ['1.4.1'], x: ['1.4.2'],
        q: `(a) Describe what is meant by an SQL injection attack. [2]
(b) Describe one way to prevent an SQL injection attack. [2]`,
        ms: `(a) SQL code is entered into an input box on a website :: (1)
so the database runs it, revealing or changing data :: (1)
(b) Input validation or sanitisation :: (1)
so that any code entered is rejected or treated as plain text :: (1)` },
      { m: 4, d: 'm', p: ['2.1.3'],
        q: `A bubble sort is used to put the list [5, 2, 9, 1] into ascending order. Show the list after each comparison in the first pass. [4]`,
        ms: `Compare 5 and 2: swap to give [2, 5, 9, 1] :: (1)
Compare 5 and 9: no swap, [2, 5, 9, 1] :: (1)
Compare 9 and 1: swap to give [2, 5, 1, 9] :: (1)
The largest value, 9, is now in its final position :: (1)` },
      { m: 6, d: 'h', p: ['2.2.1'], x: ['2.1.2'],
        q: `Write an algorithm that asks the user to enter 10 numbers and then outputs the largest number and the mean of the numbers. [6]`,
        ms: `Example answer:
~~~
total = 0
largest = 0
for count = 1 to 10
    number = input("Enter a number")
    total = total + number
    if count == 1 or number > largest then
        largest = number
    endif
next count
print(largest)
print(total / 10)
~~~
A loop that repeats 10 times :: (1)
Input taken inside the loop :: (1)
Running total kept :: (1)
Largest value compared and updated correctly :: (1)
Mean calculated as total ÷ 10 :: (1)
Both values output :: (1)` },
    ],
  },
];
