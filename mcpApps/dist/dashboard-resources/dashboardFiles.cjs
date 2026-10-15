const fs = require("node:fs/promises");
const path = require("node:path");
const sourceName = (name) => {
  if (
    typeof name !== "string" ||
    !name ||
    path.isAbsolute(name) ||
    /^[A-Za-z]:/.test(name) ||
    name
      .split(/[\\/]/)
      .some(
        (s) =>
          !s ||
          s === ".." ||
          s === "." ||
          ["__proto__", "constructor", "prototype"].includes(s),
      )
  )
    throw new Error("Source file names must be portable relative paths.");
  return name;
};
const readLimited = async (file) => {
  if ((await fs.stat(file)).size > 750000)
    throw new Error("Dashboard source exceeds 750 KB.");
  return fs.readFile(file, "utf8");
};
const parseResult = (result) => {
  if (result?.isError)
    throw new Error(
      result.content?.find((c) => c.type === "text")?.text ||
        "Dashboard export failed.",
    );
  return JSON.parse(result.content.find((c) => c.type === "text").text);
};
/** File I/O only on the local companion, never in the extension or remote account. */
async function callDashboardWithFiles(name, args, call) {
  args = { ...args };
  if (name === "magic_netsuite_dashboard_code" && args.filePath) {
    if (args.source !== undefined)
      throw new Error("Supply source or filePath, not both.");
    args.source = await readLimited(path.resolve(args.filePath));
    delete args.filePath;
  }
  if (name === "magic_netsuite_dashboard_import" && args.filePath) {
    if (args.payload) throw new Error("Supply payload or filePath, not both.");
    args.payload = JSON.parse(await readLimited(path.resolve(args.filePath)));
    delete args.filePath;
  }
  if (name !== "magic_netsuite_dashboard_export" || !args.directory)
    return call(name, args);
  const directory = path.resolve(args.directory);
  delete args.directory;
  const result = await call(name, args);
  const payload = parseResult(result);
  if (payload.format !== "magic-netsuite-dashboard")
    throw new Error("Invalid dashboard export.");
  const files = [
    ["dashboard.json", JSON.stringify(payload, null, 2) + "\n"],
    ...Object.entries(payload.definition.sourceFiles || {}),
  ];
  const targets = files.map(([name, source]) => {
    sourceName(name);
    if (name !== "dashboard.json" && name.toLowerCase() === "dashboard.json")
      throw new Error("Source conflicts with dashboard.json.");
    const target = path.resolve(directory, name);
    if (!target.startsWith(directory + path.sep))
      throw new Error("Source escapes export directory.");
    return { target, source };
  });
  if (
    new Set(targets.map((t) => t.target.toLowerCase())).size !== targets.length
  )
    throw new Error("Source names conflict with export paths.");
  for (const { target } of targets) {
    let existing;
    try {
      existing = await fs.lstat(target);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (existing?.isSymbolicLink())
      throw new Error("Export target cannot be a symbolic link.");
    if (existing && !args.overwrite)
      throw new Error(
        `File already exists: ${target}. Set overwrite:true to replace it.`,
      );
    // Refuse symlink ancestors; a source path must stay within the named export folder.
    let parent = path.dirname(target);
    while (parent !== path.dirname(directory)) {
      try {
        if ((await fs.lstat(parent)).isSymbolicLink())
          throw new Error("Export directory cannot contain symbolic links.");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (parent === directory) break;
      parent = path.dirname(parent);
    }
  }
  for (const { target, source } of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, source, {
      encoding: "utf8",
      flag: args.overwrite ? "w" : "wx",
    });
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          directory,
          files: targets.map((t) => t.target),
          exported: true,
        }),
      },
    ],
  };
}
module.exports = { callDashboardWithFiles, sourceName };
