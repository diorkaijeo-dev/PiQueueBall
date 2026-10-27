"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const webDirectory = path.join(projectRoot, "www");

fs.rmSync(webDirectory, { recursive: true, force: true });
fs.mkdirSync(webDirectory, { recursive: true });

for (const name of fs.readdirSync(projectRoot)) {
  if (/\.(html|js|css)$/i.test(name)) {
    fs.copyFileSync(path.join(projectRoot, name), path.join(webDirectory, name));
  }
}

fs.cpSync(path.join(projectRoot, "assets"), path.join(webDirectory, "assets"), {
  recursive: true
});
