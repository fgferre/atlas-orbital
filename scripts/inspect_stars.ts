import fs from "fs";
import path from "path";
import https from "https";

const url = "https://raw.githack.com/paiml/BSC5P-JSON/master/bsc5p_min.json";

console.log("Fetching star data from githack...");

https
  .get(url, { headers: { "User-Agent": "Node.js" } }, (res) => {
    console.log("Status Code:", res.statusCode);
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      console.log("First 200 chars:", data.substring(0, 200));
      try {
        const stars = JSON.parse(data);
        console.log("Total stars:", stars.length);
        console.log("First star structure:", JSON.stringify(stars[0], null, 2));
      } catch (e) {
        console.error("Error parsing JSON:", e);
      }
    });
  })
  .on("error", (err) => {
    console.error("Error fetching data:", err);
  });
