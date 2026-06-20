export function isMissingTable(error) {
  const message = error?.message?.toLowerCase?.() || "";
  return /relation\s+["']?[^"']+["']?\s+does not exist/i.test(message) || message.includes("could not find the table");
}

export function isMissingColumn(error, columnName) {
  const message = error?.message?.toLowerCase?.() || "";
  const name = columnName.toLowerCase();
  return message.includes(`could not find the '${name}' column`) || message.includes(`column "${name}" does not exist`);
}
