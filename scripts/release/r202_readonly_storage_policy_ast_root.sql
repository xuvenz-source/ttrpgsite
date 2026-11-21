-- R202 read-only anonymized current Storage policy AST root grouping.
-- policy polqual stays in Postgres; no SQL, policy names, bucket names,
-- object keys, user identities, JWTs or signed bearer URLs in result.
-- Node-string prefix is a structural indicator, NOT a semantic proof of
-- unconditional bucket constraints across nested AND/OR branches.
WITH policy AS (
 SELECT p.oid,p.polqual::text AS ast,
  COALESCE(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'') AS expr
 FROM pg_catalog.pg_policy p
 JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname='objects' AND p.polcmd IN ('r','*')
)
SELECT row_number() OVER (ORDER BY md5(expr),oid)::int AS anonymous_slot,
  (ast ~ '^\{BOOLEXPR') AS root_boolean_expression,
  (ast ~ '^\{BOOLEXPR :boolop and(\s|$)') AS root_and,
  (ast ~ '^\{BOOLEXPR :boolop or(\s|$)') AS root_or,
  (ast ~ ':boolop or(\s|$)') AS any_or_node,
  (ast ~ ':boolop and(\s|$)') AS any_and_node,
  length(ast)::int AS ast_serialized_characters
FROM policy ORDER BY anonymous_slot;
