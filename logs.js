/**
 * Retrieves logs based on optional startTime and/or endTime
 * @param {string} startTime - "HH:MM", logs after this time (optional)
 * @param {string} endTime - "HH:MM", logs before this time (optional)
 * @returns {search.Search} - A saved search object ready to run
 */
const getLogsByTime = ({ startTime, endTime }) => {
  const timeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.includes(":")) return NaN;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  };

  const filters = [["date", "within", "today"]];

  // Build formula for total minutes
  const formula =
    "formulanumeric: (TO_NUMBER(TO_CHAR({time}, 'HH24')) * 60) + TO_NUMBER(TO_CHAR({time}, 'MI'))";

  if (startTime && endTime) {
    filters.push("AND");
    filters.push([
      formula,
      "between",
      timeToMinutes(startTime),
      timeToMinutes(endTime),
    ]);
  } else if (startTime) {
    filters.push("AND");
    filters.push([formula, "greaterthan", timeToMinutes(startTime)]);
  } else if (endTime) {
    filters.push("AND");
    filters.push([formula, "lessthanorequalto", timeToMinutes(endTime)]);
  }

  return search.create({
    type: "scriptexecutionlog",
    filters,
    columns: [
      search.createColumn({ name: "view" }),
      search.createColumn({ name: "title" }),
      search.createColumn({ name: "type" }),
      search.createColumn({ name: "date" }),
      search.createColumn({ name: "time" }),
      search.createColumn({ name: "user" }),
      search.createColumn({ name: "scripttype" }),
      search.createColumn({ name: "detail" }),
    ],
  });
};

const logsSearch = getLogsByTime({ startTime: "8:23", endTime: "8:46" });
console.log("count: ", logsSearch.runPaged().count);

const results = [];
logsSearch
  .runPaged({ pageSize: 1000 })
  .fetch({ index: 0 })
  .data.forEach((r) => {
    results.push(
      r.columns.reduce((acc, col) => {
        acc[col.name] = r.getValue(col);
        return acc;
      }, {})
    );
  });

console.log("Results", results);
