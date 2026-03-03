window.getLogsByTime = async (
  { search, format },
  {
    startDate,
    endDate,
    scriptIds = [],
    deploymentIds = [],
    scriptTypes = [],
    type
  }
) => {
  console.log("Get logs by time:", {
    startDate,
    endDate,
    scriptIds,
    deploymentIds,
    scriptTypes,
    type
  });

  const dateToMinutes = (date) => date.getHours() * 60 + date.getMinutes();

  const filters = [];

  const formatDateSearch = (date) => {
    return format.format({ value: date, type: format.Type.DATE });
  };

  // Date filters
  if (startDate && endDate) {
    filters.push([
      "date",
      "between",
      formatDateSearch(startDate),
      formatDateSearch(endDate)
    ]);
  } else if (startDate) {
    filters.push(["date", "onorafter", formatDateSearch(startDate)]);
  } else if (endDate) {
    filters.push(["date", "onorbefore", formatDateSearch(endDate)]);
  } else {
    filters.push(["date", "within", "today"]);
  }

  // Time filters
  const startTime = startDate ? dateToMinutes(startDate) : null;
  const endTime = endDate ? dateToMinutes(endDate) : null;

  console.log("Time filters:", { startTime, endTime });

  const formula =
    "formulanumeric: (TO_NUMBER(TO_CHAR({time}, 'HH24')) * 60) + TO_NUMBER(TO_CHAR({time}, 'MI'))";

  if (startTime != null && endTime != null) {
    if (filters.length > 0) filters.push("AND");
    filters.push([formula, "between", startTime, endTime]);
  } else if (startTime != null) {
    if (filters.length > 0) filters.push("AND");
    filters.push([formula, "greaterthanorequalto", startTime]);
  } else if (endTime != null) {
    if (filters.length > 0) filters.push("AND");
    filters.push([formula, "lessthanorequalto", endTime]);
  }

  // Type filters
  if (type) {
    if (filters.length > 0) filters.push("AND");
    filters.push(["type", "anyof", type]);
  }
  if (scriptTypes.length > 0) {
    if (filters.length > 0) filters.push("AND");
    filters.push(["type", "anyof", scriptTypes]);
  }

  // Script / deployment filters
  if (scriptIds.length > 0) {
    if (filters.length > 0) filters.push("AND");
    filters.push(["script.internalid", "anyof", scriptIds]);
  }
  if (deploymentIds.length > 0) {
    if (filters.length > 0) filters.push("AND");
    filters.push(["scriptdeployment.internalid", "anyof", deploymentIds]);
  }

  // Helpers
  const getColumnKey = (col) =>
    col.join ? col.join + "." + col.name : col.name;
  const getColumnValue = (result, col) =>
    result.getValue({ name: col.name, join: col.join || null });

  console.log("Filters:", filters);

  // Create search
  const logsSearch = search.create({
    type: "scriptexecutionlog",
    filters: filters,
    columns: [
      search.createColumn({ name: "internalid" }),
      search.createColumn({ name: "view" }),
      search.createColumn({ name: "title" }),
      search.createColumn({ name: "type" }),
      search.createColumn({ name: "date" }),
      search.createColumn({ name: "time" }),
      search.createColumn({ name: "user" }),
      search.createColumn({ name: "scripttype" }),
      search.createColumn({ name: "detail" }),
      search.createColumn({
        name: "internalid",
        join: "script",
        label: "Script ID"
      }),
      search.createColumn({
        name: "internalid",
        join: "scriptDeployment",
        label: "Deployment ID"
      }),
      search.createColumn({
        name: "scriptid",
        join: "scriptDeployment",
        label: "Custom ID"
      }),
      search.createColumn({
        name: "name",
        join: "script",
        label: "Script Name"
      })
    ]
  });

  const results = [];
  const pagedData = await logsSearch.runPaged.promise({ pageSize: 1000 });

  console.log("Total logs count:", pagedData.count);

  const allResults = [];

  const MAX_RESULTS = 6000;
  const PAGE_SIZE = 1000;
  const MAX_PAGES = Math.ceil(MAX_RESULTS / PAGE_SIZE);

  const pageRangesToFetch = pagedData.pageRanges.slice(0, MAX_PAGES);

  const pages = await Promise.all(
    pageRangesToFetch.map(async (pageRange) => {
      const page = await pagedData.fetch.promise({ index: pageRange.index });
      return page;
    })
  );

  for (const page of pages) {
    allResults.push(...page.data);
  }

  console.log("Total results:", allResults.length);

  for (const result of allResults) {
    const row = {};

    result.columns.forEach((col) => {
      let value = getColumnValue(result, col);
      let key = getColumnKey(col);

      if (col.name === "date") {
        value = format.parse({ value, type: format.Type.DATE });
        key = "datetime";
      }

      if (col.name === "time") {
        const timeValue = format.parse({
          value,
          type: format.Type.TIMEOFDAY
        });

        const datetime = row["datetime"] || new Date();
        datetime.setHours(
          timeValue.getHours(),
          timeValue.getMinutes(),
          timeValue.getSeconds()
        );

        value = datetime;
        key = "datetime";
      }

      row[key] = value;
    });

    results.push(row);
  }

  return results;
};
