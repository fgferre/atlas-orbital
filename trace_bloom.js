import fs from "fs";
const path =
  "c:/Users/fgfer/OneDrive/Documents/GitHub/atlas-orbital/_legacy/nasa eyes of the solar system study/app.js";

try {
  const content = fs.readFileSync(path, "utf8");

  const keyword = ".setBloom(";
  let index = content.indexOf(keyword);
  let count = 0;
  while (index !== -1 && count < 10) {
    const start = Math.max(0, index - 100);
    const end = Math.min(content.length, index + 300);
    console.log(`\nContext around "${keyword}" (match ${count + 1}):`);
    console.log(content.substring(start, end));
    index = content.indexOf(keyword, index + 1);
    count++;
  }
} catch (err) {
  console.error(err);
}
