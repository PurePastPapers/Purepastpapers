// DEMO question bank — A-Level Mathematics and Further Mathematics.
//
// Every question in tools/seed/questions is ORIGINAL DEMO CONTENT written for this build
// so the platform can be tried end to end. None of it is taken from an exam board paper.
// Replace it with official past-paper extracts (see README → "Adding real papers").
//
// Fields: m marks · d difficulty (e/m/h/x) · t minutes (optional) · p primary spec points
//         x crossover spec points ("@ID" = a spec point in another subject) · q question · ms mark scheme

export default [
  {
    subject: 'EDX_ALEVEL_MATH_9MA0', code: 'PURE', title: 'Demo Paper A: Pure Mathematics',
    questions: [
      { m: 4, d: 'e', p: ['PURE_DIFF_7.2'], x: ['PURE_DIFF_7.1'],
        q: `A curve has equation y = 3x^2 − 4x + 7.
(a) Find {{dy|dx}}. [2]
(b) Find the gradient of the curve at the point where x = 2. [2]`,
        ms: `(a) {{dy|dx}} = 6x − 4 :: M1 A1
(b) Substitutes x = 2: 6(2) − 4 = 8 :: M1 A1` },
      { m: 4, d: 'e', p: ['PURE_ALG_2.2'],
        q: `Simplify {{5 + √3|2 − √3}}, giving your answer in the form a + b√3, where a and b are integers. [4]`,
        ms: `Multiplies numerator and denominator by (2 + √3) :: M1
Numerator: (5 + √3)(2 + √3) = 10 + 7√3 + 3 :: M1
Denominator: 4 − 3 = 1 :: A1
13 + 7√3 :: A1` },
      { m: 5, d: 'e', p: ['PURE_ALG_2.3', 'PURE_ALG_2.5'],
        q: `The equation x^2 + kx + (k + 3) = 0, where k is a constant, has two distinct real roots.
(a) Show that k^2 − 4k − 12 > 0. [2]
(b) Find the set of possible values of k. [3]`,
        ms: `(a) Uses b^2 − 4ac > 0: k^2 − 4(k + 3) > 0, so k^2 − 4k − 12 > 0 :: M1 A1
(b) (k − 6)(k + 2) > 0, critical values k = 6 and k = −2 :: M1 A1
k < −2 or k > 6 :: A1` },
      { m: 6, d: 'm', p: ['PURE_COORD_3.2'], x: ['PURE_COORD_3.1', 'PURE_ALG_2.3'],
        q: `A circle C has equation x^2 + y^2 − 6x + 4y − 12 = 0.
(a) Find the coordinates of the centre of C and the radius of C. [3]
(b) The point P(6, 2) lies on C. Find an equation of the tangent to C at P, giving your answer in the form ax + by + c = 0, where a, b and c are integers. [3]`,
        ms: `(a) (x − 3)^2 + (y + 2)^2 = 25 :: M1
Centre (3, −2) :: A1
Radius 5 :: A1
(b) Gradient of radius = {{2 − (−2)|6 − 3}} = {{4|3}}, so tangent gradient = −{{3|4}} :: M1
y − 2 = −{{3|4}}(x − 6) :: M1
3x + 4y − 26 = 0 :: A1` },
      { m: 6, d: 'm', p: ['PURE_TRIG_5.7'], x: ['PURE_TRIG_5.5'],
        q: `Solve, for 0 ≤ x < 360°, the equation 2cos^2 x + 3sin x = 3. [6]`,
        ms: `Uses cos^2 x = 1 − sin^2 x :: M1
2sin^2 x − 3sin x + 1 = 0 :: A1
(2sin x − 1)(sin x − 1) = 0 :: M1
sin x = {{1|2}} or sin x = 1 :: A1
x = 30°, 150° :: A1
x = 90° :: A1` },
      { m: 5, d: 'm', p: ['PURE_EXP_6.4'], x: ['PURE_EXP_6.3', 'PURE_ALG_2.3'],
        q: `Solve the equation 2log_{3} x − log_{3}(x − 2) = 2. [5]`,
        ms: `Uses the power law: log_{3} x^2 :: M1
Combines logs: log_{3}{{x^2|x − 2}} = 2 :: M1
x^2 = 9(x − 2), so x^2 − 9x + 18 = 0 :: A1
(x − 3)(x − 6) = 0 :: M1
x = 3 or x = 6 (both valid since x > 2) :: A1` },
      { m: 6, d: 'm', p: ['PURE_SEQ_4.1'],
        q: `(a) Find the first three terms, in ascending powers of x, of the binomial expansion of (2 − 3x)^5. [4]
(b) Given that the coefficient of x in the expansion of (1 + ax)(2 − 3x)^5 is 16, find the value of the constant a. [2]`,
        ms: `(a) 2^5 + 5(2^4)(−3x) + 10(2^3)(−3x)^2 :: M1
32 :: B1
−240x :: A1
+720x^2 :: A1
(b) Coefficient of x: −240 + 32a = 16 :: M1
a = 8 :: A1` },
      { m: 6, d: 'm', p: ['PURE_INT_8.3'], x: ['PURE_INT_8.2', 'PURE_ALG_2.3'],
        q: `Find the exact area of the finite region bounded by the curve y = 6x − x^2 − 5 and the x-axis. [6]`,
        ms: `Solves 6x − x^2 − 5 = 0 to get x = 1 and x = 5 :: M1 A1
Integrates: 3x^2 − {{x^3|3}} − 5x :: M1 A1
Substitutes limits 5 and 1: {{25|3}} − (−{{7|3}}) :: M1
Area = {{32|3}} :: A1` },
      { m: 8, d: 'h', p: ['PURE_DIFF_7.4', 'PURE_DIFF_7.3'], x: ['PURE_DIFF_7.2'],
        q: `The curve C has equation y = x^2 e^{−x}.
(a) Find {{dy|dx}}. [3]
(b) Find the exact coordinates of the stationary points of C. [3]
(c) Determine the nature of each stationary point. [2]`,
        ms: `(a) Product rule: {{dy|dx}} = 2x e^{−x} − x^2 e^{−x} :: M1 A1 A1
(b) x e^{−x}(2 − x) = 0, so x = 0 or x = 2 :: M1
(0, 0) :: A1
(2, 4e^{−2}) :: A1
(c) {{d^2 y|dx^2}} = e^{−x}(x^2 − 4x + 2) :: M1
At x = 0 it is 2 > 0, so minimum; at x = 2 it is −2e^{−2} < 0, so maximum :: A1` },
      { m: 7, d: 'h', p: ['PURE_INT_8.5'], x: ['PURE_INT_8.2', 'PURE_INT_8.3'],
        q: `(a) Use integration by parts to find ∫ x e^{2x} dx. [3]
(b) Using the substitution u = 2 + sin x, or otherwise, find the exact value of ∫ from 0 to {{π|2}} of {{cos x|2 + sin x}} dx. [4]`,
        ms: `(a) u = x, {{dv|dx}} = e^{2x}: {{x|2}}e^{2x} − ∫ {{1|2}}e^{2x} dx :: M1 A1
{{x|2}}e^{2x} − {{1|4}}e^{2x} + c :: A1
(b) du = cos x dx, giving ∫ {{1|u}} du :: M1
Limits become u = 2 and u = 3 :: B1
[ln u] from 2 to 3 :: A1
ln {{3|2}} :: A1` },
      { m: 9, d: 'h', p: ['PURE_TRIG_5.6'], x: ['PURE_TRIG_5.7'],
        q: `(a) Express 3cos θ + 4sin θ in the form R cos(θ − α), where R > 0 and 0 < α < 90°. Give the value of α to 2 decimal places. [3]
(b) Hence solve, for 0 ≤ θ < 360°, the equation 3cos θ + 4sin θ = 2. [4]
(c) State the maximum value of 3cos θ + 4sin θ and the smallest positive value of θ at which it occurs. [2]`,
        ms: `(a) R = 5 :: B1
tan α = {{4|3}} :: M1
α = 53.13° :: A1
(b) cos(θ − 53.13°) = 0.4 :: M1
θ − 53.13° = 66.42° or 293.58° :: M1
θ = 119.6° :: A1
θ = 346.7° :: A1
(c) Maximum value 5 :: B1
when θ = 53.13° :: B1` },
      { m: 8, d: 'h', p: ['PURE_INT_8.7'], x: ['PURE_INT_8.8', 'PURE_INT_8.2'],
        q: `Water is leaking from a tank. The depth of water, h cm, at time t minutes satisfies the differential equation {{dh|dt}} = −k√h, where k is a positive constant.
Initially the depth is 100 cm. After 10 minutes the depth is 64 cm.
(a) Solve the differential equation to show that √h = 10 − {{t|5}}. [6]
(b) Find the time taken for the tank to empty. [2]`,
        ms: `(a) Separates variables: ∫ h^{−1/2} dh = ∫ −k dt :: M1
2√h = −kt + c :: A1
Uses t = 0, h = 100 to find c = 20 :: M1
Uses t = 10, h = 64: 16 = −10k + 20 :: M1
k = 0.4 :: A1
2√h = 20 − 0.4t, so √h = 10 − {{t|5}} :: A1
(b) Sets h = 0 :: M1
t = 50 minutes :: A1` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_MATH_9MA0', code: 'SM', title: 'Demo Paper B: Statistics and Mechanics',
    questions: [
      { m: 4, d: 'e', p: ['STATS_PROB_3.1'],
        q: `The events A and B are such that P(A) = 0.4, P(B) = 0.5 and P(A ∪ B) = 0.7.
(a) Find P(A ∩ B). [2]
(b) Determine whether A and B are independent. [2]`,
        ms: `(a) P(A ∩ B) = 0.4 + 0.5 − 0.7 = 0.2 :: M1 A1
(b) P(A) × P(B) = 0.4 × 0.5 = 0.2 :: M1
Equal to P(A ∩ B), so A and B are independent :: A1` },
      { m: 6, d: 'm', p: ['STATS_DIST_4.1'],
        q: `A manufacturer claims that 20% of the sweets it makes are red. A random sample of 15 sweets is taken. The random variable X is the number of red sweets in the sample.
(a) Find P(X = 3). [2]
(b) Find P(X ≥ 2). [3]
(c) State one assumption needed for a binomial model to be valid. [1]`,
        ms: `(a) X ~ B(15, 0.2); P(X = 3) = 455 × 0.2^3 × 0.8^{12} :: M1
= 0.250 :: A1
(b) 1 − P(X = 0) − P(X = 1) :: M1
= 1 − 0.0352 − 0.1319 :: A1
= 0.833 :: A1
(c) Sweets are red independently of one another, or the probability of red is constant :: B1` },
      { m: 6, d: 'm', p: ['STATS_DIST_4.2'],
        q: `The heights, X cm, of a variety of plant are modelled by a normal distribution with mean 50 and standard deviation 4.
(a) Find P(X > 55). [2]
(b) Find the height exceeded by 10% of the plants. [3]
(c) Give one reason why a normal distribution may be a suitable model for height. [1]`,
        ms: `(a) Standardises: z = {{55 − 50|4}} = 1.25 :: M1
P(X > 55) = 0.1056 :: A1
(b) Uses z = 1.2816 :: B1
h = 50 + 4 × 1.2816 :: M1
h = 55.1 cm :: A1
(c) Height is continuous and roughly symmetric about the mean, with most values close to it :: B1` },
      { m: 6, d: 'h', p: ['STATS_HYP_5.2'], x: ['STATS_DIST_4.1'],
        q: `A treatment is known to be effective for 40% of patients. A new version of the treatment is given to a random sample of 20 patients, and it is effective for 13 of them.
Test, at the 5% level of significance, whether the new version is effective for a greater proportion of patients. State your hypotheses clearly. [6]`,
        ms: `H_{0}: p = 0.4, H_{1}: p > 0.4 :: B1
X ~ B(20, 0.4) under H_{0} :: M1
P(X ≥ 13) = 1 − P(X ≤ 12) :: M1
= 1 − 0.9790 = 0.0210 :: A1
0.0210 < 0.05, so reject H_{0} :: M1
There is evidence that the new version is effective for a greater proportion of patients :: A1` },
      { m: 4, d: 'e', p: ['MECH_KIN_7.3'],
        q: `A car accelerates uniformly from rest to a speed of 20 m s^{−1} in 8 seconds.
(a) Find the acceleration of the car. [2]
(b) Find the distance travelled in this time. [2]`,
        ms: `(a) Uses v = u + at: 20 = 0 + 8a :: M1
a = 2.5 m s^{−2} :: A1
(b) s = {{1|2}}(u + v)t = {{1|2}} × 20 × 8 :: M1
s = 80 m :: A1` },
      { m: 7, d: 'm', p: ['MECH_FORCES_8.6', 'MECH_FORCES_8.2'], x: ['PURE_TRIG_5.3'],
        q: `A particle of mass 4 kg is released from rest on a rough plane inclined at 30° to the horizontal. The coefficient of friction between the particle and the plane is 0.3. Take g = 9.8 m s^{−2}.
(a) Find the normal reaction of the plane on the particle. [2]
(b) Find the acceleration of the particle down the plane. [4]
(c) State one modelling assumption you have made. [1]`,
        ms: `(a) R = 4g cos 30° :: M1
R = 33.9 N :: A1
(b) Friction = 0.3 × 33.9 = 10.2 N :: M1
Equation of motion: 4g sin 30° − 10.2 = 4a :: M1 A1
a = 2.35 m s^{−2} :: A1
(c) e.g. the particle has no size, or air resistance is ignored :: B1` },
      { m: 9, d: 'h', p: ['MECH_KIN_7.5'], x: ['MECH_KIN_7.3', 'PURE_TRIG_5.5'],
        q: `A ball is projected from a point O on horizontal ground with speed 25 m s^{−1} at an angle θ above the horizontal, where tan θ = {{3|4}}. The ball is modelled as a particle moving freely under gravity. Take g = 9.8 m s^{−2}.
(a) Find the time of flight of the ball. [3]
(b) Find the horizontal range of the ball. [2]
(c) Find the greatest height reached by the ball. [3]
(d) State one limitation of the model. [1]`,
        ms: `(a) sin θ = {{3|5}}, so vertical component = 15 m s^{−1} :: B1
0 = 15t − 4.9t^2 :: M1
t = 3.06 s :: A1
(b) Horizontal component = 20 m s^{−1}; range = 20 × 3.06 :: M1
= 61.2 m :: A1
(c) 0 = 15^2 − 2(9.8)h :: M1 A1
h = 11.5 m :: A1
(d) e.g. air resistance is ignored, or the ball is treated as a particle :: B1` },
      { m: 8, d: 'h', p: ['MECH_KIN_7.4'], x: ['PURE_DIFF_7.2', 'PURE_INT_8.3'],
        q: `A particle P moves along the x-axis. At time t seconds its velocity, v m s^{−1}, is given by v = 3t^2 − 12t + 9.
(a) Find the times at which P is instantaneously at rest. [2]
(b) Find the acceleration of P when t = 3. [2]
(c) Find the total distance travelled by P in the first 3 seconds. [4]`,
        ms: `(a) 3(t − 1)(t − 3) = 0 :: M1
t = 1 and t = 3 :: A1
(b) a = 6t − 12 :: M1
a = 6 m s^{−2} :: A1
(c) s = t^3 − 6t^2 + 9t :: M1 A1
Displacement is 4 m from t = 0 to 1 and −4 m from t = 1 to 3 :: M1
Total distance = 8 m :: A1` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_MATH_9MA0', code: 'STRETCH', title: 'Demo stretch set: beyond the specification (Extra hard)',
    questions: [
      { m: 8, d: 'x', t: 15, p: ['PURE_INT_8.5'], x: ['PURE_TRIG_5.6', 'PURE_INT_8.3'],
        q: `Use the substitution t = tan {{x|2}} to show that ∫ from 0 to {{π|2}} of {{1|2 + cos x}} dx = {{π|3√3}}. [8]`,
        ms: `States cos x = {{1 − t^2|1 + t^2}} :: B1
States dx = {{2|1 + t^2}} dt :: B1
Integrand becomes {{2|2(1 + t^2) + 1 − t^2}} = {{2|3 + t^2}} :: M1 A1
Limits become t = 0 and t = 1 :: B1
{{2|√3}} arctan {{t|√3}} :: M1 A1
{{2|√3}} × {{π|6}} = {{π|3√3}} :: A1` },
      { m: 8, d: 'x', t: 15, p: ['PURE_PROOF_1.1'], x: ['PURE_ALG_2.2', 'PURE_ALG_2.5'],
        q: `(a) Prove that a + b ≥ 2√(ab) for all positive real numbers a and b. [3]
(b) Hence prove that (a + b)(b + c)(c + a) ≥ 8abc for all positive real numbers a, b and c. [3]
(c) State, with a reason, when equality holds in part (b). [2]`,
        ms: `(a) (√a − √b)^2 ≥ 0 :: M1
a − 2√(ab) + b ≥ 0 :: M1
So a + b ≥ 2√(ab) :: A1
(b) Applies part (a) to each bracket :: M1
Product ≥ 2√(ab) × 2√(bc) × 2√(ca) = 8√(a^2 b^2 c^2) :: M1
= 8abc :: A1
(c) Equality needs √a = √b, √b = √c and √c = √a :: M1
So a = b = c :: A1` },
      { m: 10, d: 'x', t: 18, p: ['PURE_SEQ_4.3'], x: ['PURE_ALG_2.10', 'PURE_PROOF_1.1'],
        q: `(a) Show that {{1|r(r + 1)}} = {{1|r}} − {{1|r + 1}}. [2]
(b) Hence find, in terms of n, the sum of {{1|r(r + 1)}} from r = 1 to n. [3]
(c) Explain why {{1|r^2}} < {{1|r(r − 1)}} for every integer r ≥ 2. [1]
(d) Hence show that the sum of {{1|r^2}} from r = 1 to n is less than 2 for every positive integer n. [4]`,
        ms: `(a) {{1|r}} − {{1|r + 1}} = {{(r + 1) − r|r(r + 1)}} = {{1|r(r + 1)}} :: M1 A1
(b) Writes out terms and cancels (method of differences) :: M1
Sum = 1 − {{1|n + 1}} :: A1
= {{n|n + 1}} :: A1
(c) r^2 > r(r − 1) > 0, so the reciprocal is smaller :: B1
(d) Sum from r = 2 to n of {{1|r^2}} < sum from r = 2 to n of {{1|r(r − 1)}} :: M1
= 1 − {{1|n}} by part (b) :: M1 A1
So the full sum is less than 1 + 1 − {{1|n}} < 2 :: A1` },
      { m: 9, d: 'x', t: 16, p: ['PURE_ALG_2.8'], x: ['PURE_ALG_2.4', 'PURE_DIFF_7.3'],
        q: `The function f satisfies f(x) + 2f({{1|x}}) = 3x for all real x ≠ 0.
(a) Find f(x). [4]
(b) Solve the equation f(x) = 1. [3]
(c) Show that f is a decreasing function for x > 0. [2]`,
        ms: `(a) Replaces x by {{1|x}}: f({{1|x}}) + 2f(x) = {{3|x}} :: M1
Solves the two equations simultaneously for f(x) :: M1
3f(x) = {{6|x}} − 3x :: A1
f(x) = {{2|x}} − x :: A1
(b) {{2|x}} − x = 1, so x^2 + x − 2 = 0 :: M1
(x − 1)(x + 2) = 0 :: M1
x = 1 or x = −2 :: A1
(c) f′(x) = −{{2|x^2}} − 1 :: M1
This is negative for all x > 0, so f is decreasing :: A1` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_FMATH_9FM0', code: 'CP', title: 'Demo Paper: Core Pure Mathematics',
    questions: [
      { m: 5, d: 'e', p: ['CP_COMPLEX_2.2'],
        q: `The complex numbers z and w are given by z = 3 + 4i and w = 1 − 2i.
(a) Find zw. [2]
(b) Find {{z|w}} in the form a + bi, where a and b are real. [3]`,
        ms: `(a) 3 − 6i + 4i − 8i^2 :: M1
= 11 − 2i :: A1
(b) Multiplies numerator and denominator by 1 + 2i :: M1
{{(3 + 4i)(1 + 2i)|5}} = {{−5 + 10i|5}} :: A1
= −1 + 2i :: A1` },
      { m: 5, d: 'e', p: ['CP_MATRICES_3.3'], x: ['CP_MATRICES_3.1', 'CP_MATRICES_3.4'],
        q: `The matrix **A** has rows (2, 1) and (5, 3).
(a) Find det **A**. [1]
(b) Find **A**^{−1}. [2]
(c) Hence solve the simultaneous equations 2x + y = 4 and 5x + 3y = 11. [2]`,
        ms: `(a) det **A** = 6 − 5 = 1 :: B1
(b) **A**^{−1} has rows (3, −1) and (−5, 2) :: M1 A1
(c) Multiplies **A**^{−1} by the column vector (4, 11) :: M1
x = 1, y = 2 :: A1` },
      { m: 7, d: 'm', p: ['CP_ALG_4.1'], x: ['CP_ALG_4.2'],
        q: `The cubic equation 2x^3 − 4x^2 + 3x + 5 = 0 has roots α, β and γ.
(a) Write down the values of α + β + γ, αβ + βγ + γα and αβγ. [2]
(b) Find the value of α^2 + β^2 + γ^2. [2]
(c) Find a cubic equation with integer coefficients whose roots are 2α, 2β and 2γ. [3]`,
        ms: `(a) Sum = 2, sum of products in pairs = {{3|2}}, product = −{{5|2}} :: B1 B1
(b) (α + β + γ)^2 − 2(αβ + βγ + γα) = 4 − 3 :: M1
= 1 :: A1
(c) Substitutes x = {{w|2}} :: M1
{{w^3|4}} − w^2 + {{3w|2}} + 5 = 0 :: A1
w^3 − 4w^2 + 6w + 20 = 0 :: A1` },
      { m: 6, d: 'm', p: ['CP_PROOF_1.1'], x: ['CP_ALG_4.3'],
        q: `Prove by induction that, for all positive integers n, the sum of r(r + 1) from r = 1 to n is equal to {{n(n + 1)(n + 2)|3}}. [6]`,
        ms: `n = 1: LHS = 2 and RHS = {{1 × 2 × 3|3}} = 2, so true for n = 1 :: B1
Assumes the result is true for n = k :: M1
Adds the (k + 1)th term: {{k(k + 1)(k + 2)|3}} + (k + 1)(k + 2) :: M1
= {{(k + 1)(k + 2)(k + 3)|3}} :: A1
This is the result with n = k + 1 :: A1
True for n = 1, and true for n = k implies true for n = k + 1, so true for all positive integers n :: A1` },
      { m: 8, d: 'm', p: ['CP_HYP_8.1'], x: ['CP_HYP_8.3'],
        q: `(a) Starting from the definitions of sinh x and cosh x in terms of exponentials, prove that cosh^2 x − sinh^2 x = 1. [3]
(b) Solve the equation 2cosh^2 x − 3sinh x = 1, giving your answers as exact logarithms. [5]`,
        ms: `(a) cosh^2 x = {{e^{2x} + 2 + e^{−2x}|4}} and sinh^2 x = {{e^{2x} − 2 + e^{−2x}|4}} :: M1 A1
Subtracts to obtain {{4|4}} = 1 :: A1
(b) Uses cosh^2 x = 1 + sinh^2 x: 2sinh^2 x − 3sinh x + 1 = 0 :: M1
(2sinh x − 1)(sinh x − 1) = 0 :: M1
sinh x = {{1|2}} or sinh x = 1 :: A1
x = ln(1 + √2) :: A1
x = ln {{1 + √5|2}} :: A1` },
      { m: 9, d: 'h', p: ['CP_DE_9.3'], x: ['CP_DE_9.2'],
        q: `(a) Find the general solution of the differential equation {{d^2 y|dx^2}} − 5{{dy|dx}} + 6y = 12x − 4. [6]
(b) Find the particular solution for which y = 3 and {{dy|dx}} = 5 when x = 0. [3]`,
        ms: `(a) Auxiliary equation m^2 − 5m + 6 = 0, so m = 2 or 3 :: M1 A1
Complementary function Ae^{2x} + Be^{3x} :: A1
Tries y = ax + b: −5a + 6(ax + b) = 12x − 4 :: M1
a = 2, b = 1 :: A1
y = Ae^{2x} + Be^{3x} + 2x + 1 :: A1
(b) A + B + 1 = 3 and 2A + 3B + 2 = 5 :: M1
A = 3, B = −1 :: A1
y = 3e^{2x} − e^{3x} + 2x + 1 :: A1` },
      { m: 6, d: 'h', p: ['CP_POLAR_7.3'], x: ['CP_POLAR_7.2', '@EDX_MATH_PURE_TRIG_5.6', '@EDX_MATH_PURE_INT_8.3'],
        q: `The curve C has polar equation r = 2(1 + cos θ), 0 ≤ θ < 2π. Find the exact area enclosed by C. [6]`,
        ms: `Area = {{1|2}} ∫ r^2 dθ = {{1|2}} ∫ 4(1 + cos θ)^2 dθ from 0 to 2π :: M1
Expands: 1 + 2cos θ + cos^2 θ :: M1
Uses cos^2 θ = {{1|2}}(1 + cos 2θ) :: M1
2[{{3θ|2}} + 2sin θ + {{sin 2θ|4}}] from 0 to 2π :: A1 A1
Area = 6π :: A1` },
      { m: 9, d: 'h', p: ['CP_COMPLEX_2.5'], x: ['@EDX_MATH_PURE_TRIG_5.7'],
        q: `(a) Use de Moivre's theorem to show that cos 3θ = 4cos^3 θ − 3cos θ. [4]
(b) Hence find the three roots of the equation 8x^3 − 6x − 1 = 0, giving each answer in the form cos(kπ). [5]`,
        ms: `(a) (cos θ + i sin θ)^3 = cos 3θ + i sin 3θ :: M1
Expands and takes the real part: cos^3 θ − 3cos θ sin^2 θ :: M1 A1
Uses sin^2 θ = 1 − cos^2 θ to obtain 4cos^3 θ − 3cos θ :: A1
(b) Lets x = cos θ: 2(4cos^3 θ − 3cos θ) = 1 :: M1
cos 3θ = {{1|2}} :: A1
3θ = {{π|3}}, {{5π|3}}, {{7π|3}} :: M1
x = cos {{π|9}}, cos {{5π|9}}, cos {{7π|9}} :: A1 A1` },
      { m: 8, d: 'x', t: 15, p: ['CP_ALG_4.4'], x: ['CP_PROOF_1.1'],
        q: `(a) Show that r × r! = (r + 1)! − r!. [2]
(b) Hence show that the sum of r × r! from r = 1 to n is (n + 1)! − 1. [3]
(c) Find, with justification, the remainder when the sum of r × r! from r = 1 to 100 is divided by 101. [3]`,
        ms: `(a) (r + 1)! − r! = r!(r + 1 − 1) = r × r! :: M1 A1
(b) Writes the sum as a telescoping series :: M1
All terms cancel except (n + 1)! and −1! :: M1
Sum = (n + 1)! − 1 :: A1
(c) The sum is 101! − 1 :: B1
101! is a multiple of 101 :: M1
So the remainder is 100 :: A1` },
      { m: 9, d: 'h', t: 14, p: ['FP2_CALC_2.1'], x: ['@EDX_MATH_PURE_INT_8.5'],
        q: `The integral I_{n} is defined as the integral of sin^n x from x = 0 to x = {{π|2}}, for integers n ≥ 0.
(a) Show that I_{n} = {{n − 1|n}} I_{n−2} for n ≥ 2. [6]
(b) Hence find the exact value of I_{6}. [3]`,
        ms: `(a) Writes sin^n x = sin^{n−1} x × sin x and integrates by parts :: M1
[−sin^{n−1} x cos x] + (n − 1)∫ sin^{n−2} x cos^2 x dx :: A1
The bracket is zero at both limits :: B1
Uses cos^2 x = 1 − sin^2 x :: M1
I_{n} = (n − 1)I_{n−2} − (n − 1)I_{n} :: A1
nI_{n} = (n − 1)I_{n−2}, giving the result :: A1
(b) I_{0} = {{π|2}} :: B1
I_{6} = {{5|6}} × {{3|4}} × {{1|2}} × {{π|2}} :: M1
= {{5π|32}} :: A1` },
      { m: 8, d: 'x', t: 15, p: ['CP_COMPLEX_2.3'], x: ['CP_COMPLEX_2.4'],
        q: `The complex number z satisfies |z| = 1 and z ≠ −1. Let w = {{z − 1|z + 1}}.
(a) Show that the real part of w is zero. [5]
(b) Interpret this result geometrically, referring to the points representing −1, 1 and z on an Argand diagram. [3]`,
        ms: `(a) Considers w + w*, where * denotes the complex conjugate :: M1
= {{(z − 1)(z* + 1) + (z* − 1)(z + 1)|(z + 1)(z* + 1)}} :: M1
Numerator = 2zz* − 2 :: A1
Uses zz* = |z|^2 = 1, so the numerator is 0 :: M1
w + w* = 0, so Re(w) = 0 :: A1
(b) arg w is the angle between the lines joining z to 1 and z to −1 :: M1
w is purely imaginary, so this angle is a right angle :: A1
The angle in a semicircle on the diameter from −1 to 1 is 90° :: A1` },
    ],
  },
];
