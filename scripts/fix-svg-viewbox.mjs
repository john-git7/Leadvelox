import fs from 'fs';

let svg = fs.readFileSync('d:/leadvelox/public/logo.svg', 'utf8');

svg = svg.replace(
  /<svg[^>]+>/,
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="966 211 897 790">'
);

fs.writeFileSync('d:/leadvelox/public/logo.svg', svg);
console.log('Fixed SVG viewBox');
