/* Copies the three.js files the app needs into app/vendor so the program runs fully offline. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'app', 'vendor');
fs.mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/three/build/three.module.min.js', 'three.module.min.js'],
  ['node_modules/three/examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'],
  ['node_modules/three/LICENSE', 'three-LICENSE.txt']
];
for (const [from, to] of files) fs.copyFileSync(path.join(root, from), path.join(out, to));
console.log('vendor: copied', files.map((f) => f[1]).join(', '));
