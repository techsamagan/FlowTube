import { prisma } from './lib/prisma.js';

const NICHES_DATA = [
  {
    niche: 'Personal Finance',
    hookStyles: [
      'Reveal a counterintuitive money result first',
      'Expose a "rule" rich people break',
      'Show a number that sounds impossible'
    ],
    topicIdeas: ['compound interest tricks', 'tax loopholes (legal)', 'money habits of the wealthy', 'budgeting myths'],
    toneGuide: 'Confident, slightly contrarian, urgent. Speak like an insider sharing a secret.',
    avoidList: ['financial advice disclaimers mid-hook', 'jargon without payoff', 'get-rich-quick scam framing']
  },
  {
    niche: 'Stoicism',
    hookStyles: [
      'An ancient quote that predicts modern problems',
      'The hard truth about why you are unhappy',
      'How Roman emperors solved stress'
    ],
    topicIdeas: ['Marcus Aurelius on anger', 'Seneca\'s guide to time management', 'Epictetus on control', 'Amor Fati explained'],
    toneGuide: 'Calm, slow-paced, deeply reflective, authoritative. Short, heavy statements.',
    avoidList: ['academic lectures', 'dry historical dates', 'soft motivational platitudes']
  },
  {
    niche: 'Dark Psychology',
    hookStyles: [
      'A subtle sign someone is manipulating you',
      'How to read anyone instantly',
      'The psychological trick to win any argument'
    ],
    topicIdeas: ['mirroring body language', 'the power of silence', 'spotting gaslighting', 'the decoy effect in conversation'],
    toneGuide: 'Whispered, mysterious, analytical, slightly intense. Keep the viewer leaning in.',
    avoidList: ['illegal advice', 'unscientific claims', 'overly dramatic sound effects in text']
  },
  {
    niche: 'Alternative History',
    hookStyles: [
      'What if this single event never happened?',
      'The cover-up history books won\'t mention',
      'A historical fact that changes everything'
    ],
    topicIdeas: ['what if Rome never fell', 'the lost library of Alexandria', 'forgotten Tesla inventions', 'undocumented ancient structures'],
    toneGuide: 'Curious, dramatic, investigative. Building suspense before revealing a twist.',
    avoidList: ['conspiracy theories presented as absolute fact', 'boring standard timeline recitations']
  },
  {
    niche: 'AI & Future Tech',
    hookStyles: [
      'This AI tool should be illegal',
      'How ChatGPT is quietly replacing jobs',
      'The future of human-AI integration'
    ],
    topicIdeas: ['no-code AI builders', 'autonomous agents', 'neural networks in daily life', 'AGI timeline predictions'],
    toneGuide: 'Energetic, cutting-edge, tech-forward. High paced and specific.',
    avoidList: ['generic AI hype', 'outdated tools', 'purely technical programming jargon']
  },
  {
    niche: 'Stoic Habits',
    hookStyles: [
      'The morning routine that built empires',
      'Why comfort is your greatest enemy',
      'Ancient rules for modern focus'
    ],
    topicIdeas: ['voluntary discomfort', 'the daily review', 'Stoic journaling', 'memento mori practice'],
    toneGuide: 'Direct, serious, disciplined. Inspiring action through sacrifice.',
    avoidList: ['cliché self-help advice', 'fluffy inspiration']
  },
  {
    niche: 'Bodybuilding & Muscle Growth',
    hookStyles: [
      'Stop doing this on your bench press',
      'The muscle growth science everyone ignores',
      'One tweak to double your results'
    ],
    topicIdeas: ['progressive overload secrets', 'protein synthesis timing', 'mind-muscle connection', 'reps in reserve'],
    toneGuide: 'Instructional, scientific, high-energy. Focus on form and execution.',
    avoidList: ['bro-science', 'steroid discussion', 'shaming beginners']
  },
  {
    niche: 'Biohacking & Longevity',
    hookStyles: [
      'How to reverse your biological age',
      'The sleep protocol top performers use',
      'One morning drink that fixes brain fog'
    ],
    topicIdeas: ['cold plunge benefits', 'red light therapy', 'circadian rhythm optimization', 'NAD+ boosters'],
    toneGuide: 'Clinical, experimental, performance-oriented. Informative and measured.',
    avoidList: ['unbacked supplement claims', 'dangerous extreme hacks']
  },
  {
    niche: 'Real Estate Investing',
    hookStyles: [
      'How to buy a house with zero down',
      'The rental trick banks hate',
      'Why renting might make you richer than buying'
    ],
    topicIdeas: ['house hacking explained', 'BRRRR method walkthrough', 'seller financing hacks', 'finding off-market deals'],
    toneGuide: 'Analytical, wealth-building, educational. Uses real numbers and math.',
    avoidList: ['get-rich-quick scams', 'fluff without deal structures']
  },
  {
    niche: 'Cryptocurrency & Web3',
    hookStyles: [
      'The next major crypto trend nobody is watching',
      'How smart money is routing on-chain',
      'The truth about decentralized finance'
    ],
    topicIdeas: ['yield farming basics', 'layer-2 scaling solutions', 'tokenomics analysis', 'cold storage security'],
    toneGuide: 'Sleek, tech-enthusiast, contrarian. Insightful and cautionary.',
    avoidList: ['speculative pump signals', 'scam coin promotion', 'reckless financial FOMO']
  },
  {
    niche: 'Dropshipping & E-commerce',
    hookStyles: [
      'How we built a $10k/month store in 30 days',
      'The winning product checklist',
      'Why most e-commerce stores fail in week one'
    ],
    topicIdeas: ['TikTok organic marketing', 'finding high-margin suppliers', 'landing page optimization', 'micro-influencer ads'],
    toneGuide: 'Entrepreneurial, gritty, practical. Step-by-step transparency.',
    avoidList: ['lamborghini/flexing lifestyle', 'overhyped courses', 'fake dashboards']
  },
  {
    niche: 'SaaS & Software Business',
    hookStyles: [
      'This solo developer makes $50k/month',
      'The micro-SaaS playbook',
      'How to build software with zero coding'
    ],
    topicIdeas: ['no-code software ideas', 'API-first businesses', 'getting your first 10 SaaS users', 'churn reduction tactics'],
    toneGuide: 'Maker-focused, analytical, builder energy. Highly practical.',
    avoidList: ['bloated enterprise architecture', 'unrealistic valuation talk']
  },
  {
    niche: 'Wealth Mindset',
    hookStyles: [
      'The single belief keeping you poor',
      'How the 1% think about debt',
      'Why saving money is a trap'
    ],
    topicIdeas: ['assets vs liabilities', 'the cost of opportunity', 'abundance vs scarcity mindset', 'leveraging other people\'s time'],
    toneGuide: 'Philosophical, empowering, firm. Challenges standard class assumptions.',
    avoidList: ['generic law-of-attraction fluff', 'victim-blaming']
  },
  {
    niche: 'Mental Toughness',
    hookStyles: [
      'The Navy SEAL rule for when you want to quit',
      'How to build unbreakable discipline',
      'Why motivation is a scam'
    ],
    topicIdeas: ['the 40% rule', 'reframing pain as data', 'emotional regulation under stress', 'delayed gratification'],
    toneGuide: 'Intense, raw, direct, inspiring. No-nonsense delivery.',
    avoidList: ['toxic masculinity', 'unsafe physical advice']
  },
  {
    niche: 'High-Performance Habits',
    hookStyles: [
      'The daily routine of top 0.1% performers',
      'How to double your focus in 48 hours',
      'The dopamine detox guide'
    ],
    topicIdeas: ['deep work protocols', 'habit stacking', 'eliminating decision fatigue', 'digital minimalism'],
    toneGuide: 'Productive, structured, scientific, actionable.',
    avoidList: ['generic productivity templates', 'over-complicating simple habits']
  },
  {
    niche: 'Cold Case Mysteries',
    hookStyles: [
      'The mystery that still baffles the FBI',
      'No one can explain what happened to this crew',
      'The clue police overlooked for decades'
    ],
    topicIdeas: ['the Dyatlov Pass incident', 'the Flannan Isles lighthouse mystery', 'unsolved code letters', 'the DB Cooper flight'],
    toneGuide: 'Suspenseful, eerie, narrative, dramatic. Keep the viewer guessing.',
    avoidList: ['sensationalizing active trauma', 'disrespectful details']
  },
  {
    niche: 'Space Exploration & Astronomy',
    hookStyles: [
      'What\'s hidden inside the black hole?',
      'The terrifying scale of our universe',
      'A signal from space we can\'t explain'
    ],
    topicIdeas: ['the Fermi paradox', 'JWST discovery of early galaxies', 'rogue planets', 'the heat death of the universe'],
    toneGuide: 'Awe-inspiring, cosmic, educational. Builds a sense of scale and wonder.',
    avoidList: ['alien abduction conspiracies', 'dry formulaic math']
  },
  {
    niche: 'Survival & Bushcraft',
    hookStyles: [
      'The 3 survival mistakes that will get you killed',
      'How to find clean water anywhere',
      'The one tool you must have in the wild'
    ],
    topicIdeas: ['building emergency shelters', 'fire-starting techniques', 'navigating without a compass', 'wild edible plant identification'],
    toneGuide: 'Practical, rugged, experienced, reassuring. Focused on survival logic.',
    avoidList: ['doomsday prepper hysteria', 'dangerous reckless activities']
  },
  {
    niche: 'Travel Hacking & Nomadic Life',
    hookStyles: [
      'How to fly first class for $10',
      'The credit card points trick everyone misses',
      'Best countries to live on $1000 a month'
    ],
    topicIdeas: ['digital nomad visas', 'credit card points stacking', 'hidden flight search engines', 'backpacking gear optimization'],
    toneGuide: 'Aspirational, clever, adventurous. Sharing hacks for travel freedom.',
    avoidList: ['illegal immigration advice', 'unrealistic nomadic expectations']
  },
  {
    niche: 'Luxury Cars & Supercars',
    hookStyles: [
      'Why this hypercar costs $5 million',
      'The secret engineering of the Koenigsegg',
      'Why buying a supercar is a terrible investment'
    ],
    topicIdeas: ['supercar depreciation curves', 'how active aerodynamics work', 'the history of Bugatti speed runs', 'sleeper cars under $10k'],
    toneGuide: 'Enthusiastic, premium, analytical, sleek. Speaks to design and engineering.',
    avoidList: ['unsafe street racing', 'tacky showing off without substance']
  },
  {
    niche: 'Time Management & Productivity',
    hookStyles: [
      'Why your to-do list is actually stalling you',
      'The 2-minute rule that beats procrastination',
      'How to get 8 hours of work done in 3'
    ],
    topicIdeas: ['time blocking methods', 'the Pomodoro variation', 'Eisenhower matrix in action', 'saying no to meetings'],
    toneGuide: 'Practical, fast, system-oriented, clear.',
    avoidList: ['generic time tips', 'productivity guilt-trips']
  },
  {
    niche: 'Relationship Psychology',
    hookStyles: [
      'The subtle body language that shows attraction',
      'How to communicate without arguing',
      'The attachment style that ruins relationships'
    ],
    topicIdeas: ['active listening techniques', 'anxious-avoidant trap', 'love languages debunked', 'setting healthy boundaries'],
    toneGuide: 'Compassionate, insightful, research-backed, calm.',
    avoidList: ['manipulative dating advice', 'hostile generalizations']
  },
  {
    niche: 'Credit Card Hacking & Points',
    hookStyles: [
      'The secret credit card trick for free hotels',
      'Stop using cash and do this instead',
      'How to get a perfect credit score fast'
    ],
    topicIdeas: ['maximizing signup bonuses', 'transfer partner sweet spots', 'utilization ratio hacks', 'business credit cards for individuals'],
    toneGuide: 'Savvy, financial-insider, strategic.',
    avoidList: ['advocating carrying credit card debt', 'unregulated lending scams']
  },
  {
    niche: 'Side Hustles & Gig Economy',
    hookStyles: [
      'The side hustle making $3k/month from a laptop',
      'How to flip high-value items online',
      'Why your 9-to-5 is only the beginning'
    ],
    topicIdeas: ['digital product templates', 'local service business arbitrage', 'freelance copywriting', 'user testing side hustles'],
    toneGuide: 'Empowering, direct, practical, execution-focused.',
    avoidList: ['MLMs and pyramid schemes', 'unrealistic hourly rates']
  },
  {
    niche: 'Philosophy & Wisdom',
    hookStyles: [
      'The philosophical concept that stops anxiety',
      'Why Socrates chose to die',
      'Nietzsche\'s guide to becoming yourself'
    ],
    topicIdeas: ['the allegory of the cave', 'utilitarianism vs deontology', 'existentialism in daily life', 'nihilism reframed'],
    toneGuide: 'Intellectual, reflective, accessible, engaging.',
    avoidList: ['academic jargon', 'overly dry texts']
  },
  {
    niche: 'Self-Defense & Martial Arts',
    hookStyles: [
      'The one spot to strike in an emergency',
      'How to break a grip instantly',
      'Survival rules when facing multiple attackers'
    ],
    topicIdeas: ['situational awareness keys', 'de-escalation techniques', 'effective martial arts for self-defense', 'common attack scenarios'],
    toneGuide: 'Serious, instructional, safety-first, authoritative.',
    avoidList: ['fringe/fake martial arts moves', 'encouraging unnecessary violence']
  },
  {
    niche: 'Ancient Civilizations',
    hookStyles: [
      'The engineering marvel historians can\'t explain',
      'What Romans actually did in their spare time',
      'The lost city older than the pyramids'
    ],
    topicIdeas: ['Göbekli Tepe secrets', 'Roman aqueduct engineering', 'Mayan calendar astronomy', 'Bronze age collapse'],
    toneGuide: 'Awe-struck, educational, narrative. Unveiling ancient secrets.',
    avoidList: ['ancient alien theories', 'inaccurate dates']
  },
  {
    niche: 'Mindfulness & Meditation',
    hookStyles: [
      'How to quiet a racing mind in 60 seconds',
      'The breathing protocol that stops stress',
      'What happens to your brain when you meditate'
    ],
    topicIdeas: ['box breathing', 'vipassana meditation', 'mindful walking', 'neuroplasticity and meditation'],
    toneGuide: 'Serene, calming, grounding, science-supported.',
    avoidList: ['mystic hype', 'guarantees of enlightenment']
  },
  {
    niche: 'Charisma & Social Skills',
    hookStyles: [
      'How to make anyone like you instantly',
      'The secret to commanding respect in a room',
      'Conversational loops that keep people talking'
    ],
    topicIdeas: ['the charismatic gaze', 'conversational threading', 'vulnerability matching', 'handling awkward silences'],
    toneGuide: 'Charming, social-insider, confident, practical.',
    avoidList: ['pickup artist tactics', 'fake superficial behaviors']
  },
  {
    niche: 'Sales & Persuasion Hacks',
    hookStyles: [
      'The pricing trick that makes you buy',
      'How to negotiate a salary hike',
      'The psychological trigger to close any deal'
    ],
    topicIdeas: ['scarcity principle', 'reciprocity loop', 'the power of "no" in negotiation', 'anchoring bias in sales'],
    toneGuide: 'Sharp, psychological, business-savvy, tactical.',
    avoidList: ['deceptive sales tactics', 'unethical manipulation']
  },
  {
    niche: 'Digital Marketing & SEO',
    hookStyles: [
      'The search trick driving 1 million monthly clicks',
      'How writing online is the new real estate',
      'Why your website is getting zero search traffic'
    ],
    topicIdeas: ['long-tail keyword strategy', 'on-page SEO essentials', 'content distribution frameworks', 'email marketing hooks'],
    toneGuide: 'Data-driven, growth-oriented, analytical.',
    avoidList: ['black-hat SEO tricks', 'spam generation advice']
  },
  {
    niche: 'Coding & Tech Careers',
    hookStyles: [
      'How to become a software engineer without a degree',
      'The programming language to learn first',
      'Why coding is still the highest paying skill'
    ],
    topicIdeas: ['building a developer portfolio', 'cracking the coding interview', 'git workflows for beginners', 'full-stack development path'],
    toneGuide: 'Pragmatic, tech-savvy, career-focused, clear.',
    avoidList: ['magical bootcamp promises', 'gatekeeping']
  },
  {
    niche: 'Parenting & Child Psychology',
    hookStyles: [
      'Why telling your kid "good job" is backfiring',
      'The gentle way to stop a toddler tantrum',
      'How early childhood shapes adult anxiety'
    ],
    topicIdeas: ['active boundary setting', 'emotional co-regulation', 'play-based learning', 'screen-time boundaries'],
    toneGuide: 'Empathic, research-backed, supportive, calm.',
    avoidList: ['parent-shaming', 'authoritarian discipline']
  },
  {
    niche: 'Career Growth & Salary Negotiation',
    hookStyles: [
      'How to negotiate a $20k raise without sounding greedy',
      'The corporate email templates you need',
      'The subtle sign it\'s time to quit your job'
    ],
    topicIdeas: ['handling difficult bosses', 'optimizing your LinkedIn profile', 'performance review prep', 'internal career pivots'],
    toneGuide: 'Professional, tactical, corporate insider knowledge.',
    avoidList: ['advocating quiet quitting', 'unprofessional behaviors']
  },
  {
    niche: 'Minimalist Living',
    hookStyles: [
      'Why owning less will set you free',
      'The 90/90 rule for decluttering',
      'How consumer culture keeps you anxious'
    ],
    topicIdeas: ['one-in-one-out rule', 'capsule wardrobe creation', 'digital decluttering', 'the cost of mental clutter'],
    toneGuide: 'Calm, simple, intentional, counter-cultural.',
    avoidList: ['extremism', 'judging others\' lifestyles']
  }
];

async function main() {
  console.log('Seeding curated high-RPM niches...');
  for (const n of NICHES_DATA) {
    await prisma.nicheTemplate.upsert({
      where: { niche: n.niche },
      update: {
        hookStyles: n.hookStyles,
        topicIdeas: n.topicIdeas,
        toneGuide: n.toneGuide,
        avoidList: n.avoidList,
      },
      create: {
        niche: n.niche,
        hookStyles: n.hookStyles,
        topicIdeas: n.topicIdeas,
        toneGuide: n.toneGuide,
        avoidList: n.avoidList,
      },
    });
  }
  console.log(`Successfully seeded ${NICHES_DATA.length} niches!`);
}

main()
  .catch((e) => {
    console.error('Error seeding niches:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
