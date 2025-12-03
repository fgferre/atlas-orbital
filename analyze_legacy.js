import fs from "fs";
const path =
  "c:/Users/fgfer/OneDrive/Documents/GitHub/atlas-orbital/_legacy/nasa eyes of the solar system study/app.js";

try {
  const content = fs.readFileSync(path, "utf8");

  // Look for bloom enablement
  const bloomKeywords = [
    "_threeJsUnrealBloomPass.enabled",
    "_threeJsUnrealBloomPass.strength",
    "_threeJsUnrealBloomPass.radius",
  ];

  console.log("--- BLOOM ANALYSIS ---");
  bloomKeywords.forEach((keyword) => {
    let index = content.indexOf(keyword);
    let count = 0;
    while (index !== -1 && count < 5) {
      const start = Math.max(0, index - 100);
      const end = Math.min(content.length, index + 300);
      console.log(`\nContext around "${keyword}" (match ${count + 1}):`);
      console.log(content.substring(start, end));
      index = content.indexOf(keyword, index + 1);
      count++;
    }
  });

  // Look for lighting
  const lightKeywords = [
    "AmbientLight",
    "DirectionalLight",
    "PointLight",
    "HemisphereLight",
  ];
  console.log("\n--- LIGHTING ANALYSIS ---");
  lightKeywords.forEach((keyword) => {
    let index = content.indexOf(keyword);
    let count = 0;
    while (index !== -1 && count < 5) {
      const start = Math.max(0, index - 100);
      const end = Math.min(content.length, index + 300);
      console.log(`\nContext around "${keyword}" (match ${count + 1}):`);
      console.log(content.substring(start, end));
      index = content.indexOf(keyword, index + 1);
      count++;
    }
  });
} catch (err) {
  console.error(err);
}
