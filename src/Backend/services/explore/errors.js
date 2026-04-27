export function isMissingTable(error) {
  const message = error?.message?.toLowerCase?.() || "";
  return message.includes("does not exist") || message.includes("could not find the table") || message.includes("relation");
}

export function isMissingColumn(error, columnName) {
  const message = error?.message?.toLowerCase?.() || "";
  const name = columnName.toLowerCase();
  return message.includes(`could not find the '${name}' column`) || message.includes(`column "${name}" does not exist`);
}
