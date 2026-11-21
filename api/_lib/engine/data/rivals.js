// Fictional rival investors who trade the same market with their own strategies.
export const RIVALS = [
  // Rising traders (retail league)
  { id: 'quill', name: 'Mara Quill', style: 'momentum', tier: 'rising', start: 14000, hue: 12, period: 4, picks: 5, bio: 'Chases strength. Sells weakness. Doesn\'t read earnings.' },
  { id: 'holloway', name: 'Dex Holloway', style: 'value', tier: 'rising', start: 22000, hue: 160, period: 10, picks: 6, bio: 'Buys what the crowd hates. Patience is a personality trait.' },
  { id: 'vale', name: 'Tamsin Vale', style: 'contrarian', tier: 'rising', start: 17000, hue: 285, period: 6, picks: 5, bio: 'If everyone is buying, she\'s already left.' },
  { id: 'blackwood', name: 'Orrin Blackwood', style: 'yolo', tier: 'rising', start: 8000, hue: 350, period: 5, picks: 2, bio: 'Concentrated, leveraged in spirit, fearless. Blows up often, wins big sometimes.' },
  { id: 'marchetti', name: 'Lio Marchetti', style: 'index', tier: 'rising', start: 30000, hue: 205, period: 20, picks: 16, bio: 'Owns everything. Complains about nothing.' },
  { id: 'okafor', name: 'Sunny Okafor', style: 'defensive', tier: 'rising', start: 25000, hue: 95, period: 12, picks: 7, bio: 'Sleeps well. Earns steadily. Smug about drawdowns.' },
  { id: 'thornwell', name: 'Bex Thornwell', style: 'sector', tier: 'rising', start: 12000, hue: 40, period: 8, picks: 4, fav: ['AI', 'Technology'], bio: 'Believes in tech and AI above all else. Mostly right, occasionally disastrously.' },
  { id: 'alvarado', name: 'Kit Alvarado', style: 'dividend', tier: 'rising', start: 20000, hue: 55, period: 15, picks: 8, bio: 'Lives on yield. Distrusts anything that doesn\'t pay.' },
  // Elite tycoons
  { id: 'voss', name: 'Cassian Voss', style: 'macro', tier: 'elite', start: 1200000, hue: 255, period: 10, picks: 10, bio: 'Reads central bank minutes for pleasure. Has a yacht called Hawkish.' },
  { id: 'rhys', name: 'Eleanor Whitcombe-Rhys', style: 'value', tier: 'elite', start: 3500000, hue: 150, period: 15, picks: 12, bio: 'The Matriarch of Meridian Row. Holds forever. Judges everyone.' },
  { id: 'greaves', name: 'Hollis Greaves', style: 'momentum', tier: 'elite', start: 800000, hue: 20, period: 6, picks: 8, bio: 'Hedge-fund wunderkind. Trades faster than he thinks.' },
  { id: 'duvall', name: 'Imani Duvall', style: 'sector', tier: 'elite', start: 2100000, hue: 310, period: 12, picks: 7, fav: ['AI', 'Technology', 'Healthcare'], bio: 'Backed three unicorns. Insists she is "just lucky".' },
  { id: 'quartermaine', name: 'Silas Quartermaine', style: 'contrarian', tier: 'elite', start: 5500000, hue: 0, period: 10, picks: 9, bio: 'Made his fortune in the last crash. Waits patiently for the next.' },
  { id: 'fox', name: 'The Gilded Fox', style: 'index', tier: 'elite', start: 12000000, hue: 45, period: 25, picks: 20, bio: 'Nobody has ever seen their face. Everybody has seen their returns.' },
];
