const normalizeCustomListSearchText = (value) =>
  String(value ?? "").trim().toLowerCase();

const readCustomListSearchValue = (result, columnName) => {
  try {
    return result.getValue({ name: columnName });
  } catch {
    try {
      return result.getValue(columnName);
    } catch {
      return null;
    }
  }
};

const readCustomListSublistValue = (rec, fieldId, line) => {
  try {
    return rec.getSublistValue({
      sublistId: "customvalue",
      fieldId,
      line
    });
  } catch {
    return null;
  }
};

window.getCustomLists = async (N, { query = "", includeInactive = false } = {}) => {
  const { search } = N;
  const needle = normalizeCustomListSearchText(query);
  const filters = includeInactive ? [] : [["isinactive", "is", "F"]];

  const customListSearch = search.create({
    type: "customlist",
    filters,
    columns: ["name", "internalid", "isinactive"]
  });

  const lists = [];
  await customListSearch.run().each((result) => {
    const name = readCustomListSearchValue(result, "name");
    const internalId = readCustomListSearchValue(result, "internalid");
    const isInactive = readCustomListSearchValue(result, "isinactive");
    const list = {
      name,
      internalId: internalId == null ? "" : String(internalId),
      isInactive: isInactive === true || isInactive === "T"
    };

    const haystack = `${list.name ?? ""} ${list.internalId}`.toLowerCase();
    if (!needle || haystack.includes(needle)) {
      lists.push(list);
    }

    return true;
  });

  return {
    success: true,
    count: lists.length,
    lists
  };
};

window.getCustomListItems = (N, { listId, includeInactive = false } = {}) => {
  const { record } = N;
  const id = String(listId ?? "").trim();
  if (!id) throw new Error("listId is required.");

  const listRec = record.load({
    type: "customlist",
    id
  });

  const valueCount = listRec.getLineCount({ sublistId: "customvalue" });
  const items = [];

  for (let line = 0; line < valueCount; line++) {
    const value = readCustomListSublistValue(listRec, "value", line);
    const valueId = readCustomListSublistValue(listRec, "valueid", line);
    const isInactive = readCustomListSublistValue(listRec, "isinactive", line);
    const item = {
      line,
      internalId: value == null ? "" : String(value),
      display: valueId == null ? "" : String(valueId),
      isInactive: isInactive === true || isInactive === "T"
    };

    if (includeInactive || !item.isInactive) {
      items.push(item);
    }
  }

  return {
    success: true,
    listId: id,
    name: (() => {
      try {
        return listRec.getValue({ fieldId: "name" });
      } catch {
        return null;
      }
    })(),
    count: items.length,
    totalLineCount: valueCount,
    items
  };
};
