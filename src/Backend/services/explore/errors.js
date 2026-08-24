export function isMissingTable(error) {
  const message = error?.message?.toLowerCase?.() || "";
  return /relation\s+["']?[^"']+["']?\s+does not exist/i.test(message) || message.includes("could not find the table");
}

export function isMissingColumn(error, columnName) {
  const message = error?.message?.toLowerCase?.() || "";
  const name = columnName.toLowerCase();
  return message.includes(`could not find the '${name}' column`) || message.includes(`column "${name}" does not exist`);
}

// A Postgres unique-constraint violation (e.g. the idempotency index catching a
// duplicate client_post_id). PostgREST surfaces the SQLSTATE as error.code.
export function isUniqueViolation(error) {
  const message = error?.message?.toLowerCase?.() || "";
  return error?.code === "23505" || message.includes("duplicate key value") || message.includes("violates unique constraint");
}
