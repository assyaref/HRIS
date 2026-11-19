import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * A column as `"table"."column"`. Use it for the OUTER column inside a
 * correlated subquery written with `sql```: Drizzle leaves columns
 * unqualified in single-table selects, and an unqualified `"id"` inside
 * `(SELECT … FROM other WHERE other.x = "id")` binds to the INNER table —
 * the count silently becomes 0.
 */
export function qualified(column: Column) {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}
