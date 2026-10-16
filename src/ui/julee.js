/**
 * Julee and Lily, Arindam's Indian Spitz girls, drawn anime-style: white fluffy fur with soft cream
 * shading, pointy pink-lined ears, big glossy eyes, blush. Julee: tongue out, striped sweater, red
 * collar with its little gold charm. Lily: the puppy, smaller, bigger head, curious, no sweater.
 * style.css gives them slow, soothing motion (Lily a little quicker, she's young).
 * @param {'wait'|'hello'} mood wait: a page floats up beside them (loading); hello: they hop in to greet.
 * @returns {SVGSVGElement}
 */
export function julee(mood) {
  const id = (/** @type {string} */ n) => `${n}-${mood}`;
  const box = document.createElement('div');
  box.innerHTML = `
<svg class="julee ${mood}" viewBox="0 0 330 230" role="img" aria-label="Julee and Lily, the dogs">
  <defs>
    <radialGradient id="${id('fur')}" cx="0.4" cy="0.3" r="0.85"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#efe4cf"/></radialGradient>
    <radialGradient id="${id('eye')}" cx="0.45" cy="0.6" r="0.7"><stop offset="0" stop-color="#7a4b28"/><stop offset="0.7" stop-color="#3a2416"/><stop offset="1" stop-color="#1d120b"/></radialGradient>
    <linearGradient id="${id('ear')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffb3bd"/><stop offset="1" stop-color="#ffd9de"/></linearGradient>
    <linearGradient id="${id('tongue')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7d95"/><stop offset="1" stop-color="#ffa3b4"/></linearGradient>
    <clipPath id="${id('body')}"><ellipse cx="112" cy="162" rx="48" ry="42"/></clipPath>
  </defs>
  <g class="sparkles">${[[40, 40], [292, 38], [312, 120], [14, 120]].map(([x, y], i) => `<path class="spark s${i}" d="M${x} ${y - 7} Q${x} ${y} ${x + 7} ${y} Q${x} ${y} ${x} ${y + 7} Q${x} ${y} ${x - 7} ${y} Q${x} ${y} ${x} ${y - 7} Z"/>`).join('')}</g>
  <g class="lily" transform="translate(150 70) scale(-0.66 0.66)">${dog(id, false)}</g>
  <g transform="translate(80 0)">${dog(id, true)}</g>
  ${mood === 'wait' ? `
  <g class="page">
    <rect x="286" y="120" width="38" height="50" rx="5"/>
    <path d="M293 133 h24 M293 142 h24 M293 151 h16"/>
  </g>
  <path class="arrow" d="M305 104 v-30 m-10 10 l10 -10 l10 10"/>` : ''}
</svg>`;
  return /** @type {SVGSVGElement} */ (box.firstElementChild);
}

/**
 * One dog. Julee wears her sweater, collar and charm and has her tongue out; Lily (the puppy) gets a
 * bigger head and a small closed smile. @param {(n: string) => string} id @param {boolean} isJulee
 */
function dog(id, isJulee) {
  return `
  <ellipse class="shadow" cx="112" cy="214" rx="64" ry="7"/>
  <g class="breathe">
    <g class="tail">
      <path class="fur" fill="url(#${id('fur')})" d="${fluff(166, 136, 26, 42, 18, 0.11, 0.45)}"/>
      <path class="fur" fill="url(#${id('fur')})" d="${fluff(171, 108, 17, 19, 12, 0.13, 0.3)}"/>
    </g>
    <path class="fur" fill="url(#${id('fur')})" d="${fluff(112, 162, 50, 44, 24, 0.07, 0)}"/>
    ${isJulee ? `<g clip-path="url(#${id('body')})">
      ${[[124, 'blue', 12], [136, 'beige', 7], [143, 'yellow', 8], [151, 'green', 6], [157, 'blue', 10], [167, 'yellow', 6], [173, 'beige', 30]]
        .map(([y, c, h]) => `<path class="s-${c}" d="M56 ${y} Q112 ${+y + 9} 168 ${y} L168 ${+y + +h} Q112 ${+y + +h + 9} 56 ${+y + +h} Z"/>`).join('')}
    </g>` : ''}
    <g class="legs">
      <rect class="fur" fill="url(#${id('fur')})" x="88" y="172" width="21" height="40" rx="10.5"/>
      <rect class="fur" fill="url(#${id('fur')})" x="115" y="172" width="21" height="40" rx="10.5"/>
      <path class="toe" d="M95 206 v5 M102 206 v5 M122 206 v5 M129 206 v5"/>
    </g>
    <path class="fur ruff" fill="url(#${id('fur')})" d="${fluff(112, 126, 32, 16, 16, 0.14, 0)}"/>
    <g transform="${isJulee ? '' : 'translate(112 118) scale(1.16) translate(-112 -118)'}"><g class="head">
      <g class="ear left"><path class="fur" fill="url(#${id('fur')})" d="M70 70 C64 46 68 24 78 10 C90 24 100 40 104 56 Z"/>
        <path fill="url(#${id('ear')})" d="M76 62 C73 46 75 32 80 22 C87 33 93 44 96 54 Z"/></g>
      <g class="ear right"><path class="fur" fill="url(#${id('fur')})" d="M154 70 C160 46 156 24 146 10 C134 24 124 40 120 56 Z"/>
        <path fill="url(#${id('ear')})" d="M148 62 C151 46 149 32 144 22 C137 33 131 44 128 54 Z"/></g>
      <path class="fur" fill="url(#${id('fur')})" d="${fluff(112, 84, 46, 40, 26, 0.06, 0)}"/>
      ${isJulee ? `<path class="collar" d="M84 118 Q112 130 140 118"/>
      <g class="charm"><path class="cord" d="M112 124 v6"/><circle cx="112" cy="134" r="4.6"/></g>` : ''}
      <ellipse class="blush" cx="86" cy="98" rx="8" ry="4"/><ellipse class="blush" cx="138" cy="98" rx="8" ry="4"/>
      <g class="eyes">
        <ellipse fill="url(#${id('eye')})" cx="95" cy="84" rx="8.5" ry="10.5"/><ellipse fill="url(#${id('eye')})" cx="129" cy="84" rx="8.5" ry="10.5"/>
        <circle class="shine" cx="92" cy="79.5" r="3.4"/><circle class="shine" cx="126" cy="79.5" r="3.4"/>
        <circle class="shine small" cx="98.5" cy="89" r="1.6"/><circle class="shine small" cx="132.5" cy="89" r="1.6"/>
      </g>
      <path class="nose" d="M105 96 Q112 92.5 119 96 Q116 102.5 112 102.5 Q108 102.5 105 96 Z"/>
      <ellipse class="nose-shine" cx="109.5" cy="96.5" rx="2.2" ry="1.2"/>
      ${isJulee ? `<path class="tongue" fill="url(#${id('tongue')})" d="M106 106 Q106 119 112 119 Q118 119 118 106 Z"/>` : ''}
      <path class="mouth" d="M112 102.5 v3.5 M112 106 Q107 110.5 102.5 106.5 M112 106 Q117 110.5 121.5 106.5"/>
      ${isJulee ? '<path class="tongue-line" d="M112 109 v6"/>' : ''}
    </g></g>
  </g>`;
}

/**
 * A fluffy fur outline: an ellipse whose edge is a ring of soft tufts (each tuft bulges outward).
 * Tuft sizes vary a little (fixed pattern, so she looks the same every time).
 * @param {number} cx @param {number} cy @param {number} rx @param {number} ry
 * @param {number} n tufts @param {number} depth how far tufts stick out (share of the radius) @param {number} turn tilt in radians
 */
function fluff(cx, cy, rx, ry, n, depth, turn) {
  const at = (/** @type {number} */ a, /** @type {number} */ k) => {
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    return `${(cx + x * Math.cos(turn) - y * Math.sin(turn)).toFixed(1)} ${(cy + x * Math.sin(turn) + y * Math.cos(turn)).toFixed(1)}`;
  };
  let d = `M${at(0, 1)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    const k = 1 + depth * (1 + 0.4 * Math.sin(i * 2.7));
    d += ` Q${at((a0 + a1) / 2, k)} ${at(a1, 1)}`;
  }
  return `${d} Z`;
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
