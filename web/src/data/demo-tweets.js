// Demo tweet corpus used by the "Use demo tweets" button in onboarding.
// ~200 tweets in two voice archetypes blended together:
//   - founder / builder energy (terse, contrarian, anti-platitude)
//   - philosopher / writer energy (longer-form, principled, Naval-esque)
// Lets the persona extractor surface a believable voice profile and gives
// the Writer + Editor real material to ground the demo.

export const demoTwitterAccount = {
  handle: 'demo_creator',
  name: 'Demo Creator',
  userId: '0',
  bio: 'founder. writer. trying to ship more than I post.',
  avatar: null,
  stats: {
    followers: 12_840,
    following: 612,
    tweetCount: 4_281,
  },
};

const oneHourMs = 3600 * 1000;
const now = Date.now();
function ago(hours) {
  return new Date(now - hours * oneHourMs).toISOString();
}

export const demoTweets = [
  {
    id: 'demo-1',
    text: "the rituals you don't notice are the ones running you.",
    createdAt: ago(3),
    metrics: { likes: 1842, retweets: 312, replies: 88, impressions: 52_400 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-2',
    text: "founder mode isn't a vibe. it's a 4am decision.",
    createdAt: ago(28),
    metrics: { likes: 4210, retweets: 901, replies: 144, impressions: 138_200 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-3',
    text: 'three rituals I stopped this year — and what changed.',
    createdAt: ago(53),
    metrics: { likes: 902, retweets: 121, replies: 64, impressions: 31_500 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-4',
    text: "your morning routine is a liability if you can't skip it.",
    createdAt: ago(74),
    metrics: { likes: 2440, retweets: 488, replies: 110, impressions: 71_200 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-5',
    text: "the opposite of discipline isn't laziness. it's drift.",
    createdAt: ago(98),
    metrics: { likes: 3120, retweets: 712, replies: 95, impressions: 96_800 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-6',
    text: "burnout gets the headlines. boredom is what actually kills the work.",
    createdAt: ago(122),
    metrics: { likes: 2680, retweets: 540, replies: 102, impressions: 88_300 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-7',
    text: "you don't get to opt out of the boring part. you only get to choose how short it is.",
    createdAt: ago(145),
    metrics: { likes: 1890, retweets: 388, replies: 71, impressions: 58_100 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-8',
    text: 'shipping is a posture, not a feature.',
    createdAt: ago(170),
    metrics: { likes: 1240, retweets: 244, replies: 43, impressions: 39_700 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-9',
    text: "everyone wants a cofounder. nobody wants to be one.",
    createdAt: ago(196),
    metrics: { likes: 5102, retweets: 1140, replies: 220, impressions: 182_400 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-10',
    text: "the 'quick chat' meeting is a tax you pay to look agreeable.",
    createdAt: ago(220),
    metrics: { likes: 3380, retweets: 720, replies: 132, impressions: 102_900 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-11',
    text: "rough draft today beats perfect draft never.",
    createdAt: ago(244),
    metrics: { likes: 1530, retweets: 290, replies: 51, impressions: 48_200 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-12',
    text: 'most "creator economy" advice is just "have an audience already".',
    createdAt: ago(268),
    metrics: { likes: 4020, retweets: 950, replies: 188, impressions: 144_300 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-13',
    text: "stop optimizing your morning. optimize what you do at 3pm when you're tired.",
    createdAt: ago(290),
    metrics: { likes: 2890, retweets: 605, replies: 119, impressions: 90_400 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-14',
    text: "every tool I love started as a script I was embarrassed about.",
    createdAt: ago(316),
    metrics: { likes: 1720, retweets: 311, replies: 64, impressions: 53_700 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-15',
    text: "the founders who write daily tend to ship faster. probably not a coincidence.",
    createdAt: ago(340),
    metrics: { likes: 980, retweets: 184, replies: 38, impressions: 28_900 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-16',
    text: "your taste outpaces your skill. that's the whole gap.",
    createdAt: ago(364),
    metrics: { likes: 3950, retweets: 902, replies: 161, impressions: 128_700 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-17',
    text: "I deleted slack from my phone two weeks ago. nothing has gone wrong.",
    createdAt: ago(388),
    metrics: { likes: 4420, retweets: 1010, replies: 224, impressions: 159_800 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-18',
    text: "good product reviews. great product reviews. nobody reviews the queue you're standing in.",
    createdAt: ago(412),
    metrics: { likes: 1310, retweets: 248, replies: 44, impressions: 41_800 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-19',
    text: "the worst hire is the one you knew was wrong but couldn't be bothered to redo the search.",
    createdAt: ago(436),
    metrics: { likes: 5210, retweets: 1192, replies: 240, impressions: 187_400 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-20',
    text: 'every "I should write about that" dies in a draft folder.',
    createdAt: ago(460),
    metrics: { likes: 2840, retweets: 612, replies: 102, impressions: 89_400 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-21',
    text: "morning rule: no email before noon. afternoon rule: no slack after 4. nobody has ever called for an emergency.",
    createdAt: ago(484),
    metrics: { likes: 3690, retweets: 802, replies: 148, impressions: 121_200 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-22',
    text: "if you're not embarrassed by v1, you spent too long on it.",
    createdAt: ago(510),
    metrics: { likes: 2310, retweets: 510, replies: 84, impressions: 71_900 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-23',
    text: "writing every day stopped being a discipline the day I admitted I just like writing.",
    createdAt: ago(536),
    metrics: { likes: 1840, retweets: 372, replies: 62, impressions: 56_400 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-24',
    text: "small product. small audience. small launches. compound everything.",
    createdAt: ago(562),
    metrics: { likes: 4810, retweets: 1085, replies: 210, impressions: 168_200 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  {
    id: 'demo-25',
    text: "the team you build is the brief you wrote.",
    createdAt: ago(590),
    metrics: { likes: 6120, retweets: 1480, replies: 287, impressions: 223_900 },
    lang: 'en',
    isRetweet: false, isReply: false,
  },
  // ============================================================
  // Bulk corpus continues — generated in two voices.
  // ============================================================
  ...generated(),
];

// ---- Bulk generator ------------------------------------------
// Keeping the bulk in a function so the literal at the top stays small
// and easy to scan. Each tweet inherits realistic engagement scaling
// from the static set above.

function tweet(id, text, hoursAgo, likes, retweets, replies, impressions) {
  return {
    id,
    text,
    createdAt: ago(hoursAgo),
    metrics: { likes, retweets, replies, impressions },
    lang: 'en',
    isRetweet: false,
    isReply: false,
  };
}

function generated() {
  const out = [];
  // Founder / builder voice — terse, contrarian, anti-platitude.
  const FOUNDER = [
    "the worst part of building is when you realize the bottleneck was always you.",
    "founder mode is just letting yourself care about details everyone else thinks are too small.",
    "ship daily. write weekly. think monthly.",
    "your roadmap is a hypothesis. stop defending it like a religion.",
    "the user knows what they want. they don't know what's possible.",
    "every meeting that could've been an async update is two meetings — the meeting, and the meeting to recover from it.",
    "good engineers ask why the bug exists. great ones ask why the system allowed it.",
    "a metric that no one looks at is a metric that doesn't exist.",
    "your second product is harder than your first. accept it.",
    "fundraise from people who'd buy the product if they weren't an investor.",
    "premature scale is just paid procrastination.",
    "the org chart is the architecture diagram of the company.",
    "fire the customer that is teaching the rest of the customers to abuse you.",
    "you don't have a strategy problem. you have a courage problem.",
    "every founder underestimates how much of the job is psychological maintenance.",
    "the easiest way to ship faster is to delete features.",
    "if your team can't say 'no' to you, your roadmap is a fantasy.",
    "stop optimizing for the journalist. optimize for the user.",
    "the person who reads every tweet about your launch is not your customer.",
    "the moat is rarely the product. it's the speed at which you change the product.",
    "every great founder I know has one trait: they finish the boring 80%.",
    "if it would take 3 months to fix and is killing you in 1 week, just bandage it.",
    "your investor's pattern matching is from companies that already won. yours is from one that hasn't.",
    "shipping is the only marketing that compounds.",
    "the bug that scares you most is the one you'll learn the least from.",
    "the bar isn't 'better than competitors'. it's 'good enough that switching feels obvious'.",
    "co-founder breakups happen because the relationship was a contract, not a friendship.",
    "every PM I respect has shipped something they were embarrassed by.",
    "engineering velocity is more about taste than typing speed.",
    "the founder's energy is the company's ceiling.",
    "your first hire teaches the second hire what kind of company this is.",
    "be suspicious of any project that requires a kickoff deck.",
    "if you can't explain it on a phone call, you can't ship it in a quarter.",
    "the fastest way to grow is to make the existing users 2x happier.",
    "everyone says they want feedback. they want validation that survives feedback.",
    "demo to one customer per week. forever.",
    "the roadmap is a marketing artifact, not a build artifact.",
    "your runway is shorter than you think. the market has memory but no patience.",
    "writing the postmortem is half the value of the postmortem.",
    "the team that ships every Friday will out-build the team that ships when ready.",
    "every meeting is either reducing entropy or adding it. notice which.",
    "burnout is grief in disguise — for the version of the project you imagined.",
    "if the metric requires a story, it's not a metric.",
    "you don't need a rebrand. you need to ship the next version.",
    "the company you'll be in 3 years is the result of who you hire this quarter.",
    "founders romanticize the bet. operators romanticize the execution.",
    "your weekly review is a forcing function. skip it and the week disappears.",
    "stop confusing 'shipped' with 'launched'.",
    "the deepest moat is being the team that cares the most for the longest.",
    "every plan survives until you put a date next to it.",
    "the cost of a bad hire is twice the cost of leaving the role open.",
    "founders who can write don't need decks.",
    "your most senior engineer should be able to tell you the worst part of the codebase in 5 seconds.",
    "the customer doesn't care that the codebase is a mess. they care that the bug is still there.",
    "if you have to convince someone to take the offer, it's the wrong offer or the wrong person.",
    "raising money is a tax on focus.",
    "every demo I've given that worked was a story, not a tour.",
    "the meeting before the meeting decides the meeting.",
    "if your product needs an onboarding video, your product needs less onboarding.",
    "the difference between a startup and a hobby is whether you ship when you don't feel like it.",
    "if the roadmap looks like everyone else's, the company is going to look like everyone else's.",
    "writing in public is the cheapest way to compound your network.",
    "your product spec is wrong. ship it anyway and listen.",
    "the only retention metric that matters is the one you'd bet your house on.",
    "managing up is just managing — your manager is also your user.",
    "what you tolerate becomes the culture.",
    "the most expensive code is the code you wrote and don't remember.",
    "every team has a person who is the source of the energy. protect them.",
    "if the answer is 'we'll figure it out later', figure it out now.",
    "the product is not the website. the website is what brings them to the product.",
    "calendars are confessions about priorities.",
    "the hardest part of being a founder is the second year.",
    "if it doesn't fit on one slide, it's not a strategy yet.",
    "the company you're proud of in year 5 is built on choices you made in year 1 that no one noticed.",
    "founders who do annual reviews of themselves outperform founders who don't, by a lot.",
    "the easiest way to get good feedback is to ship something embarrassing.",
    "every successful pivot is preceded by 6 weeks of denial.",
    "if you can't draw it on a napkin, the customer can't repeat it.",
    "your team's velocity is your hiring filter, not your sprint length.",
    "the right time to start writing about the company is now. always now.",
    "the bug everyone agrees not to fix is the most expensive feature you ship.",
    "promotions don't make managers. managing through one quarter does.",
    "burn rate is a vibe before it's a number.",
    "OKRs that no one quotes back to you in week 4 are not OKRs.",
    "founders should have a personal bar for 'good enough' and stop moving it after the launch.",
    "the brief you wrote yesterday is too narrow. open it up before you ship.",
    "if a customer pays you and you can't explain why, you don't have product-market fit yet.",
    "the people you fire teach you more than the people you hire.",
    "design is what's left after you remove everything that doesn't earn its place.",
    "your first 100 users are not your next 1000.",
    "if you have to tell people the brand is premium, it isn't.",
    "every roadmap has a 'real' and a 'told'. founders who can hold both win.",
    "no one shipped great work the week they decided to be a great person.",
    "the way you handle the first incident sets the standard for the next ten.",
    "your team's confidence is downstream of your willingness to make decisions.",
    "if you're the smartest person in the meeting, the meeting was for someone else.",
    "the best PMs I know read more than they ship.",
    "calendar shame is real. delete the meetings.",
    "you can't out-execute a wrong strategy, but you can out-strategize bad execution.",
    "every great team has someone who keeps saying 'is this still the right problem?'",
  ];

  // Philosopher / writer voice — Naval-esque, longer, principle-first.
  const PHILOSOPHER = [
    "discipline is just the willingness to be uncomfortable for longer than feels reasonable.",
    "you don't have to win the argument. you have to outlast the topic.",
    "most people don't have a productivity problem. they have a clarity problem.",
    "the opposite of confidence isn't doubt. it's noise.",
    "you become what you tolerate from yourself.",
    "ambition without taste is dangerous. taste without ambition is wasted.",
    "the meaningful life is built from the meaningful hour, repeated.",
    "your attention is the only currency the algorithm wants. spend it deliberately.",
    "freedom is the ability to walk away from a bad sentence.",
    "wisdom is mostly just the willingness to be wrong on a faster timescale.",
    "the test of a principle is whether you keep it when it costs you.",
    "you can't choose your craving. you can choose what to do at 9pm.",
    "patience is a wager that compounding will outperform cleverness. it almost always does.",
    "the audience that arrives because of your last post leaves at your next one.",
    "good writing isn't precious. it's just rewriting that didn't quit early.",
    "envy is information. it tells you what you actually want.",
    "hard work compounds. opinions don't.",
    "you'll regret the books you didn't write more than the ones that didn't sell.",
    "advice is autobiography. listen for the wound.",
    "the best decisions are made by the version of you who has slept and eaten.",
    "happiness is mostly what you stop doing.",
    "the future you isn't more disciplined. the future you is the same person with different defaults.",
    "if it's clear after one read, it took five drafts.",
    "the most underrated skill is being able to say 'I changed my mind' without resentment.",
    "the people you envy are the ones who look free. study what they refused.",
    "you don't need more time. you need fewer goals.",
    "every craft has a layer of repetition you have to fall in love with.",
    "the cost of saying 'yes' is the next 'no' you'll regret.",
    "creativity is mostly subtraction.",
    "the easiest way to get clear is to write it down and stop reading what you wrote.",
    "money buys options. options reduce regret. regret is the actual tax on a misspent life.",
    "the audience never tells you what they want. they tell you what they've already gotten.",
    "what you do every day is who you are.",
    "ambition without rest is a fast way to stop being good at the thing you wanted.",
    "the truth is rarely loud. listen to the things people whisper.",
    "everyone you admire is winging it on a longer timescale.",
    "a great life is the average of your daily decisions, not the peak of them.",
    "if you can't name the constraint, you don't understand the system.",
    "the right to be inconsistent is the price of paying attention.",
    "you don't have a procrastination problem. you have a fear of the next sentence.",
    "the deepest meditation is just unbroken attention to a difficult thing.",
    "freedom is a side effect of low monthly burn.",
    "envy is a compass that points away from your real work.",
    "doing the work you fear is the work.",
    "rest is not a reward for productivity. it's a precondition.",
    "you teach the world how to treat you by what you accept the second time.",
    "your standards are revealed by what you let slide.",
    "the lessons you needed at 25 sound boring at 35. that's how you know they're true.",
    "people who write a lot get clearer. people who post a lot get louder. notice the difference.",
    "the work you'd do if no one was watching is the work that compounds.",
    "the best tool is the one you'll actually use on a Tuesday.",
    "becoming yourself is mostly subtracting other people's voices.",
    "if you can't justify it after a week of distance, you didn't believe it. you just wanted to believe it.",
    "the fastest way to age yourself is to stop reading.",
    "small public commitments outperform large private intentions.",
    "you don't need to be loud. you need to be clear.",
    "creativity is just a long argument with your default settings.",
    "the hardest skill to keep is curiosity past 35.",
    "every difficult conversation you postpone is a tax you pay forever.",
    "boredom is the entrance fee to original thought.",
    "the muse shows up where the routine is.",
    "your best ideas come from the books you finished. not the ones you bought.",
    "the kindest thing you can do for a friend is be honest the second time.",
    "your reputation is what you do when nobody is keeping score.",
    "writing in public taught me that I was never really alone.",
    "the fastest way to find your voice is to write more than you read for a quarter.",
    "the most generous thing you can do is finish your thought.",
    "the discipline of writing badly is the precondition for writing well.",
    "no one cares about the framework you used. they care about the decision you made.",
    "lower your standard for starting. raise it for shipping.",
    "the minute you optimize for the algorithm, you stop being the reason anyone follows you.",
    "you don't get to choose what you remember. you get to choose what you commit to.",
    "every long career has a chapter where everyone thought you were lost.",
    "the work I'm proud of came from the season I was most afraid.",
    "the signal you'll regret most isn't the one that went viral. it's the one you didn't send.",
    "compounding requires that you don't reset the timer.",
  ];

  let id = 26;
  // Spread tweets across the last ~120 days, mixed cadence.
  const candidates = [];
  for (const text of FOUNDER) candidates.push({ text, voice: 'founder' });
  for (const text of PHILOSOPHER) candidates.push({ text, voice: 'philosopher' });
  // Shuffle for time variety using a deterministic-feeling rotation.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const { text, voice } of candidates) {
    const hours = Math.round(8 + Math.random() * 24 * 120); // up to 120 days back
    // Founder voice: shorter, punchier — slightly more retweets, fewer replies.
    // Philosopher: longer — more replies + impressions.
    const baseLikes = voice === 'founder' ? 600 + Math.random() * 4000 : 800 + Math.random() * 5500;
    const likes = Math.round(baseLikes);
    const retweets = Math.round(likes * (voice === 'founder' ? 0.20 : 0.15));
    const replies = Math.round(likes * (voice === 'founder' ? 0.04 : 0.06));
    const impressions = Math.round(likes * (15 + Math.random() * 25));
    out.push(tweet(`demo-${id}`, text, hours, likes, retweets, replies, impressions));
    id += 1;
  }
  return out;
}
