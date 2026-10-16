/**
 * Julee, Arindam's Indian Spitz: white and fluffy, pointy ears, curled plume tail, tongue out,
 * in her striped sweater and red collar with its little charm.
 * Drawn as an SVG so she stays crisp and tiny; style.css makes her blink, pant and wag.
 * @param {'wait'|'hello'} mood wait: a page floats up beside her (loading); hello: she pops up to greet.
 * @returns {SVGSVGElement}
 */
export function julee(mood) {
  const box = document.createElement('div');
  box.innerHTML = `
<svg class="julee ${mood}" viewBox="0 0 240 200" role="img" aria-label="Julee the dog">
  <ellipse class="shadow" cx="100" cy="186" rx="58" ry="7"/>
  <g class="tail">
    <circle cx="150" cy="152" r="19"/><circle cx="166" cy="136" r="17"/><circle cx="173" cy="116" r="14"/>
    <circle cx="168" cy="99" r="11"/><circle cx="158" cy="92" r="8"/>
  </g>
  <ellipse class="fur" cx="100" cy="146" rx="46" ry="38"/>
  <clipPath id="body-${mood}"><ellipse cx="100" cy="146" rx="45" ry="37"/></clipPath>
  <g class="sweater" clip-path="url(#body-${mood})">
    <rect class="s-blue" x="50" y="108" width="100" height="12"/><rect class="s-beige" x="50" y="120" width="100" height="8"/>
    <rect class="s-yellow" x="50" y="128" width="100" height="8"/><rect class="s-green" x="50" y="136" width="100" height="6"/>
    <rect class="s-blue" x="50" y="142" width="100" height="10"/><rect class="s-yellow" x="50" y="152" width="100" height="6"/>
  </g>
  <rect class="fur" x="80" y="150" width="17" height="34" rx="8.5"/>
  <rect class="fur" x="104" y="150" width="17" height="34" rx="8.5"/>
  <g class="head">
    <path class="fur" d="M66 70 L76 26 L98 56 Z"/><path class="ear-in" d="M73 62 L78 38 L90 56 Z"/>
    <path class="fur" d="M134 70 L124 26 L102 56 Z"/><path class="ear-in" d="M127 62 L122 38 L110 56 Z"/>
    <circle class="fur" cx="100" cy="82" r="36"/>
    <circle class="mane" cx="100" cy="128" r="20"/>
    <path class="collar" d="M80 112 Q100 122 120 112"/><circle class="charm" cx="100" cy="122" r="4"/>
    <g class="eyes"><circle cx="87" cy="78" r="4.2"/><circle cx="113" cy="78" r="4.2"/></g>
    <ellipse class="dark" cx="100" cy="93" rx="6" ry="4.4"/>
    <path class="tongue" d="M93 101 Q93 117 100 117 Q107 117 107 101 Z"/>
    <path class="mouth" d="M90 98 Q95 103 100 99 Q105 103 110 98"/>
  </g>
  ${mood === 'wait' ? `
  <g class="page">
    <rect x="182" y="96" width="40" height="52" rx="4"/>
    <path d="M190 110 h24 M190 120 h24 M190 130 h16"/>
  </g>
  <path class="arrow" d="M202 52 v-34 m-10 10 l10 -10 l10 10"/>` : ''}
</svg>`;
  return /** @type {SVGSVGElement} */ (box.firstElementChild);
}
