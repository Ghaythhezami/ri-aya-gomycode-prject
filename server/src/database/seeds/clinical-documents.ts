/**
 * Demo clinical-document history for the doctor AI assistant (fictional data only).
 *
 * Five Central Clinic patients of Dr. Emily Carter each get a multi-document story
 * (labs, imaging, operative and discharge reports, prescriptions) as real text PDFs
 * with schema-valid extractions, plus a coherent clinical note. Rows owned by this
 * module carry the file-name prefix `demo-`; they are replaced on every run.
 */
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { extractionResultSchema, type ExtractionResult } from '../../documents/document-schemas';
import { buildMinimalPdf } from './minimal-pdf';

export const DEMO_DOCUMENT_PREFIX = 'demo-';
const DOCTOR_EMAIL = 'doctor@riaya.local';
const WRAP = 92;

type Category = ExtractionResult['category'];
type Flag = 'low' | 'normal' | 'high' | 'abnormal';
type Value = ExtractionResult['values'][number];
type Medication = ExtractionResult['medications'][number];

export interface DocumentSpec {
  key: string;
  category: Category;
  daysAgo: number;
  title: string;
  facility: string;
  signer: string;
  sections: { heading: string; lines: string[] }[];
  findings: string[];
  values?: Value[];
  medications?: Medication[];
  summary: string;
  patientSummary: string;
}

export interface Story {
  label: string;
  clinicalNote: (name: string) => string;
  documents: DocumentSpec[];
}

const lab = (
  name: string,
  value: string,
  unit: string | null,
  referenceRange: string | null,
  flag: Flag,
): Value => ({ name, value, unit, referenceRange, flag });

const LAB = 'Riverside Medical Laboratory (fictional)';
const IMG = 'Al Noor Imaging Centre (fictional)';
const HOSP = 'Central Surgical Hospital (fictional)';
const CLINIC = 'Central Clinic - Dr. Emily Carter, General Medicine';

// ---------------------------------------------------------------- A: diabetes + hypertension
const storyA: Story = {
  label: 'Type 2 diabetes and hypertension',
  clinicalNote: () =>
    'Type 2 diabetes (diagnosed 2024) and essential hypertension, followed every 3-4 months. HbA1c improved 8.4% -> 7.6% -> 6.9% on metformin 1000 mg twice daily; BP controlled on amlodipine 5 mg; LDL on atorvastatin 40 mg near target. eGFR stable (84), urine ACR mildly raised (microalbuminuria, recheck in 6 months). ECG: sinus rhythm, no ischaemia. No known drug allergies. Plan: continue regimen, annual retinal and foot review, lifestyle advice reinforced.',
  documents: [
    {
      key: 'a-lab-1',
      category: 'lab_result',
      daysAgo: 540,
      title: 'Diabetes and renal panel (baseline)',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: [
            'Poor glycaemic control. Microalbuminuria present. LDL above target for diabetes.',
          ],
        },
      ],
      findings: [
        'HbA1c 8.4%, poor glycaemic control',
        'LDL cholesterol raised',
        'Urine albumin/creatinine ratio raised',
      ],
      values: [
        lab('HbA1c', '8.4', '%', '4.0-5.6', 'high'),
        lab('Fasting glucose', '10.2', 'mmol/L', '3.9-5.6', 'high'),
        lab('Total cholesterol', '5.9', 'mmol/L', '<5.2', 'high'),
        lab('LDL cholesterol', '3.8', 'mmol/L', '<2.6', 'high'),
        lab('HDL cholesterol', '1.0', 'mmol/L', '>1.0', 'normal'),
        lab('Triglycerides', '2.4', 'mmol/L', '<1.7', 'high'),
        lab('Creatinine', '82', 'umol/L', '53-97', 'normal'),
        lab('eGFR', '88', 'mL/min/1.73 m2', '>90', 'low'),
        lab('Urine albumin/creatinine ratio', '4.1', 'mg/mmol', '<3.0', 'high'),
        lab('Potassium', '4.3', 'mmol/L', '3.5-5.1', 'normal'),
      ],
      summary:
        'Baseline panel: HbA1c 8.4% and fasting glucose 10.2 mmol/L (uncontrolled). LDL 3.8 mmol/L with high triglycerides. Urine ACR 4.1 mg/mmol (microalbuminuria); creatinine and potassium normal, eGFR 88.',
      patientSummary:
        'This blood and urine panel measures your sugar control, cholesterol and kidney function. Several results were above the reference range.',
    },
    {
      key: 'a-lab-2',
      category: 'lab_result',
      daysAgo: 360,
      title: 'Diabetes and renal panel (follow-up)',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: ['HbA1c improved from 8.4% but remains above target. Lipids improving.'],
        },
      ],
      findings: ['HbA1c 7.6%, improved but above target', 'LDL cholesterol improved to 2.9 mmol/L'],
      values: [
        lab('HbA1c', '7.6', '%', '4.0-5.6', 'high'),
        lab('Fasting glucose', '7.8', 'mmol/L', '3.9-5.6', 'high'),
        lab('Total cholesterol', '4.8', 'mmol/L', '<5.2', 'normal'),
        lab('LDL cholesterol', '2.9', 'mmol/L', '<2.6', 'high'),
        lab('HDL cholesterol', '1.1', 'mmol/L', '>1.0', 'normal'),
        lab('Triglycerides', '1.9', 'mmol/L', '<1.7', 'high'),
        lab('Creatinine', '80', 'umol/L', '53-97', 'normal'),
        lab('eGFR', '89', 'mL/min/1.73 m2', '>90', 'low'),
        lab('Urine albumin/creatinine ratio', '3.6', 'mg/mmol', '<3.0', 'high'),
        lab('Potassium', '4.4', 'mmol/L', '3.5-5.1', 'normal'),
      ],
      summary:
        'HbA1c down to 7.6% (from 8.4%), fasting glucose 7.8 mmol/L. LDL 2.9 mmol/L, triglycerides 1.9. Renal function stable (creatinine 80, eGFR 89), ACR 3.6 mg/mmol slightly raised.',
      patientSummary:
        'Your sugar control and cholesterol have improved since the last panel, though some values are still above the reference range.',
    },
    {
      key: 'a-rx',
      category: 'prescription',
      daysAgo: 360,
      title: 'Prescription - diabetes, blood pressure and cholesterol',
      facility: CLINIC,
      signer: 'Dr. Emily Carter, General Medicine',
      sections: [
        {
          heading: 'Instructions',
          lines: [
            'Take metformin with meals. Atorvastatin in the evening. Review in 3 months with repeat HbA1c.',
          ],
        },
      ],
      findings: [
        'Metformin dose increased to 1000 mg twice daily',
        'Atorvastatin increased to 40 mg',
      ],
      medications: [
        { name: 'Metformin', dose: '1000 mg', frequency: 'twice daily with meals' },
        { name: 'Amlodipine', dose: '5 mg', frequency: 'once daily' },
        { name: 'Atorvastatin', dose: '40 mg', frequency: 'once daily in the evening' },
      ],
      summary:
        'Current regimen: metformin 1000 mg twice daily, amlodipine 5 mg daily and atorvastatin 40 mg nightly. Metformin and atorvastatin were uptitrated after the second panel.',
      patientSummary:
        'This prescription lists your three regular medicines, with the dose and when to take each one.',
    },
    {
      key: 'a-ecg',
      category: 'other',
      daysAgo: 345,
      title: 'Resting 12-lead ECG report',
      facility: 'Central Clinic ECG Unit (fictional)',
      signer: 'Dr. Samir Haddad, Cardiology (fictional)',
      sections: [
        {
          heading: 'Indication',
          lines: ['Hypertension and diabetes, cardiovascular risk assessment.'],
        },
        {
          heading: 'Findings',
          lines: [
            'Sinus rhythm, rate 72 bpm. PR 160 ms, QRS 90 ms, QTc 420 ms. Normal axis.',
            'No ST-T changes. No pathological Q waves. No left ventricular hypertrophy by voltage criteria.',
          ],
        },
        { heading: 'Conclusion', lines: ['Normal resting ECG.'] },
      ],
      findings: ['Sinus rhythm 72 bpm', 'No ischaemic changes', 'No LVH', 'Normal resting ECG'],
      values: [
        lab('Heart rate', '72', 'bpm', '60-100', 'normal'),
        lab('PR interval', '160', 'ms', '120-200', 'normal'),
        lab('QRS duration', '90', 'ms', '<120', 'normal'),
        lab('QTc', '420', 'ms', '<450', 'normal'),
      ],
      summary:
        'Normal resting ECG: sinus rhythm at 72 bpm, normal intervals, no ischaemic changes and no left ventricular hypertrophy.',
      patientSummary:
        'Your heart tracing showed a regular rhythm with no abnormal findings reported.',
    },
    {
      key: 'a-lab-3',
      category: 'lab_result',
      daysAgo: 40,
      title: 'Diabetes and renal panel (latest)',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: [
            'HbA1c close to target (6.9%). Lipid profile at goal. Urine ACR persistently mildly raised.',
          ],
        },
      ],
      findings: ['HbA1c 6.9%, near target', 'LDL 2.2 mmol/L at goal', 'Microalbuminuria persists'],
      values: [
        lab('HbA1c', '6.9', '%', '4.0-5.6', 'high'),
        lab('Fasting glucose', '6.4', 'mmol/L', '3.9-5.6', 'high'),
        lab('Total cholesterol', '4.1', 'mmol/L', '<5.2', 'normal'),
        lab('LDL cholesterol', '2.2', 'mmol/L', '<2.6', 'normal'),
        lab('HDL cholesterol', '1.2', 'mmol/L', '>1.0', 'normal'),
        lab('Triglycerides', '1.5', 'mmol/L', '<1.7', 'normal'),
        lab('Creatinine', '81', 'umol/L', '53-97', 'normal'),
        lab('eGFR', '84', 'mL/min/1.73 m2', '>90', 'low'),
        lab('Urine albumin/creatinine ratio', '3.4', 'mg/mmol', '<3.0', 'high'),
        lab('Potassium', '4.5', 'mmol/L', '3.5-5.1', 'normal'),
      ],
      summary:
        'HbA1c 6.9% (8.4% -> 7.6% -> 6.9%), fasting glucose 6.4 mmol/L. LDL 2.2, HDL 1.2, triglycerides 1.5 (all at goal). Creatinine 81, eGFR 84, potassium 4.5; urine ACR 3.4 mg/mmol still mildly raised.',
      patientSummary:
        'Your latest panel shows sugar control close to target and cholesterol in range. One urine kidney marker is still slightly high.',
    },
  ],
};

// ---------------------------------------------------------------- B: knee injury
const storyB: Story = {
  label: 'Right knee ACL and meniscus injury with reconstruction',
  clinicalNote: () =>
    'Right knee twisting injury (sports) 14 months ago with instability. MRI: complete ACL tear, medial meniscus tear, bone bruise. Referred to orthopaedics; arthroscopic ACL reconstruction (hamstring autograft) with partial medial meniscectomy done without complications, discharged day 1. Six-week post-op X-ray: tunnels and fixation satisfactory. Currently in physiotherapy; progressive loading, no running until cleared at 4-6 months. No known drug allergies.',
  documents: [
    {
      key: 'b-xray',
      category: 'imaging_report',
      daysAgo: 400,
      title: 'X-ray right knee (AP and lateral)',
      facility: IMG,
      signer: 'Dr. Layla Nasser, Consultant Radiologist (fictional)',
      sections: [
        {
          heading: 'Clinical information',
          lines: ['Twisting injury, swelling and instability of the right knee.'],
        },
        {
          heading: 'Findings',
          lines: [
            'No acute fracture or dislocation. Small joint effusion. Joint spaces preserved. Mild soft-tissue swelling.',
          ],
        },
        {
          heading: 'Impression',
          lines: ['No bony injury. Effusion suggests internal derangement; MRI recommended.'],
        },
      ],
      findings: [
        'No fracture or dislocation',
        'Small joint effusion',
        'MRI recommended for internal derangement',
      ],
      summary:
        'Right knee radiographs: no fracture or dislocation, small effusion, preserved joint spaces. MRI advised for suspected ligament or meniscal injury.',
      patientSummary:
        'Your knee X-ray showed no broken bone but some fluid in the joint. An MRI scan was suggested.',
    },
    {
      key: 'b-mri',
      category: 'imaging_report',
      daysAgo: 385,
      title: 'MRI right knee',
      facility: IMG,
      signer: 'Dr. Layla Nasser, Consultant Radiologist (fictional)',
      sections: [
        {
          heading: 'Findings',
          lines: [
            'Anterior cruciate ligament: complete mid-substance tear with fibre discontinuity.',
            'Medial meniscus: posterior horn tear, complex pattern, reaching the inferior articular surface.',
            'Lateral meniscus intact. PCL, MCL and LCL intact.',
            'Bone bruise (marrow oedema) at the lateral femoral condyle and posterolateral tibial plateau.',
            'Moderate joint effusion. Cartilage preserved.',
          ],
        },
        {
          heading: 'Impression',
          lines: [
            '1. Complete ACL tear.',
            '2. Medial meniscus posterior horn tear.',
            '3. Bone bruise, lateral femoral condyle and tibial plateau.',
          ],
        },
      ],
      findings: [
        'Complete ACL tear',
        'Medial meniscus posterior horn tear',
        'Bone bruise lateral femoral condyle and tibial plateau',
        'Moderate effusion',
      ],
      summary:
        'MRI right knee: complete ACL tear, medial meniscus posterior horn tear and bone bruising of the lateral femoral condyle and tibial plateau. Collateral ligaments and PCL intact; cartilage preserved.',
      patientSummary:
        'Your knee MRI reports a torn ACL ligament, a tear in the inner cartilage pad (meniscus) and a bone bruise.',
    },
    {
      key: 'b-referral',
      category: 'referral',
      daysAgo: 380,
      title: 'Orthopaedic referral letter',
      facility: CLINIC,
      signer: 'Dr. Emily Carter, General Medicine',
      sections: [
        {
          heading: 'To',
          lines: [
            'Dr. Karim Faisal, Orthopaedic and Sports Surgery, Central Surgical Hospital (fictional)',
          ],
        },
        {
          heading: 'Reason for referral',
          lines: [
            'Right knee instability after a twisting injury. MRI confirms complete ACL tear with medial meniscus tear.',
            'Active patient, wishes to return to sport. Request assessment for ACL reconstruction.',
            'No known drug allergies. No anticoagulants. Not diabetic.',
          ],
        },
      ],
      findings: [
        'Referral to orthopaedic surgery for ACL reconstruction',
        'MRI: complete ACL tear and medial meniscus tear',
      ],
      summary:
        'Referral to Dr. Karim Faisal (orthopaedics) for right knee instability with MRI-proven ACL and medial meniscus tears; surgical assessment requested.',
      patientSummary: 'This letter asks a knee surgeon to assess you after your MRI.',
    },
    {
      key: 'b-op',
      category: 'other',
      daysAgo: 340,
      title: 'Operative report - arthroscopic ACL reconstruction',
      facility: HOSP,
      signer: 'Dr. Karim Faisal, Orthopaedic Surgeon (fictional)',
      sections: [
        {
          heading: 'Procedure',
          lines: [
            'Right knee arthroscopic ACL reconstruction with hamstring (semitendinosus and gracilis) autograft and partial medial meniscectomy.',
          ],
        },
        { heading: 'Anaesthesia', lines: ['General anaesthesia with femoral nerve block. ASA I.'] },
        {
          heading: 'Findings',
          lines: [
            'Complete ACL rupture. Medial meniscus posterior horn complex tear, unsalvageable portion resected. Lateral compartment and cartilage normal.',
          ],
        },
        {
          heading: 'Technique',
          lines: [
            'Four-strand hamstring graft 8 mm, femoral and tibial tunnels, suspensory fixation femur and interference screw tibia. Meniscal rim preserved.',
          ],
        },
        {
          heading: 'Complications and blood loss',
          lines: ['Complications: none. Estimated blood loss: 30 mL. Tourniquet time 62 minutes.'],
        },
      ],
      findings: [
        'Arthroscopic ACL reconstruction, hamstring autograft',
        'Partial medial meniscectomy',
        'General anaesthesia with nerve block',
        'Complications: none',
        'Estimated blood loss 30 mL',
      ],
      summary:
        'Arthroscopic right ACL reconstruction with hamstring autograft (8 mm) and partial medial meniscectomy under general anaesthesia and nerve block. No complications; estimated blood loss 30 mL.',
      patientSummary:
        'This report describes your knee operation: the torn ligament was replaced using a tendon from your own leg and the damaged part of the cartilage pad was trimmed. No problems occurred.',
    },
    {
      key: 'b-discharge',
      category: 'discharge_summary',
      daysAgo: 339,
      title: 'Discharge summary - ACL reconstruction',
      facility: HOSP,
      signer: 'Dr. Karim Faisal, Orthopaedic Surgeon (fictional)',
      sections: [
        {
          heading: 'Admission',
          lines: [
            'Elective admission for right ACL reconstruction. Uneventful post-operative course, discharged day 1.',
          ],
        },
        {
          heading: 'Discharge medication',
          lines: [
            'Paracetamol 1 g every 6 hours as needed; Ibuprofen 400 mg three times daily with food for 5 days; Enoxaparin 40 mg once daily for 7 days.',
          ],
        },
        {
          heading: 'Physiotherapy plan',
          lines: [
            'Weeks 0-2: weight bearing as tolerated with crutches, range of motion 0-90 degrees, quadriceps activation.',
            'Weeks 2-6: full extension, closed-chain strengthening, stationary bike.',
            'Weeks 6-12: progressive strengthening, balance work. No running or pivoting before 4 months. Return to sport at 6-9 months with clearance.',
            'Follow-up: wound check at 2 weeks, X-ray and review at 6 weeks.',
          ],
        },
      ],
      findings: [
        'Discharged day 1, uneventful',
        'Staged physiotherapy plan, no running before 4 months',
        'Follow-up X-ray at 6 weeks',
      ],
      medications: [
        { name: 'Paracetamol', dose: '1 g', frequency: 'every 6 hours as needed' },
        { name: 'Ibuprofen', dose: '400 mg', frequency: 'three times daily with food for 5 days' },
        { name: 'Enoxaparin', dose: '40 mg', frequency: 'once daily for 7 days' },
      ],
      summary:
        'Discharged day 1 after uncomplicated right ACL reconstruction. Analgesia plus 7 days of enoxaparin. Staged physiotherapy; no running or pivoting before 4 months; review and X-ray at 6 weeks.',
      patientSummary:
        'This summary covers your hospital stay, your medicines and the physiotherapy steps for the weeks after your knee operation.',
    },
    {
      key: 'b-xray-fu',
      category: 'imaging_report',
      daysAgo: 295,
      title: 'X-ray right knee - 6 week post-operative',
      facility: IMG,
      signer: 'Dr. Layla Nasser, Consultant Radiologist (fictional)',
      sections: [
        {
          heading: 'Findings',
          lines: [
            'Femoral and tibial tunnels well positioned. Fixation devices in satisfactory alignment, no loosening.',
            'No fracture. Joint alignment normal. Resolving soft-tissue swelling, no effusion of note.',
          ],
        },
        {
          heading: 'Impression',
          lines: ['Satisfactory post-ACL reconstruction appearance at 6 weeks.'],
        },
      ],
      findings: [
        'Tunnels and fixation satisfactory',
        'No loosening or fracture',
        'Normal alignment',
      ],
      summary:
        'Six-week post-operative right knee X-ray: tunnels and fixation well positioned, no loosening, fracture or malalignment.',
      patientSummary: 'Your follow-up knee X-ray shows the surgical hardware in a good position.',
    },
  ],
};

// ---------------------------------------------------------------- C: appendicitis
const storyC: Story = {
  label: 'Acute appendicitis with laparoscopic appendectomy',
  clinicalNote: () =>
    'Presented ~7 months ago with right iliac fossa pain, fever and vomiting. WBC 15.8 with neutrophilia, CRP 96; CT confirmed acute appendicitis without perforation. Laparoscopic appendectomy next morning, uncomplicated; histology acute appendicitis, no neoplasm. Discharged on oral antibiotics, recovered fully. No ongoing issues; routine follow-up only. No known drug allergies.',
  documents: [
    {
      key: 'c-cbc',
      category: 'lab_result',
      daysAgo: 200,
      title: 'Complete blood count (emergency)',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: ['Leucocytosis with neutrophilia, consistent with acute bacterial inflammation.'],
        },
      ],
      findings: ['Leucocytosis 15.8', 'Neutrophilia 84%'],
      values: [
        lab('WBC', '15.8', 'x10^9/L', '4.0-11.0', 'high'),
        lab('Neutrophils', '84', '%', '40-75', 'high'),
        lab('Lymphocytes', '10', '%', '20-45', 'low'),
        lab('Hemoglobin', '14.2', 'g/dL', '12.0-16.0', 'normal'),
        lab('Platelets', '288', 'x10^9/L', '150-400', 'normal'),
      ],
      summary:
        'WBC 15.8 x10^9/L with 84% neutrophils (leucocytosis, neutrophilia). Hemoglobin 14.2 and platelets 288 normal.',
      patientSummary:
        'Your blood count showed a raised white cell count, which can happen with infection or inflammation.',
    },
    {
      key: 'c-crp',
      category: 'lab_result',
      daysAgo: 200,
      title: 'C-reactive protein',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [{ heading: 'Comment', lines: ['Markedly raised inflammatory marker.'] }],
      findings: ['CRP markedly raised'],
      values: [lab('C-reactive protein', '96', 'mg/L', '<5', 'high')],
      summary: 'CRP 96 mg/L (reference <5), a marked inflammatory response.',
      patientSummary: 'Your CRP, a marker of inflammation, was much higher than normal.',
    },
    {
      key: 'c-ct',
      category: 'imaging_report',
      daysAgo: 200,
      title: 'CT abdomen and pelvis with IV contrast',
      facility: IMG,
      signer: 'Dr. Omar Khalil, Consultant Radiologist (fictional)',
      sections: [
        {
          heading: 'Findings',
          lines: [
            'Appendix dilated to 12 mm with wall thickening, mural hyperenhancement and periappendiceal fat stranding.',
            'Small appendicolith at the base. No extraluminal gas, no abscess, no free fluid collection. Wall continuity preserved.',
            'Liver, gallbladder, pancreas, spleen, kidneys and pelvic organs unremarkable.',
          ],
        },
        { heading: 'Impression', lines: ['Acute appendicitis without perforation or abscess.'] },
      ],
      findings: [
        'Acute appendicitis, appendix 12 mm',
        'Appendicolith at base',
        'No perforation or abscess',
      ],
      summary:
        'CT abdomen/pelvis: acute appendicitis (appendix 12 mm, appendicolith, periappendiceal stranding). No perforation, abscess or other abdominal pathology.',
      patientSummary: 'Your CT scan showed an inflamed appendix. No rupture or abscess was seen.',
    },
    {
      key: 'c-op',
      category: 'other',
      daysAgo: 199,
      title: 'Operative report - laparoscopic appendectomy',
      facility: HOSP,
      signer: 'Dr. Yusuf Mansour, General Surgeon (fictional)',
      sections: [
        { heading: 'Procedure', lines: ['Laparoscopic appendectomy, three-port technique.'] },
        {
          heading: 'Anaesthesia',
          lines: [
            'General anaesthesia, ASA I. Single dose IV cefuroxime and metronidazole at induction.',
          ],
        },
        {
          heading: 'Findings',
          lines: [
            'Acutely inflamed, hyperaemic appendix with fibrinous exudate, no perforation, minimal free fluid.',
          ],
        },
        {
          heading: 'Technique',
          lines: [
            'Mesoappendix divided with energy device, base secured with endoloop x2, specimen retrieved in a bag. Peritoneal lavage.',
          ],
        },
        {
          heading: 'Complications and blood loss',
          lines: ['Complications: none. Estimated blood loss: minimal (<20 mL).'],
        },
      ],
      findings: [
        'Acutely inflamed appendix, no perforation',
        'Uncomplicated laparoscopic appendectomy',
        'EBL under 20 mL',
      ],
      summary:
        'Uncomplicated laparoscopic appendectomy under general anaesthesia for acute non-perforated appendicitis. EBL <20 mL; no complications; specimen sent for histology.',
      patientSummary:
        'This report describes your keyhole surgery to remove the appendix. It went without complications.',
    },
    {
      key: 'c-histo',
      category: 'lab_result',
      daysAgo: 195,
      title: 'Histopathology report - appendix',
      facility: LAB,
      signer: 'Dr. Nadia Ibrahim, Histopathologist (fictional)',
      sections: [
        {
          heading: 'Macroscopy',
          lines: [
            'Appendix 7.5 cm long, 1.1 cm maximum diameter, serosa congested with fibrinous exudate.',
          ],
        },
        {
          heading: 'Microscopy',
          lines: [
            'Transmural neutrophilic infiltrate with mucosal ulceration and serositis. No dysplasia, no carcinoid tumour, no granulomas.',
          ],
        },
        {
          heading: 'Diagnosis',
          lines: ['Acute suppurative appendicitis. No evidence of neoplasia.'],
        },
      ],
      findings: ['Acute suppurative appendicitis', 'No neoplasia or granulomas'],
      summary:
        'Histology: acute suppurative appendicitis with transmural neutrophilic infiltrate; no dysplasia, carcinoid or granulomas.',
      patientSummary:
        'The laboratory examination of your appendix confirmed inflammation and found nothing unusual beyond that.',
    },
    {
      key: 'c-discharge',
      category: 'discharge_summary',
      daysAgo: 198,
      title: 'Discharge summary - appendectomy',
      facility: HOSP,
      signer: 'Dr. Yusuf Mansour, General Surgeon (fictional)',
      sections: [
        {
          heading: 'Course',
          lines: [
            'Admitted with acute appendicitis, laparoscopic appendectomy, afebrile and eating on day 1, discharged day 2.',
          ],
        },
        {
          heading: 'Discharge medication',
          lines: [
            'Amoxicillin-clavulanate 625 mg three times daily for 5 days; Paracetamol 1 g every 6 hours as needed.',
          ],
        },
        {
          heading: 'Advice',
          lines: [
            'No heavy lifting for 2 weeks. Return if fever, worsening pain or wound discharge. Wound review at 10-14 days.',
          ],
        },
      ],
      findings: ['Discharged day 2 after uncomplicated recovery', 'Oral antibiotics for 5 days'],
      medications: [
        {
          name: 'Amoxicillin-clavulanate',
          dose: '625 mg',
          frequency: 'three times daily for 5 days',
        },
        { name: 'Paracetamol', dose: '1 g', frequency: 'every 6 hours as needed' },
      ],
      summary:
        'Discharged on day 2 after uncomplicated laparoscopic appendectomy. Amoxicillin-clavulanate 625 mg three times daily for 5 days, paracetamol as needed; no heavy lifting for 2 weeks.',
      patientSummary:
        'This summary describes your hospital stay, your antibiotics and what to watch for at home.',
    },
  ],
};

// ---------------------------------------------------------------- D: anaemia + hypothyroidism
const storyD: Story = {
  label: 'Iron-deficiency anaemia and hypothyroidism',
  clinicalNote: () =>
    'Fatigue, hair loss and cold intolerance 9 months ago. Hb 9.8 g/dL, MCV 74 fL, ferritin 6 (iron deficiency); TSH 9.8 with low free T4 (primary hypothyroidism). Started ferrous sulfate 200 mg twice daily and levothyroxine 75 mcg. Recheck at 6 months: Hb 12.6, TSH 3.1, free T4 normal. B12 and folate normal. Plan: continue levothyroxine, stop iron after ferritin >50, TSH every 6-12 months, review dietary iron and any cause of blood loss.',
  documents: [
    {
      key: 'd-cbc',
      category: 'lab_result',
      daysAgo: 270,
      title: 'Complete blood count',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [{ heading: 'Comment', lines: ['Microcytic hypochromic anaemia.'] }],
      findings: ['Microcytic anaemia', 'Hemoglobin 9.8 g/dL'],
      values: [
        lab('Hemoglobin', '9.8', 'g/dL', '12.0-16.0', 'low'),
        lab('MCV', '74', 'fL', '80-100', 'low'),
        lab('MCH', '24', 'pg', '27-33', 'low'),
        lab('RDW', '16.4', '%', '11.5-14.5', 'high'),
        lab('WBC', '6.4', 'x10^9/L', '4.0-11.0', 'normal'),
        lab('Platelets', '412', 'x10^9/L', '150-400', 'high'),
      ],
      summary:
        'Hemoglobin 9.8 g/dL with MCV 74 fL, MCH 24 pg and RDW 16.4%: microcytic hypochromic anaemia. WBC normal; platelets mildly raised at 412.',
      patientSummary: 'Your blood count shows low hemoglobin and small red blood cells.',
    },
    {
      key: 'd-ferritin',
      category: 'lab_result',
      daysAgo: 270,
      title: 'Iron studies',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [{ heading: 'Comment', lines: ['Findings consistent with iron deficiency.'] }],
      findings: ['Depleted iron stores (ferritin 6)'],
      values: [
        lab('Ferritin', '6', 'ng/mL', '15-150', 'low'),
        lab('Serum iron', '4.1', 'umol/L', '9-30', 'low'),
        lab('Transferrin saturation', '8', '%', '20-50', 'low'),
      ],
      summary:
        'Ferritin 6 ng/mL, serum iron 4.1 umol/L, transferrin saturation 8%: iron deficiency.',
      patientSummary: 'Your iron tests show very low iron stores.',
    },
    {
      key: 'd-tsh-1',
      category: 'lab_result',
      daysAgo: 270,
      title: 'Thyroid function (baseline)',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: ['Raised TSH with low free T4: primary hypothyroidism pattern.'],
        },
      ],
      findings: ['TSH 9.8 mIU/L', 'Free T4 low'],
      values: [
        lab('TSH', '9.8', 'mIU/L', '0.4-4.0', 'high'),
        lab('Free T4', '9.1', 'pmol/L', '10.0-22.0', 'low'),
      ],
      summary: 'TSH 9.8 mIU/L with free T4 9.1 pmol/L: primary hypothyroidism pattern.',
      patientSummary: 'Your thyroid tests show an underactive thyroid pattern.',
    },
    {
      key: 'd-b12',
      category: 'lab_result',
      daysAgo: 270,
      title: 'Vitamin B12 and folate',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [{ heading: 'Comment', lines: ['Normal B12 and folate.'] }],
      findings: ['B12 and folate within range'],
      values: [
        lab('Vitamin B12', '384', 'pg/mL', '200-900', 'normal'),
        lab('Folate', '9.6', 'ng/mL', '4.6-34.8', 'normal'),
      ],
      summary:
        'Vitamin B12 384 pg/mL and folate 9.6 ng/mL are normal; no B12 or folate deficiency.',
      patientSummary: 'Your vitamin B12 and folate levels are in the normal range.',
    },
    {
      key: 'd-rx',
      category: 'prescription',
      daysAgo: 268,
      title: 'Prescription - iron and thyroid replacement',
      facility: CLINIC,
      signer: 'Dr. Emily Carter, General Medicine',
      sections: [
        {
          heading: 'Instructions',
          lines: [
            'Levothyroxine on an empty stomach 30-60 minutes before breakfast. Take ferrous sulfate at least 4 hours apart from levothyroxine. Repeat TSH and blood count in 6-8 weeks.',
          ],
        },
      ],
      findings: ['Started iron replacement and levothyroxine'],
      medications: [
        { name: 'Ferrous sulfate', dose: '200 mg', frequency: 'twice daily' },
        { name: 'Levothyroxine', dose: '75 mcg', frequency: 'once daily before breakfast' },
      ],
      summary:
        'Started ferrous sulfate 200 mg twice daily and levothyroxine 75 mcg once daily, separated by at least 4 hours; repeat TSH and CBC in 6-8 weeks.',
      patientSummary:
        'This prescription lists your iron tablets and thyroid tablets and how to take them.',
    },
    {
      key: 'd-tsh-2',
      category: 'lab_result',
      daysAgo: 90,
      title: 'Thyroid function and blood count (follow-up)',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: ['TSH normalised on replacement. Anaemia largely corrected.'],
        },
      ],
      findings: ['TSH 3.1 mIU/L, normalised', 'Hemoglobin 12.6 g/dL, improved'],
      values: [
        lab('TSH', '3.1', 'mIU/L', '0.4-4.0', 'normal'),
        lab('Free T4', '14.8', 'pmol/L', '10.0-22.0', 'normal'),
        lab('Hemoglobin', '12.6', 'g/dL', '12.0-16.0', 'normal'),
        lab('MCV', '85', 'fL', '80-100', 'normal'),
        lab('Ferritin', '38', 'ng/mL', '15-150', 'normal'),
      ],
      summary:
        'On levothyroxine, TSH has fallen from 9.8 to 3.1 mIU/L with normal free T4 (14.8). Hemoglobin 12.6 g/dL, MCV 85, ferritin 38: anaemia largely corrected.',
      patientSummary: 'Your thyroid tests and blood count have returned to the normal range.',
    },
  ],
};

// ---------------------------------------------------------------- E: chest / respiratory
const storyE: Story = {
  label: 'Right lower lobe pneumonia with respiratory work-up',
  clinicalNote: () =>
    'Cough, fever and right-sided pleuritic pain 5 months ago; chest X-ray showed right lower lobe consolidation, WBC and CRP raised; treated with antibiotics, follow-up film clear. Persistent exertional cough prompted spirometry: mild obstruction with significant bronchodilator reversibility (suggests asthma). Echocardiogram normal (EF 60%). Plan: trial of inhaled corticosteroid/LABA, peak-flow diary, review in 6 weeks. Non-smoker. No known drug allergies.',
  documents: [
    {
      key: 'e-cxr',
      category: 'imaging_report',
      daysAgo: 150,
      title: 'Chest X-ray PA and lateral',
      facility: IMG,
      signer: 'Dr. Omar Khalil, Consultant Radiologist (fictional)',
      sections: [
        {
          heading: 'Findings',
          lines: [
            'Right lower lobe airspace consolidation with air bronchograms. Small right parapneumonic effusion not excluded at the costophrenic angle.',
            'Heart size normal. Left lung clear. No pneumothorax.',
          ],
        },
        {
          heading: 'Impression',
          lines: ['Right lower lobe pneumonia. Follow-up film in 6-8 weeks to confirm resolution.'],
        },
      ],
      findings: ['Right lower lobe consolidation', 'Normal heart size', 'Follow-up film advised'],
      summary:
        'Chest X-ray: right lower lobe consolidation with air bronchograms consistent with pneumonia; heart size normal, left lung clear. Repeat film advised in 6-8 weeks.',
      patientSummary: 'Your chest X-ray showed an area of infection in the lower right lung.',
    },
    {
      key: 'e-labs',
      category: 'lab_result',
      daysAgo: 150,
      title: 'CBC and C-reactive protein',
      facility: LAB,
      signer: 'Dr. Hana Marwan, Consultant Pathologist (fictional)',
      sections: [
        {
          heading: 'Comment',
          lines: ['Leucocytosis with raised CRP, consistent with bacterial infection.'],
        },
      ],
      findings: ['Leucocytosis 14.1', 'CRP 62 mg/L'],
      values: [
        lab('WBC', '14.1', 'x10^9/L', '4.0-11.0', 'high'),
        lab('Neutrophils', '79', '%', '40-75', 'high'),
        lab('Hemoglobin', '13.4', 'g/dL', '12.0-16.0', 'normal'),
        lab('Platelets', '342', 'x10^9/L', '150-400', 'normal'),
        lab('C-reactive protein', '62', 'mg/L', '<5', 'high'),
      ],
      summary:
        'WBC 14.1 x10^9/L with 79% neutrophils and CRP 62 mg/L: inflammatory response compatible with pneumonia. Hemoglobin and platelets normal.',
      patientSummary:
        'Your blood tests showed signs of infection: a raised white cell count and CRP.',
    },
    {
      key: 'e-cxr-fu',
      category: 'imaging_report',
      daysAgo: 95,
      title: 'Chest X-ray - follow-up',
      facility: IMG,
      signer: 'Dr. Omar Khalil, Consultant Radiologist (fictional)',
      sections: [
        { heading: 'Comparison', lines: ['Chest X-ray 55 days earlier.'] },
        {
          heading: 'Findings',
          lines: [
            'Complete resolution of the right lower lobe consolidation. Lungs clear, costophrenic angles sharp, normal heart size.',
          ],
        },
        {
          heading: 'Impression',
          lines: ['Resolved right lower lobe pneumonia. No residual abnormality.'],
        },
      ],
      findings: ['Right lower lobe consolidation resolved', 'No residual abnormality'],
      summary:
        'Follow-up chest X-ray: complete resolution of the right lower lobe consolidation; lungs clear, normal cardiac size.',
      patientSummary: 'Your follow-up chest X-ray shows the earlier infection has cleared.',
    },
    {
      key: 'e-spiro',
      category: 'other',
      daysAgo: 80,
      title: 'Spirometry with bronchodilator reversibility',
      facility: 'Central Clinic Pulmonary Function Lab (fictional)',
      signer: 'Dr. Rania Aziz, Pulmonology (fictional)',
      sections: [
        {
          heading: 'Interpretation',
          lines: [
            'Mild airflow obstruction with significant bronchodilator reversibility (FEV1 +16% / +330 mL after salbutamol 400 mcg). Pattern consistent with asthma.',
          ],
        },
      ],
      findings: ['Mild obstruction', 'Significant bronchodilator reversibility'],
      values: [
        lab('FEV1 (pre)', '2.45', 'L', null, 'low'),
        lab('FEV1 predicted', '78', '%', '>80', 'low'),
        lab('FVC (pre)', '3.80', 'L', null, 'normal'),
        lab('FEV1/FVC', '0.64', 'ratio', '>0.70', 'low'),
        lab('FEV1 (post-bronchodilator)', '2.78', 'L', null, 'normal'),
        lab('FEV1 reversibility', '16', '%', '<12', 'high'),
      ],
      summary:
        'Spirometry: FEV1 78% predicted, FEV1/FVC 0.64 (mild obstruction) with 16% / 330 mL reversibility after salbutamol, consistent with asthma.',
      patientSummary:
        'Your breathing test showed mildly narrowed airways that improved with an inhaler.',
    },
    {
      key: 'e-echo',
      category: 'imaging_report',
      daysAgo: 60,
      title: 'Transthoracic echocardiography',
      facility: 'Central Clinic Cardiac Imaging (fictional)',
      signer: 'Dr. Samir Haddad, Cardiology (fictional)',
      sections: [
        {
          heading: 'Findings',
          lines: [
            'Left ventricle normal size and wall thickness, ejection fraction 60% (biplane). No regional wall motion abnormality.',
            'Normal right ventricle. Atria normal. Valves structurally normal, trivial tricuspid regurgitation. Estimated PASP 24 mmHg. No pericardial effusion.',
          ],
        },
        {
          heading: 'Conclusion',
          lines: ['Normal echocardiogram. No structural cause for breathlessness.'],
        },
      ],
      findings: [
        'LVEF 60%',
        'No regional wall motion abnormality',
        'Normal valves, trivial TR',
        'No pericardial effusion',
      ],
      values: [
        lab('Left ventricular ejection fraction', '60', '%', '55-70', 'normal'),
        lab('Estimated PASP', '24', 'mmHg', '<35', 'normal'),
      ],
      summary:
        'Normal transthoracic echo: LVEF 60%, no wall motion abnormality, normal valves (trivial TR), PASP 24 mmHg, no effusion.',
      patientSummary: 'Your heart ultrasound looked normal.',
    },
  ],
};

export const STORIES: Story[] = [storyA, storyB, storyC, storyD, storyE];

// ---------------------------------------------------------------- rendering
function wrap(text: string, width = WRAP): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function isoDate(now: Date, daysAgo: number): string {
  return new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

interface PatientRef {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
}

export function renderDocumentLines(
  spec: DocumentSpec,
  patient: PatientRef,
  date: string,
): string[] {
  const lines: string[] = [
    spec.facility,
    spec.title.toUpperCase(),
    `Patient: ${patient.firstName} ${patient.lastName} (${patient.code})   DOB: ${patient.dateOfBirth.toISOString().slice(0, 10)}`,
    `Date: ${date}`,
    '',
  ];
  for (const section of spec.sections) {
    lines.push(`${section.heading.toUpperCase()}:`);
    for (const text of section.lines) lines.push(...wrap(text));
    lines.push('');
  }
  if (spec.values?.length) {
    lines.push('RESULTS:');
    for (const v of spec.values) {
      const flag = v.flag && v.flag !== 'normal' ? `  [${v.flag.toUpperCase()}]` : '';
      const range = v.referenceRange ? `  (ref ${v.referenceRange})` : '';
      lines.push(...wrap(`${v.name}: ${v.value}${v.unit ? ` ${v.unit}` : ''}${range}${flag}`));
    }
    lines.push('');
  }
  if (spec.medications?.length) {
    lines.push('MEDICATIONS:');
    for (const m of spec.medications) {
      lines.push(...wrap(`${m.name} ${m.dose ?? ''} - ${m.frequency ?? ''}`.replace(/\s+/g, ' ')));
    }
    lines.push('');
  }
  lines.push(
    `Reported by: ${spec.signer}`,
    'Fictional demonstration document - not a real patient record.',
  );
  return lines;
}

export function buildExtraction(
  spec: DocumentSpec,
  ocrText: string,
  date: string,
): ExtractionResult {
  return extractionResultSchema.parse({
    category: spec.category,
    documentDate: date,
    ocrText,
    clinicianSummary: spec.summary,
    title: spec.title,
    findings: spec.findings,
    values: spec.values ?? [],
    medications: spec.medications ?? [],
    patientSummary: spec.patientSummary,
  });
}

async function pickPatients(
  prisma: PrismaClient,
  clinicId: string,
  now: Date,
  count: number,
): Promise<PatientRef[]> {
  const doctor = await prisma.doctor.findFirst({
    where: { clinicId, user: { email: DOCTOR_EMAIL } },
    select: { id: true },
  });
  if (!doctor) return [];
  const appointments = await prisma.appointment.findMany({
    where: { clinicId, doctorId: doctor.id, patient: { status: 'ACTIVE' } },
    select: {
      startsAt: true,
      patient: {
        select: { id: true, code: true, firstName: true, lastName: true, dateOfBirth: true },
      },
    },
  });
  const weekAhead = now.getTime() + 7 * 86_400_000;
  const rank = (startsAt: Date): number =>
    startsAt.getTime() >= now.getTime() && startsAt.getTime() <= weekAhead
      ? 0
      : startsAt.getTime() > now.getTime()
        ? 1
        : 2;
  const best = new Map<string, { patient: PatientRef; rank: number }>();
  for (const a of appointments) {
    const r = rank(a.startsAt);
    const current = best.get(a.patient.id);
    if (!current || r < current.rank) best.set(a.patient.id, { patient: a.patient, rank: r });
  }
  const ranked = [...best.values()]
    .sort((x, y) => x.rank - y.rank || x.patient.code.localeCompare(y.patient.code))
    .map((entry) => entry.patient);

  // The stories stay on the same people across daily demo resets (patient codes are stable;
  // appointments are not), so a tester can come back to "Fatima Hassan's labs" tomorrow.
  const pinned = await prisma.patient.findMany({
    where: { clinicId, status: 'ACTIVE', code: { in: [...PINNED_PATIENT_CODES] } },
    select: { id: true, code: true, firstName: true, lastName: true, dateOfBirth: true },
  });
  const byCode = new Map(pinned.map((p) => [p.code, p]));
  const chosen: PatientRef[] = [];
  for (const code of PINNED_PATIENT_CODES) {
    const p = byCode.get(code);
    if (p) chosen.push(p);
  }
  for (const p of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.some((c) => c.id === p.id)) chosen.push(p);
  }
  return chosen.slice(0, count);
}

/** One per story, in story order (diabetes, knee, appendicitis, thyroid, respiratory). */
export const PINNED_PATIENT_CODES = ['P-005', 'P-007', 'P-009', 'P-027', 'P-033'] as const;

export async function seedClinicalDocuments(
  prisma: PrismaClient,
  clinicId: string,
  now: Date,
): Promise<{ patientCode: string; documents: number }[]> {
  const patients = await pickPatients(prisma, clinicId, now, STORIES.length);
  if (patients.length === 0) return [];

  // Owned rows are replaced; anything else is untouched.
  await prisma.patientDocument.deleteMany({
    where: { clinicId, fileName: { startsWith: DEMO_DOCUMENT_PREFIX } },
  });

  const result: { patientCode: string; documents: number }[] = [];
  for (const [index, patient] of patients.entries()) {
    const story = STORIES[index]!;
    for (const spec of story.documents) {
      const date = isoDate(now, spec.daysAgo);
      const lines = renderDocumentLines(spec, patient, date);
      const ocrText = lines.join('\n');
      const extraction = buildExtraction(spec, ocrText, date);
      const bytes = buildMinimalPdf(lines, spec.title);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const data = {
        clinicId,
        patientId: patient.id,
        uploadedBy: 'STAFF',
        fileName: `${DEMO_DOCUMENT_PREFIX}${spec.key}-${date}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256,
        content: new Uint8Array(bytes),
        status: 'READY',
        category: spec.category,
        documentDate: new Date(`${date}T00:00:00.000Z`),
        extractedText: ocrText,
        extraction: extraction as unknown as Prisma.InputJsonValue,
        summary: spec.summary,
        reviewedAt: now,
      };
      await prisma.patientDocument.upsert({
        where: { patientId_sha256: { patientId: patient.id, sha256 } },
        update: data,
        create: data,
      });
    }
    await prisma.patient.update({
      where: { id: patient.id },
      data: { clinicalNotes: story.clinicalNote(`${patient.firstName} ${patient.lastName}`) },
    });
    result.push({ patientCode: patient.code, documents: story.documents.length });
  }
  return result;
}
