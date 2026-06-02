import fs from 'fs';

const svgContent = fs.readFileSync('C:/Users/john/Downloads/Gemini_Generated_Image_h8ulonh8ulonh8ul.svg', 'utf8');

// Parse SVG content to make it a clean static SVG file
let cleaned = svgContent
  // Remove the background path (the one that fills the entire 2816x1536 area)
  .replace(/<path d="M0 0 C929\.28 0 1858\.56 0 2816 0.*?fill="#F6F7F5".*?\/>\s*/, '')
  // Replace all other fills with solid black (it will be used as a mask, so color doesn't matter much, but black is good)
  .replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#000000"');

fs.writeFileSync('d:/leadvelox/public/logo.svg', cleaned);
console.log('Successfully wrote public/logo.svg');
