const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const T = { cream: "#F3E3C3", latte: "#FFF8E7", mocha: "#D9C3A5", mochaDark: "#7A6244", mochaText: "#6B5238", burgundy: "#4A0F1F", cherry: "#8E1B2E", latte2: "#FBEFD3" };
const pairs = [
  ["burgundy", "cream", "body text on page"], ["burgundy", "latte", "body text on card"],
  ["latte", "burgundy", "primary button text"], ["mochaText", "cream", "muted text on page"], ["mochaText", "latte", "muted text on card"],
  ["cherry", "latte", "urgent text on card"], ["cherry", "cream", "urgent text on page"], ["latte", "cherry", "critical chip text"],
  ["mochaDark", "latte", "input border on card (UI 3:1)"], ["mochaDark", "cream", "border on page (UI 3:1)"], ["cherry", "latte", "focus ring (UI 3:1)"],
  ["burgundy", "mocha", "text on mocha chip"], ["mocha", "cream", "decorative divider (informational)"],
];
for (const [f, b, n] of pairs) console.log(`${n.padEnd(40)} ${T[f]} on ${T[b]} = ${ratio(T[f], T[b]).toFixed(2)}`);
