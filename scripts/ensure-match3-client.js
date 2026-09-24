const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoUrl = process.env.CLIENT_REPO_URL || "https://github.com/bonjourtoutlemond/mygame_client.git";
const repoRef = process.env.CLIENT_REPO_REF || "main";
const targetDir = path.resolve(process.env.CLIENT_ROOT || path.join(__dirname, "..", "..", "client"));
const entryFile = path.join(targetDir, "match-3-game", "index.html");

function log(message) {
  console.log(`[prepare-client] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function ensureGit() {
  const result = spawnSync("git", ["--version"], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    throw new Error("git is required to fetch the client repository");
  }
}

if (fs.existsSync(entryFile)) {
  log(`client already available at ${targetDir}`);
  process.exit(0);
}

ensureGit();
fs.mkdirSync(path.dirname(targetDir), { recursive: true });

if (fs.existsSync(path.join(targetDir, ".git"))) {
  log(`updating client repo in ${targetDir}`);
  run("git", ["fetch", "--depth", "1", "origin", repoRef], { cwd: targetDir });
  run("git", ["checkout", "FETCH_HEAD"], { cwd: targetDir });
} else if (!fs.existsSync(targetDir)) {
  log(`cloning ${repoUrl}#${repoRef} to ${targetDir}`);
  run("git", ["clone", "--depth", "1", "--branch", repoRef, repoUrl, targetDir]);
} else {
  throw new Error(`client target exists but is not a git checkout and ${entryFile} is missing`);
}

if (!fs.existsSync(entryFile)) {
  throw new Error(`client repository does not contain ${entryFile}`);
}
