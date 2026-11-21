// Böhran (özünə və ya başqasına zərər) ifadələrinin aşkarlanması.
// Mətn əvvəlcə normallaşdırılır: kiçik hərf, diakritiklər silinir (ə→e, ı→i, ö→o, ü→u, ğ→g, ş→s, ç→c),
// "sh/ch/gh" yazılışları birləşdirilir. Ona görə nümunələr ASCII ilə yazılıb və
// "özümü öldürmək", "ozumu oldurmek", "kendimi öldürmek" eyni cür tutulur.

export const CRISIS_MESSAGE = {
  title: 'Siz tək deyilsiniz',
  body:
    'Hazırda çox çətin bir an yaşadığınızı görürəm. Həyatınız təhlükədədirsə, dərhal 112-yə zəng edin. ' +
    'İndi etibar etdiyiniz yaxın bir insana — ailə üzvünə və ya dostunuza — zəng edin, yaxud yazın və tək qalmayın. ' +
    'PsychoAI peşəkar yardımı əvəz etmir; mütəxəssislə danışmaq sizə kömək edə bilər.',
  phone: '112',
};

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ə|ä/g, 'e')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/gh/g, 'g')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "istəyirəm / istiyorum / istərdim / istədim" (istək), lakin "istəmirəm" yox.
const WANT = 'is[td][ei](?:y|r|d)';
// "istəmirəm / istəmərəm / istemiyorum / isdəmirəm" (inkar).
const NOT_WANT = 'is[td]em[ie]';
const W = '(?:\\S+\\s+)'; // aradakı bir söz

const PATTERNS = [
  // intihar
  /\bint[ia][hx]ar/,
  /\bsuicid/,
  // özünü öldürmək / asmaq / zəhərləmək
  /\b(?:ozumu|kendimi)\s+(?:\S+\s+)?(?:oldur|zeherle|zehirle|as(?:maq|mak|aca|ac|aram|arim|sam|ib|tim|dim))/,
  // yaşamaq istəmirəm
  new RegExp(`\\bya[s]ama[qk]\\s+${W}?${NOT_WANT}`),
  /\bya[s]ama[qk]dan\s+(?:bez|yoruldum|yorulmusam)/,
  // yaşamağın mənası yoxdur / yaşamağa dəyməz
  new RegExp(`\\bya[s]ama(?:gin|gimin|ga)\\s+${W}{0,3}(?:menasi|anlami|deyeri|degeri)\\s+(?:yox|qalma|kalma)`),
  /\bya[s]ama(?:ga|ya)\s+(?:deymez|degmez)/,
  // ölmək istəyirəm
  new RegExp(`\\bolme[kq]\\s+${W}?${WANT}`),
  /\bolmeye\s+hazir/,
  // ölsəm hamıya yaxşı olar / mənsiz daha yaxşı olar
  new RegExp(`\\bolsem\\s+${W}{0,4}(?:yaxsi|rahat|iyi)`),
  new RegExp(`\\b(?:mensiz|bensiz)\\s+${W}{0,3}(?:yaxsi|rahat|iyi)`),
  // həyatıma son vermək / canıma qıymaq
  /\b(?:heyatima|hayatima|omrume|omruma)\s+son\s+(?:ver|qoy|koy)/,
  /\bcanima\s+(?:qiy|kiy)/,
  // özümə zərər
  /\b(?:ozume|kendime)\s+(?:\S+\s+)?(?:zerer|zarar|xeter|ziyan)/,
  // kəsmək (qol, bilək, damar)
  /\b(?:qolum|kolum|bilek|bileg|biley|damar)\S*\s+(?:\S+\s+)?kes/,
  /\bozumu\s+kes/,
  // özünü atmaq (körpüdən, pəncərədən, damdan ...)
  /\bozumu\s+(?:\S+\s+)?(?:korpu|kopru|pencere|dam|bina|metro|qatar|tren|rels|asag)\S*\s+at/,
  /\b(?:korpuden|kopruden|pencereden|damdan|binadan)\s+(?:ozumu\s+|kendimi\s+)?at(?:maq|mak|aca|ac|ar|sam|ib)/,
  // yox olmaq istəyirəm
  new RegExp(`\\byox\\s+olma[qk]\\s+${W}?${WANT}`),
  // başqasına zərər: öldürəcəyəm / öldürmək istəyirəm
  /\boldur(?:ecem|eceyem|eceyem|ecegem|eceyim|ecegim|ecam)\b/,
  new RegExp(`\\boldurme[kq]\\s+${W}?${WANT}`),
  // ingiliscə
  /\bkill\s+my\s*self\b/,
  /\bwant\s+to\s+die\b/,
  /\bend\s+my\s+life\b/,
  /\bself\s+harm/,
];

export function detectCrisis(text) {
  if (!text) return false;
  const t = normalize(text);
  if (!t) return false;
  return PATTERNS.some((re) => re.test(t));
}
