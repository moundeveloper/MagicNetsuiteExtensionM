// suiteScriptScraper.js
// Scrapes SuiteScript 2.x module documentation from NetSuite help pages.
// Runs in content script context — fetches same-origin netsuite.com help pages directly.
//
// IMPORTANT: capture the real fetch BEFORE fetchInterceptor.js wraps window.fetch,
// so our requests don't trigger the monitoring interceptor / background.js noise.
const _fetch = fetch;

const CONCURRENCY_LIMIT = 4;
const MODULES_PAGE_PATH = "/app/help/helpcenter.nl?fid=chapter_4220488571.html";

// ─── Concurrency limiter ──────────────────────────────────────────────────────

const runWithLimit = async (tasks, limit = CONCURRENCY_LIMIT) => {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = task().then((res) => {
      executing.splice(executing.indexOf(p), 1);
      return res;
    });
    results.push(p);
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const fetchDoc = async (url) => {
  const response = await _fetch(url);
  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
};

// ─── Module list ──────────────────────────────────────────────────────────────

/**
 * Fetches the SuiteScript 2.x Modules index page and returns all module links.
 * @param {string} baseUrl  e.g. "https://2978464.app.netsuite.com"
 * @returns {Promise<{name: string, url: string}[] | null>}
 */
const getAllModuleLinks = async (baseUrl) => {
  const modulePageUrl = baseUrl + MODULES_PAGE_PATH;
  const doc = await fetchDoc(modulePageUrl);

  const heading = Array.from(doc.querySelectorAll("h1")).find((h) =>
    h.textContent.includes("SuiteScript 2.x Modules")
  );
  if (!heading) return null;

  const table = heading.closest("div.nshelp_page")?.querySelector("table.grid");
  if (!table) return null;

  const rows = table.querySelectorAll("tbody tr");
  return Array.from(rows)
    .map((row) => row.querySelector("td p a"))
    .filter(Boolean)
    .map((link) => {
      const href = link.getAttribute("href");
      return {
        name: link.textContent.trim(),
        url: new URL(href, modulePageUrl).href,
      };
    });
};

// ─── Parsers ──────────────────────────────────────────────────────────────────

const parseOverviewTable = (table) => {
  const result = {};
  Array.from(table.querySelectorAll("tr")).forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 2) return;
    const key = cells[0].textContent.trim();
    const paragraphs = Array.from(cells[1].querySelectorAll("p"));
    result[key] = paragraphs.length
      ? paragraphs.map((p) => p.textContent.trim()).join("\n\n")
      : cells[1].textContent.trim();
  });
  return result;
};

const parseParametersTable = (tableContainer) => {
  const headers = Array.from(tableContainer.querySelectorAll("thead th")).map(
    (th) => th.textContent.trim()
  );
  const rows = Array.from(tableContainer.querySelectorAll("tbody tr"));

  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const rowData = {};
    cells.forEach((cell, index) => {
      const header = headers[index];
      const paragraphs = Array.from(cell.querySelectorAll("p"));
      const lists = Array.from(cell.querySelectorAll("ul"));
      const valueParts = [];
      if (paragraphs.length) valueParts.push(...paragraphs.map((p) => p.textContent.trim()));
      if (lists.length) {
        lists.forEach((list) => {
          const items = Array.from(list.querySelectorAll("li")).map(
            (li) => `- ${li.textContent.trim()}`
          );
          valueParts.push(items.join("\n"));
        });
      }
      rowData[header] = valueParts.length ? valueParts.join("\n\n") : cell.textContent.trim();
    });
    return rowData;
  });
};

const parseEnumValues = (container) => {
  const values = [];
  const cells = container.querySelectorAll("td");
  cells.forEach((cell) => {
    const codeEls = cell.querySelectorAll("code");
    codeEls.forEach((code) => {
      const value = code.textContent.trim();
      if (value) values.push(value);
    });
  });
  return values;
};

const getDetails = async (url) => {
  const doc = await fetchDoc(url);
  const details = { overview: null, notes: [], parameters: [], errors: [], syntax: null, enumValues: [] };

  const overviewTable = doc.querySelector("table.grid");
  if (overviewTable) {
    details.overview = parseOverviewTable(overviewTable);
  }

  doc.querySelectorAll("h2").forEach((section) => {
    const sectionTitle = section.textContent.trim().toLowerCase();

    if (sectionTitle === "syntax") {
      const codeEl = doc.querySelector("pre code");
      details.syntax = codeEl ? codeEl.textContent.trim() : null;
      return;
    }

    if (sectionTitle === "values") {
      let next = section.nextElementSibling;
      while (next) {
        if (next.tagName === "DIV" && next.querySelector("table.grid")) {
          details.enumValues = parseEnumValues(next);
          break;
        }
        next = next.nextElementSibling;
      }
      return;
    }

    let next = section.nextElementSibling;
    while (next) {
      if (next.querySelector?.("table.grid")) {
        details[sectionTitle] = parseParametersTable(next) || [];
        break;
      }
      next = next.nextElementSibling;
    }
  });

  return details;
};

const parseTable = async (table, pageUrl) => {
  const rows = Array.from(table.querySelectorAll("tr"));
  const headers = Array.from(rows.shift().querySelectorAll("th")).map((th) =>
    th.textContent.trim()
  );

  const data = [];
  const rowspanMap = {};
  const detailPromises = [];

  for (const row of rows) {
    const rowData = {};
    let colIndex = 0;
    const cells = Array.from(row.children);

    for (const cell of cells) {
      while (rowspanMap[colIndex]) {
        rowData[headers[colIndex]] = rowspanMap[colIndex].value;
        rowspanMap[colIndex].remaining--;
        if (rowspanMap[colIndex].remaining === 0) delete rowspanMap[colIndex];
        colIndex++;
      }

      const value = cell.textContent.trim();
      const colspan = parseInt(cell.getAttribute("colspan") || "1");
      const rowspan = parseInt(cell.getAttribute("rowspan") || "1");

      for (let i = 0; i < colspan; i++) {
        if (headers[colIndex] === "Name") {
          const nameHref = cell.querySelector("a")?.getAttribute("href");
          rowData[headers[colIndex]] = value.toUpperCase();
          if (nameHref) {
            const detailUrl = new URL(nameHref, pageUrl).href;
            const p = getDetails(detailUrl).then((details) => {
              rowData.details = details;
            });
            detailPromises.push(p);
          }
        } else {
          rowData[headers[colIndex]] = value;
        }
        if (rowspan > 1) {
          rowspanMap[colIndex] = { value, remaining: rowspan - 1 };
        }
        colIndex++;
      }
    }

    while (colIndex < headers.length) {
      if (rowspanMap[colIndex]) {
        rowData[headers[colIndex]] = rowspanMap[colIndex].value;
        rowspanMap[colIndex].remaining--;
        if (rowspanMap[colIndex].remaining === 0) delete rowspanMap[colIndex];
      }
      colIndex++;
    }

    data.push(rowData);
  }

  await Promise.all(detailPromises);
  return data;
};

const fetchModuleData = async (url) => {
  const doc = await fetchDoc(url);
  const sections = Array.from(doc.querySelectorAll("h2"));
  const moduleData = [];

  const sectionResults = await Promise.all(
    sections.map(async (section) => {
      const sectionTitle = section.textContent.trim();
      const tables = [];

      let next = section.nextElementSibling;
      while (next && next.tagName !== "H2") {
        const table = next.querySelector?.("table.grid");
        if (table) tables.push(table);
        next = next.nextElementSibling;
      }

      if (!tables.length) return null;

      const parsedTables = await Promise.all(tables.map((t) => parseTable(t, url)));
      return parsedTables.map((tableData) => ({ section: sectionTitle, table: tableData }));
    })
  );

  sectionResults.filter(Boolean).forEach((sectionTables) => moduleData.push(...sectionTables));
  return moduleData;
};

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Entry point called from messageListener.js when action = SCRAPE_SUITESCRIPT_MODULES.
 * Fetches the modules index page using baseUrl, then streams progress via sendChunk.
 *
 * @param {string} baseUrl   e.g. "https://2978464.app.netsuite.com"
 * @param {Function} sendChunk  callback for progress/complete/error chunks
 *
 * Chunk shapes:
 *   { type: 'error', error: string }
 *   { type: 'progress', current: n, total: n, moduleName: string }
 *   { type: 'complete', data: RawModule[] }
 */
export const scrapeSuiteScriptModules = async (baseUrl, sendChunk) => {
  if (!baseUrl) {
    sendChunk({ type: "error", error: "No NetSuite base URL provided." });
    return;
  }

  let moduleLinks;
  try {
    moduleLinks = await getAllModuleLinks(baseUrl);
  } catch (err) {
    sendChunk({ type: "error", error: `Failed to load modules index: ${err.message}` });
    return;
  }

  if (!moduleLinks || moduleLinks.length === 0) {
    sendChunk({ type: "error", error: "Could not find SuiteScript 2.x Modules table on the help page." });
    return;
  }

  const total = moduleLinks.length;
  let current = 0;

  const tasks = moduleLinks.map((mod) => async () => {
    const data = await fetchModuleData(mod.url);
    current++;
    sendChunk({ type: "progress", current, total, moduleName: mod.name });
    return { module: mod.name, data };
  });

  try {
    const allModules = await runWithLimit(tasks, CONCURRENCY_LIMIT);
    sendChunk({ type: "complete", data: allModules });
  } catch (err) {
    sendChunk({ type: "error", error: err.message });
  }
};
