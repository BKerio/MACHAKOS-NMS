/**
 * Nature of alert → specific nature taxonomy.
 *
 * Extracted verbatim from the legacy NCCG EOC system (cromemedia.com / addalerts.php),
 * where "nature" (id `state`) drove the "specific nature" (id `district-list`) cascade
 * via get_district.php. Labels are preserved exactly as they appear in the source
 * (including its original spellings) so reporting stays consistent with historical data.
 *
 * This is the single source of truth for both the auto-seed in IncidentService and the
 * scripts/reseed-nature-options.ts reseed script. Order here is the order shown in the UI.
 */
export const NATURE_TAXONOMY: Array<{ nature: string; details: string[] }> = [
  {
    nature: 'Maternity (maternal & neonatal disorders)',
    details: [
      'Miscarriage', 'Ectopic pregnancy', 'Placenta praevia', 'Placenta abruption',
      'Cord prolapse', 'Cord presentation', 'Shoulder dystocia', 'Placenta accrete',
      'Rupture of uterus', 'Amniotic fluid embolism', 'Pre eclampsia', 'Eclampsia',
      'Premature rupture of membrene (PPROM)', 'Inversion of uterus', 'Poor progress of labour',
      'Non reassuring fetal status', 'Birth asphyxia', 'Post -partum hemorrhage',
      'Malposition/ malpresentation', 'Delayed second stage', 'Previous scar', 'Still birth',
      'Intrauterine growth restriction', 'Intrauterine fetal demise (IUFD)',
      'Haemolytic disorders of newborn', 'Neonatal sepsis', 'Congenital malformation', 'Jaundice',
      'Birth trauma', 'Low birth weight', 'Small for gestation', 'Anemia in pregnancy',
      'Malaria in pregnancy', 'Precipitate labour', 'Cephalopelvic disproportion',
      'Post-partum psychosis', 'fetal tachycardia', 'fetal distress', 'obstructed labour', 'APH',
      'Cervical tear', 'cervical distortia', 'retained placenta', 'PROM', 'PET', 'BIRTH ANOMALIES',
      'BREECH PRESENTATION', 'respiratory distress syndrome', 'preterm labour', 'Preterm baby',
      'PULMONARY EMBOLISM', 'edematous cervix', 'DIABETES IN PREGNANCY',
    ],
  },
  {
    nature: 'Other gynecological disorders',
    details: [
      'Abortion', 'Menstrual disorders', 'Celvical dysplasia', 'Pelvic floor prolapse',
      'Uterine fibroids', 'Urinary incontinence', 'Polycystic ovarian syndrome',
    ],
  },
  // Per requested change #1, the legacy "Illnesses (medical & surgical)" category is
  // split into Medical and Surgical. This list is overwhelmingly medical; only clearly
  // operative conditions are placed under Surgical. NOTE: this classification should be
  // reviewed by a clinician - it is fully editable via the admin Nature Options page.
  {
    nature: 'Illnesses (Medical)',
    details: [
      'Acute respiratory disease', 'Malaria', 'HIV/AIDS', 'Urinary tract infection',
      'Sexually transmitted diseases', 'Acute cardiovascular diseases', 'Neoplasms (cancer)',
      'Cholera confirmed', 'Cholera suspected', 'EAR,NOSE & THROAT(ENT)', 'Endocrine conditions',
      'Acute infection (sepsis)', 'Gastro intestinal diseases', 'Acute neurological diseases',
      'Renal disorders', 'Anemia', 'Diabetes', 'Hypertension', 'Tuberculosis (TB)',
      'Enteric infections (watery diarrhea)', 'Physiatric conditions', 'Cellutis', 'Hepatitis A',
      'Measles suspect', 'Measles confirmed case', 'Polio case', 'Peptic ulcers diseases',
      'Gastritis', 'Malnutrition', 'Acute febrile illness', 'Meningitis',
      'Stroke', 'Asthma', 'Illness', 'convulsions', 'unconsciousness{ non-responsive]',
      'Adverse event following immunization {AEFI)', 'Anthrax', 'Dengue fever',
      'Guinea worm disease', 'Neonatal tetanus', 'plague', 'MPOX', 'SARS', 'Yellow fever',
      'whooping cough', 'Rabies', 'small pox', 'TB', 'ASCITES', 'pneumonia',
      'bleeding disorders',
    ],
  },
  {
    nature: 'Illnesses (Surgical)',
    details: [
      'ACUTE ABDOMEN', 'fracture', 'Hypovolemic shock',
    ],
  },
  {
    nature: 'Accidents',
    details: [
      'RTA (Road traffic accident)', 'Falls', 'Burn', 'Electrocution', 'Fire', 'Choking',
      'Drowning', 'Terrorist attacks', 'Flooding', 'Train accidents', 'RTA', 'stab wound',
    ],
  },
  {
    nature: 'Violence',
    details: [
      'Sexual violence(SGBV)', 'GBV (Physical)', 'Penetrating injuries', 'Blunt trauma',
      'Gun shot', 'Burns', 'Cut/stab', 'Mob justice',
    ],
  },
  {
    nature: 'Self -inflicted',
    details: [
      'Gun shot', 'Cut/stab', 'Intoxication', 'Intent to self-harm',
      'Intoxication recreational intent', 'Strangulation/asphyxiation', 'Burns', 'Poisoning',
    ],
  },
  { nature: 'Medical advice', details: ['Medical advice'] },
  { nature: 'Telemedicine', details: ['Telemedicine'] },
  { nature: 'Tele Counselling', details: ['Tele counselling'] },
  {
    nature: 'Public concern',
    details: [
      'Illegal dumping', 'Air pollution', 'Sewage burst', 'Water leakage', 'Smoke pollution',
      'Noise pollution',
    ],
  },
  { nature: 'Complaint and compliment', details: [] },
  { nature: 'General inquiry', details: [] },
  {
    nature: 'Others',
    details: [
      'Specimen referral', 'Specialist referral', 'Personnel referral', 'Emergency drugs',
      'Blood referral', 'Patient parameters referral', 'Cmmodities referral', 'Emergency standby',
      'Official duty',
    ],
  },
];
