/**
 * Fictional Arabic and French spellings for the seeded people, rooms and clinics.
 * English is the canonical value; French is identical or accented where natural.
 * Pure data and helpers, no random numbers (the seed's PRNG sequence must not change).
 */
import type { LocalizedText } from '@riaya/shared';

/** [french, arabic] per English spelling (first and last names share one table). */
const NAMES: Record<string, [string, string]> = {
  // Arabic-origin first names (male)
  Omar: ['Omar', 'عمر'],
  Yusuf: ['Youssef', 'يوسف'],
  Karim: ['Karim', 'كريم'],
  Tariq: ['Tarek', 'طارق'],
  Adam: ['Adam', 'آدم'],
  Bilal: ['Bilal', 'بلال'],
  Hassan: ['Hassan', 'حسن'],
  Faris: ['Farès', 'فارس'],
  Samir: ['Samir', 'سمير'],
  Khalid: ['Khaled', 'خالد'],
  Ahmed: ['Ahmed', 'أحمد'],
  Mahmoud: ['Mahmoud', 'محمود'],
  Ibrahim: ['Ibrahim', 'إبراهيم'],
  Zaid: ['Zaïd', 'زيد'],
  Hamza: ['Hamza', 'حمزة'],
  Mehdi: ['Mehdi', 'مهدي'],
  // Arabic-origin first names (female)
  Layla: ['Leïla', 'ليلى'],
  Nour: ['Nour', 'نور'],
  Mariam: ['Meriem', 'مريم'],
  Hana: ['Hana', 'هناء'],
  Salma: ['Salma', 'سلمى'],
  Rania: ['Rania', 'رانيا'],
  Zeinab: ['Zeineb', 'زينب'],
  Dina: ['Dina', 'دينا'],
  Iman: ['Imane', 'إيمان'],
  Yasmin: ['Yasmine', 'ياسمين'],
  Yasmine: ['Yasmine', 'ياسمين'],
  Amira: ['Amira', 'أميرة'],
  Huda: ['Houda', 'هدى'],
  Leila: ['Leïla', 'ليلى'],
  Aisha: ['Aïcha', 'عائشة'],
  Fatima: ['Fatima', 'فاطمة'],
  Nadia: ['Nadia', 'نادية'],
  Lina: ['Lina', 'لينا'],
  Sara: ['Sara', 'سارة'],
  // French first names
  Louis: ['Louis', 'لويس'],
  Hugo: ['Hugo', 'هوغو'],
  Lucas: ['Lucas', 'لوكاس'],
  Antoine: ['Antoine', 'أنطوان'],
  Julien: ['Julien', 'جوليان'],
  Mathieu: ['Mathieu', 'ماتيو'],
  Pierre: ['Pierre', 'بيير'],
  Nicolas: ['Nicolas', 'نيكولا'],
  Camille: ['Camille', 'كميل'],
  Chloe: ['Chloé', 'كلوي'],
  Emma: ['Emma', 'إيما'],
  Lea: ['Léa', 'ليا'],
  Manon: ['Manon', 'مانون'],
  Sophie: ['Sophie', 'صوفي'],
  Margaux: ['Margaux', 'مارغو'],
  Claire: ['Claire', 'كلير'],
  // English first names
  James: ['James', 'جيمس'],
  Michael: ['Michel', 'مايكل'],
  David: ['David', 'ديفيد'],
  Robert: ['Robert', 'روبرت'],
  Daniel: ['Daniel', 'دانيال'],
  Thomas: ['Thomas', 'توماس'],
  William: ['Guillaume', 'ويليام'],
  Oliver: ['Olivier', 'أوليفر'],
  Sarah: ['Sarah', 'سارة'],
  Emily: ['Émilie', 'إميلي'],
  Olivia: ['Olivia', 'أوليفيا'],
  Grace: ['Grâce', 'غريس'],
  Hannah: ['Hannah', 'حنة'],
  Jessica: ['Jessica', 'جيسيكا'],
  Laura: ['Laura', 'لورا'],
  Megan: ['Megan', 'ميغان'],
  Lisa: ['Lisa', 'ليزا'],
  // Arabic-origin last names
  Haddad: ['Haddad', 'حداد'],
  Nasser: ['Nasser', 'ناصر'],
  Saleh: ['Saleh', 'صالح'],
  Mansour: ['Mansour', 'منصور'],
  Khalil: ['Khalil', 'خليل'],
  Rahman: ['Rahman', 'رحمن'],
  Aziz: ['Aziz', 'عزيز'],
  Hamdan: ['Hamdan', 'حمدان'],
  Sabbagh: ['Sabbagh', 'صباغ'],
  Taha: ['Taha', 'طه'],
  Jaber: ['Jaber', 'جابر'],
  Fares: ['Farès', 'فارس'],
  Halabi: ['Halabi', 'حلبي'],
  Darwish: ['Darwish', 'درويش'],
  Kassab: ['Kassab', 'قصاب'],
  Shaheen: ['Chahine', 'شاهين'],
  Barakat: ['Barakat', 'بركات'],
  Rizk: ['Rizk', 'رزق'],
  Zaher: ['Zaher', 'ظاهر'],
  Khan: ['Khan', 'خان'],
  Mansoori: ['Mansouri', 'المنصوري'],
  Farouk: ['Farouk', 'فاروق'],
  // French last names
  Dubois: ['Dubois', 'دوبوا'],
  Moreau: ['Moreau', 'مورو'],
  Laurent: ['Laurent', 'لوران'],
  Lefevre: ['Lefèvre', 'لوفافر'],
  Girard: ['Girard', 'جيرار'],
  Bonnet: ['Bonnet', 'بونيه'],
  Fontaine: ['Fontaine', 'فونتين'],
  Rousseau: ['Rousseau', 'روسو'],
  Petit: ['Petit', 'بوتي'],
  Garnier: ['Garnier', 'غارنييه'],
  Martin: ['Martin', 'مارتن'],
  // English last names
  Johnson: ['Johnson', 'جونسون'],
  Brown: ['Brown', 'براون'],
  Lee: ['Lee', 'لي'],
  Miller: ['Miller', 'ميلر'],
  Taylor: ['Taylor', 'تايلور'],
  Walker: ['Walker', 'ووكر'],
  Hughes: ['Hughes', 'هيوز'],
  Reid: ['Reid', 'ريد'],
  Clarke: ['Clarke', 'كلارك'],
  Bennett: ['Bennett', 'بينيت'],
  Carter: ['Carter', 'كارتر'],
  Wilson: ['Wilson', 'ويلسون'],
  Kim: ['Kim', 'كيم'],
};

/** `{ en, fr, ar }` for a seeded name; throws when a name has no table entry (keeps the seed honest). */
export function nameI18n(name: string): LocalizedText {
  const entry = NAMES[name];
  if (!entry) throw new Error(`seed-names: no French/Arabic spelling for "${name}"`);
  return { en: name, fr: entry[0], ar: entry[1] };
}

const ROOMS: Record<string, [string, string]> = {
  'Procedure Room': ['Salle de soins', 'غرفة الإجراءات'],
  'Imaging Room': ["Salle d'imagerie", 'غرفة التصوير'],
};

/** "Room 3" becomes "Salle 3" / "غرفة 3"; the named rooms use the table above. */
export function roomNameI18n(name: string): LocalizedText {
  const numbered = /^Room (\d+)$/.exec(name);
  if (numbered) return { en: name, fr: `Salle ${numbered[1]}`, ar: `غرفة ${numbered[1]}` };
  const entry = ROOMS[name];
  if (!entry) throw new Error(`seed-names: no French/Arabic room name for "${name}"`);
  return { en: name, fr: entry[0], ar: entry[1] };
}

const CLINIC_NAMES: Record<string, [string, string]> = {
  'Central Clinic': ['Clinique Centrale', 'العيادة المركزية'],
  'Northside Clinic': ['Clinique du Nord', 'عيادة الشمال'],
  'Riverside Clinic': ['Clinique des Rives', 'عيادة الضفاف'],
};

export function clinicNameI18n(name: string): LocalizedText {
  const entry = CLINIC_NAMES[name];
  return entry ? { en: name, fr: entry[0], ar: entry[1] } : { en: name };
}
