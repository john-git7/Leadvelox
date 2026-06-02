import fs from 'fs';

const svg = fs.readFileSync('d:/leadvelox/public/logo.svg', 'utf8');

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

const pathRegex = /<path d="([^"]+)"[^>]*transform="translate\(([^,]+),([^)]+)\)"/g;
let match;
while ((match = pathRegex.exec(svg)) !== null) {
  const d = match[1];
  const tx = parseFloat(match[2]);
  const ty = parseFloat(match[3]);
  
  // Extract all numbers from d
  const numbers = d.match(/-?\d+(\.\d+)?/g);
  if (!numbers) continue;
  
  for (let i = 0; i < numbers.length; i += 2) {
    const x = parseFloat(numbers[i]) + tx;
    const y = parseFloat(numbers[i+1]) + ty;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

console.log(`${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
