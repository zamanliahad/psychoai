import { describe, it, expect } from 'vitest';
import { detectCrisis, CRISIS_MESSAGE } from '../src/psych/crisis.js';
import { buildSystemPrompt, ANALYZE_INSTRUCTIONS, ANALYZE_SCHEMA } from '../src/psych/prompts.js';
import { LEVEL1 } from '../src/psych/level1.js';

describe('detectCrisis — risk ifadələri (true)', () => {
  const positives = [
    // plandakı əsas nümunələr
    'özümü öldürmək istəyirəm',
    'yaşamaq istəmirəm',
    'intihar',
    // azərbaycanca formalar
    'Bəzən intihar haqqında düşünürəm',
    'Daha yaşamaq istəmirəm, bezmişəm',
    'artıq yaşamaq istəmərəm',
    'ölmək istəyirəm',
    'Ölsəm hamı üçün daha yaxşı olar',
    'Mənsiz hamıya daha yaxşı olar',
    'həyatıma son vermək istəyirəm',
    'canıma qıymaq istəyirəm',
    'özümə zərər vermək istəyirəm',
    'Qolumu kəsirəm hərdən',
    'özümü asmaq fikri gəlir',
    'Yaşamağın heç bir mənası yoxdur',
    'özümü körpüdən atmaq istəyirəm',
    'Onu öldürəcəyəm',
    'yox olmaq istəyirəm',
    // diakritiksiz yazılış
    'ozumu oldurmek isteyirem',
    'yashamaq istemirem',
    'yasamaq isdemirem',
    'olmek isteyirem',
    'heyatima son vermek',
    'intixar edecem',
    // böyük hərf
    'ÖZÜMÜ ÖLDÜRMƏK İSTƏYİRƏM',
    'INTIHAR',
    // türkcə variantlar
    'kendimi öldürmek istiyorum',
    'yaşamak istemiyorum',
    'ölmek istiyorum',
    'hayatıma son vermek istiyorum',
    'canıma kıymak',
    'kendime zarar veriyorum',
    'bileklerimi kesmek istiyorum',
    // ingiliscə
    'I want to kill myself',
  ];
  for (const t of positives) {
    it(`"${t}" → true`, () => expect(detectCrisis(t)).toBe(true));
  }
});

describe('detectCrisis — adi kədər / yorğunluq (false)', () => {
  const negatives = [
    'bu gün yorğunam',
    'Yorğunluqdan ölürəm',
    'Gülməkdən öldüm',
    'Çox kədərliyəm, işdə stres çoxdur',
    'özümü yaxşı hiss etmirəm',
    'Özümü yorğun hiss edirəm',
    'yaşamaq istəyirəm, sadəcə çətindir',
    'Həyat çətindir bəzən',
    'Dünən yaxşı yatmadım',
    'Telefonum öldü',
    'evə gəlib özümü yatağa atdım',
    'Anam bilsə məni öldürər',
    'ölüm haqqında bir kitab oxudum',
    'Barmağımı kəsdim, yemək hazırlayanda',
    'Bu işə son vermək istəyirəm',
    'Özümü toplamaq istəyirəm',
    '',
  ];
  for (const t of negatives) {
    it(`"${t}" → false`, () => expect(detectCrisis(t)).toBe(false));
  }
  it('null / undefined → false', () => {
    expect(detectCrisis(null)).toBe(false);
    expect(detectCrisis(undefined)).toBe(false);
  });
});

describe('CRISIS_MESSAGE', () => {
  it('112 və azərbaycanca mətn', () => {
    expect(CRISIS_MESSAGE.phone).toBe('112');
    expect(CRISIS_MESSAGE.title.length).toBeGreaterThan(3);
    expect(CRISIS_MESSAGE.body).toMatch(/112/);
    expect(CRISIS_MESSAGE.body).toMatch(/yaxın|etibar/);
  });
});

const baseState = () => ({
  profile: { name: 'Leyla', currentLevel: 1, lastCompletedDayKey: null, programSummary: null },
  levels: [{ ...LEVEL1, status: 'AVAILABLE', scheduledDayKey: '2026-11-20', completedDayKey: null, summary: null }],
  tasks: [],
  moods: [],
  sessions: [],
});

describe('buildSystemPrompt', () => {
  it('Level 1: tanışlıq, dil qaydaları, böhran, vaxt', () => {
    const p = buildSystemPrompt(baseState(), 1);
    expect(typeof p).toBe('string');
    expect(p).toMatch(/tanışlıq/i);
    expect(p).toMatch(/Leyla/);
    expect(p).toMatch(/necəsən/);
    expect(p).toMatch(/nasılsın/); // qadağan nümunəsi kimi
    expect(p).toMatch(/112/);
    expect(p).toMatch(/Görüşü tamamla/);
    expect(p).toMatch(/10–15 dəqiqə/);
    expect(p).toMatch(/diaqnoz/i);
    expect(p).toMatch(/yuxu/i);
  });

  it('Level 3: brief, əvvəlki xülasə, tapşırıqlar, son əhval', () => {
    const s = baseState();
    s.profile.currentLevel = 3;
    s.profile.programSummary = 'Stresi idarə etmək və yuxunu yaxşılaşdırmaq.';
    s.levels = [
      { ...LEVEL1, status: 'COMPLETED', summary: 'İlk görüş: iş stresi.' },
      { n: 2, title: 'Düşüncələr', focus: 'avtomatik düşüncələr', brief: 'X', status: 'COMPLETED', summary: 'Siz narahat düşüncələri yazmağa başladınız.' },
      { n: 3, title: 'Yuxu rejimi', focus: 'yuxu gigiyenası', brief: 'Yuxu gündəliyini müzakirə et.', status: 'AVAILABLE' },
    ];
    s.tasks = [
      { id: 'a', level: 2, title: '4-7-8 nəfəs', instructions: '...', done: true, note: 'Yatmazdan əvvəl kömək etdi' },
      { id: 'b', level: 2, title: 'Düşüncə gündəliyi', instructions: '...', done: false, note: '' },
      { id: 'c', level: 1, title: 'Köhnə tapşırıq', instructions: '...', done: true, note: '' },
    ];
    s.moods = [
      { dayKey: '2026-11-21', level: 2, before: 4, after: 6, aiScore: 5, aiNote: 'Bir az sakitləşib' },
    ];
    const p = buildSystemPrompt(s, 3);
    expect(p).toMatch(/Yuxu rejimi/);
    expect(p).toMatch(/Yuxu gündəliyini müzakirə et\./);
    expect(p).toMatch(/narahat düşüncələri yazmağa/);
    expect(p).toMatch(/4-7-8 nəfəs/);
    expect(p).toMatch(/Yatmazdan əvvəl kömək etdi/);
    expect(p).toMatch(/Düşüncə gündəliyi/);
    expect(p).toMatch(/6\/10/);
    expect(p).toMatch(/Stresi idarə etmək/);
    expect(p).not.toMatch(/Köhnə tapşırıq/);
  });

  it('boş / natamam state ilə sınmır', () => {
    expect(() => buildSystemPrompt({}, 1)).not.toThrow();
    expect(() => buildSystemPrompt(null, 2)).not.toThrow();
    expect(() => buildSystemPrompt(baseState(), { n: 2, title: 'T', brief: 'B' })).not.toThrow();
  });
});

describe('ANALYZE_SCHEMA', () => {
  it('Gemini responseSchema formatı', () => {
    expect(typeof ANALYZE_INSTRUCTIONS).toBe('string');
    expect(ANALYZE_SCHEMA.type).toBe('OBJECT');
    expect(ANALYZE_SCHEMA.required).toEqual(expect.arrayContaining(['summary', 'tasks', 'mood']));
    expect(ANALYZE_SCHEMA.required).not.toContain('program');
    expect(ANALYZE_SCHEMA.properties.tasks.type).toBe('ARRAY');
    expect(ANALYZE_SCHEMA.properties.tasks.items.properties.title.type).toBe('STRING');
    expect(ANALYZE_SCHEMA.properties.mood.properties.score.type).toBe('INTEGER');
    const prog = ANALYZE_SCHEMA.properties.program;
    expect(prog.type).toBe('ARRAY');
    expect(Object.keys(prog.items.properties)).toEqual(['n', 'title', 'focus', 'brief']);
  });
});
