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
    s02Title: 'The First Man',
    s02Hook: 'He had been alive since before the flood.',
    s02Body: 'Fintan mac Bóchra came to Ireland with the first people ever to set foot on the island. After the great flood rose, Fintan was the only one to live. He survived by changing his shape first into an eagle, then a hawk, and in the end a salmon. Up to the well he swam, and there he ate nine nuts, one from every tree. With the ninth, he had the knowledge of the world inside him, and away down the Boyne he went.',
    s03Title: 'The Poet',
    s03Hook: 'It was said that anyone who ate this salmon would gain all the wisdom of the world.',
    s03Body: 'Finegas, a druid-poet, had given his life to that prophecy. He built a house on the bank of the Boyne and fished every morning. A boy named Fionn came to study with him, hiding from the men who had killed his father.',
    s04Title: 'The Catch',
    s04Hook: 'Then one morning, the water moved differently.',
    s04Body: 'Finegas felt it before he saw it, a weight on the line unlike any other. Silver, vast, ancient. He told Fionn to cook it carefully, and to eat none of it. Then he went to rest, certain his long wait was finally over.',
    s05Title: 'The Thumb',
    s05Hook: 'Fionn turned the salmon slowly over the fire, careful as he had been told.',
    s05Body: 'As it cooked, a blister rose on its silver skin. Afraid his master would think it spoiled, Fionn pressed it flat with his thumb, and the hot skin burned him. Without thinking, he put his thumb in his mouth.',
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
    s02Title: 'An Chéad Fhear',
    s02Hook: 'He had been alive since before the flood.',
    s02Body: 'Fintan mac Bóchra came to Ireland with the first people ever to set foot on the island. After the great flood rose, Fintan was the only one to live. He survived by changing his shape first into an eagle, then a hawk, and in the end a salmon. Up to the well he swam, and there he ate nine nuts, one from every tree. With the ninth, he had the knowledge of the world inside him, and away down the Boyne he went.',
    s03Title: 'An File',
    s03Hook: 'It was said that anyone who ate this salmon would gain all the wisdom of the world.',
    s03Body: 'Finegas, a druid-poet, had given his life to that prophecy. He built a house on the bank of the Boyne and fished every morning. A boy named Fionn came to study with him, hiding from the men who had killed his father.',
    s04Title: 'An Ghabháil',
    s04Hook: 'Then one morning, the water moved differently.',
    s04Body: 'Finegas felt it before he saw it, a weight on the line unlike any other. Silver, vast, ancient. He told Fionn to cook it carefully, and to eat none of it. Then he went to rest, certain his long wait was finally over.',
    s05Title: 'An Ordóg',
    s05Hook: 'Fionn turned the salmon slowly over the fire, careful as he had been told.',
    s05Body: 'As it cooked, a blister rose on its silver skin. Afraid his master would think it spoiled, Fionn pressed it flat with his thumb, and the hot skin burned him. Without thinking, he put his thumb in his mouth.',
  },
};

export function applyStrings(lang) {
  const t = strings[lang];
  document.documentElement.lang = lang;
  document.title = `${t.documentTitle} · Scéalta`;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key !== 'title') el.textContent = t[key]; // the title is built by title.js
  }
  for (const el of document.querySelectorAll('[data-i18n-alt]')) el.alt = t[el.dataset.i18nAlt];
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t[el.dataset.i18nAria]);
}
