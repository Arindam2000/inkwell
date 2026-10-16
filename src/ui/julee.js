import juleeArt from './img/julee.jpg';
import lilyArt from './img/lily.jpg';

/**
 * Julee and Lily, Arindam's Indian Spitz girls, as Ghibli-style watercolour paintings (made in Google
 * Flow from his photos; paper turned pure white so it melts into the page). style.css gives them
 * slow, soothing life: breathing, a soft head nod, blinks, and petals drifting past.
 * Each dog: the painting, plus a copy of just the head (soft-edged mask) that nods on its own.
 * @param {'wait'|'hello'} mood wait: a page floats up beside them (loading); hello: they hop in to greet.
 * @returns {HTMLElement}
 */
export function julee(mood) {
  const box = document.createElement('div');
  box.className = `pups ${mood}`;
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', 'Julee and Lily, the dogs');
  box.innerHTML = `
  ${dog('lily', lilyArt)}
  ${dog('julee', juleeArt)}
  ${mood === 'wait' ? `<svg class="page" viewBox="0 0 48 90" aria-hidden="true">
    <path class="arrow" d="M24 30 v-26 m-9 9 l9 -9 l9 9"/>
    <rect x="5" y="38" width="38" height="48" rx="5"/><path class="lines" d="M12 50 h24 M12 59 h24 M12 68 h16"/>
  </svg>` : ''}
  <span class="petal p0"></span><span class="petal p1"></span><span class="petal p2"></span>`;
  return box;
}

/** One painted dog with its own nodding head and blinking eyes. @param {string} who @param {string} art */
function dog(who, art) {
  return `<div class="dog ${who}">
    <img src="${art}" alt="" draggable="false">
    <div class="head"><img src="${art}" alt="" draggable="false"><span class="lid l"></span><span class="lid r"></span></div>
  </div>`;
}
/** What the girls say, in Bengali and the same in English letters. A different one each time. */
export const HELLO = [
  ['নমস্কার! আজ কী প্রিন্ট করবো?', 'Nomoshkar! Aaj ki print korbo?'],
  ['জুলি আর লিলি হাজির!', 'Julee ar Lily hajir!'],
  ['চলো, কিছু ছাপাই!', 'Cholo, kichhu chhapai!'],
  ['ভালো আছো? কাগজ রেডি?', 'Bhalo achho? Kagoj ready?'],
  ['লিলি লেজ নাড়ছে, ফাইলটা দাও!', 'Lily lej narchhe, file-ta dao!'],
];
export const WAIT = [
  ['একটু অপেক্ষা করুন!', 'Ektu opekkha korun!'],
  ['এই তো, প্রায় হয়ে গেছে…', 'Ei to, prai hoye gechhe…'],
  ['লিলি পাতা গুনছে…', 'Lily pata gunchhe…'],
  ['জুলি কাগজ সাজাচ্ছে…', 'Julee kagoj sajachhe…'],
  ['আর একটুখানি…', 'Ar ektukhani…'],
];

/** Put line `i` of `lines` in a bubble, with a soft fade-up. @param {HTMLElement} bubble @param {string[][]} lines @param {number} i */
export function say(bubble, lines, i) {
  const [bn, latin] = lines[((i % lines.length) + lines.length) % lines.length];
  /** @type {HTMLElement} */ (bubble.querySelector('.bn')).textContent = bn;
  /** @type {HTMLElement} */ (bubble.querySelector('.en')).textContent = latin;
  bubble.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' });
}
