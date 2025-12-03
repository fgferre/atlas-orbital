import fs from "fs";
const path =
  "c:/Users/fgfer/OneDrive/Documents/GitHub/atlas-orbital/_legacy/nasa eyes of the solar system study/app.js";

try {
  const content = fs.readFileSync(path, "utf8");

  const keywords = [
    "BloomPass",
    "UnrealBloom",
    "toneMapping",
    "exposure",
    "renderer.toneMapping",
  ];

  keywords.forEach((keyword) => {
    let index = content.indexOf(keyword);
    for (let i = 0; i < 3; i++) {
      if (index !== -1) {
        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + 300);
        console.log(`\nContext around "${keyword}" (match ${i + 1}):`);
        console.log(content.substring(start, end));
        index = content.indexOf(keyword, index + 1);
      } else {
        break;
      }
    }
    if (index === -1 && keywords.indexOf(keyword) === 0) {
      //
    }
  });
} catch (err) {
  console.error(err);
}
