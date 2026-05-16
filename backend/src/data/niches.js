// Pre-configured AI personas per niche (spec §2 "NICHE CONFIGURATION").
// Each persona feeds the script generator's system prompt.

export const NICHES = {
  finance: {
    label: 'Finance & Money',
    hookStyles: [
      'Reveal a counterintuitive money result first',
      'Expose a "rule" rich people break',
      'Show a number that sounds impossible',
    ],
    topicIdeas: ['compound interest tricks', 'tax loopholes (legal)', 'money habits of the wealthy', 'budgeting myths'],
    toneGuide: 'Confident, slightly contrarian, urgent. Speak like an insider sharing a secret.',
    avoidList: ['financial advice disclaimers mid-hook', 'jargon without payoff', 'get-rich-quick scam framing'],
  },
  motivation: {
    label: 'Motivation & Mindset',
    hookStyles: ['Hard truth stated bluntly', 'Call out the viewer\'s excuse', 'Future-self contrast'],
    topicIdeas: ['discipline over motivation', 'the 1% rule', 'why comfort kills', 'morning identity shift'],
    toneGuide: 'Intense, direct, second-person. Short punchy sentences. Build to an emotional spike.',
    avoidList: ['toxic positivity', 'generic quotes', 'soft hedging language'],
  },
  tech: {
    label: 'Tech & Gadgets',
    hookStyles: ['"You\'ve been using X wrong"', 'Hidden feature reveal', 'Shocking spec comparison'],
    topicIdeas: ['hidden phone settings', 'AI tools that feel illegal', 'gadget myths', 'speed hacks'],
    toneGuide: 'Sharp, fast, enthusiast energy. Concrete and specific.',
    avoidList: ['spec dumps with no payoff', 'unverified rumors as fact'],
  },
  health: {
    label: 'Health & Fitness',
    hookStyles: ['Result-first body transformation', 'Debunk a common health myth', 'One change, big effect'],
    topicIdeas: ['protein timing', 'sleep and fat loss', 'mobility in 60s', 'gut health basics'],
    toneGuide: 'Energetic, evidence-flavored, practical. No shaming.',
    avoidList: ['medical claims', 'extreme diet promotion', 'before/after exploitation'],
  },
  cooking: {
    label: 'Cooking & Food',
    hookStyles: ['Chef secret reveal', '"Stop doing this in the kitchen"', 'Unexpected ingredient'],
    topicIdeas: ['restaurant tricks at home', 'one-pan meals', 'flavor science', 'kitchen myths'],
    toneGuide: 'Warm but punchy, sensory language, fast steps.',
    avoidList: ['long backstory', 'vague measurements'],
  },
  business: {
    label: 'Business & Entrepreneurship',
    hookStyles: ['Reveal a margin/number', 'Contrarian business take', 'Failure-to-success swing'],
    topicIdeas: ['pricing psychology', 'first 1000 customers', 'cash flow traps', 'leverage'],
    toneGuide: 'Authoritative, operator energy, specific numbers and frameworks.',
    avoidList: ['hustle-culture clichés', 'unsubstantiated revenue flexing'],
  },
  relationships: {
    label: 'Relationships & Psychology',
    hookStyles: ['Name a hidden behavior pattern', 'Reframe a common conflict', 'Psychology study reveal'],
    topicIdeas: ['attachment styles', 'why people pull away', 'communication patterns', 'self-sabotage'],
    toneGuide: 'Insightful, calm-but-gripping, second-person. Evidence-flavored.',
    avoidList: ['armchair diagnosis', 'gender war bait'],
  },
  facts: {
    label: 'Facts & Education',
    hookStyles: ['"This shouldn\'t be possible"', 'Mind-bending stat first', 'Question that breaks assumptions'],
    topicIdeas: ['space scale', 'history nobody teaches', 'body facts', 'physics that feels fake'],
    toneGuide: 'Awe-driven, escalating, vivid imagery. Build wonder then snap it shut.',
    avoidList: ['unsourced claims', 'flat trivia with no arc'],
  },
  luxury: {
    label: 'Luxury & Lifestyle',
    hookStyles: ['Price reveal shock', 'Behind-the-velvet-rope access', 'Status myth bust'],
    topicIdeas: ['why luxury costs that much', 'rich routines', 'hidden-money signals', 'quiet luxury'],
    toneGuide: 'Smooth, aspirational, slightly conspiratorial. Cinematic pacing.',
    avoidList: ['tacky flexing', 'fake wealth claims'],
  },
  custom: {
    label: 'Custom',
    hookStyles: ['Pattern interrupt + curiosity gap'],
    topicIdeas: [],
    toneGuide: 'Defined by the user; default to high-arousal, result-first, looping structure.',
    avoidList: ['filler', 'slow intros'],
  },
};

export const NICHE_KEYS = Object.keys(NICHES);

export function getNiche(key) {
  return NICHES[key] ?? NICHES.custom;
}
