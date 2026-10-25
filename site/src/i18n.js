// UI strings. The Irish is a working draft: have a fluent speaker check it before launch.
// In `title`, a newline breaks the line and [x] marks the letter whose counter becomes
// the window into scene 01.
export const strings = {
  en: {
    title: 'The Salmon\nof Kn[o]wledge',
    documentTitle: 'The Salmon of Knowledge',
    sound: 'Sound',
    language: 'Language',
    listen: 'Listen to the story',
    read: 'Read the story',
    switchAnyTime: 'You can switch at any time',
    pauseMotion: 'Pause motion',
    playMotion: 'Play motion',
    salmonAlt: 'An ancient salmon drawn in fine glowing green lines, its eye a single point of vermilion.',
    scroll: 'Scroll',
    s01Title: 'The Well',
    s01Hook: 'Before the world was as it is, there was a deep well of water.',
    s01Body: 'The Well of Segais was hidden away near Carbury in County Kildare, where the rivers of Ireland were said to rise. The river Boyne came out of it first. Around the well grew nine hazel trees, and every autumn their nuts dropped into the water. Inside every nut was a share of all that was ever known.',
  },
  ga: {
    title: 'Bra[d]án\nan Feasa',
    documentTitle: 'Bradán an Feasa',
    sound: 'Fuaim',
    language: 'Teanga',
    listen: 'Éist leis an scéal',
    read: 'Léigh an scéal',
    switchAnyTime: 'Is féidir athrú am ar bith',
    pauseMotion: 'Stop an ghluaiseacht',
    playMotion: 'Seinn an ghluaiseacht',
    salmonAlt: 'Bradán ársa i línte míne glasa lonracha, a shúil ina pointe amháin dearg.',
    scroll: 'Scrollaigh',
    // scene text in Irish still to be translated; the Irish title stands in for now
    s01Title: 'An Tobar',
    s01Hook: 'Before the world was as it is, there was a deep well of water.',
    s01Body: 'The Well of Segais was hidden away near Carbury in County Kildare, where the rivers of Ireland were said to rise. The river Boyne came out of it first. Around the well grew nine hazel trees, and every autumn their nuts dropped into the water. Inside every nut was a share of all that was ever known.',
  },
};

export function applyStrings(lang) {
  const t = strings[lang];
  document.documentElement.lang = lang;
  document.title = t.documentTitle;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key !== 'title') el.textContent = t[key]; // the title is built by title.js
  }
  for (const el of document.querySelectorAll('[data-i18n-alt]')) el.alt = t[el.dataset.i18nAlt];
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t[el.dataset.i18nAria]);
}
