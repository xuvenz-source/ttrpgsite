-- B10-R18-203: live original Storage SELECT policy top-level bucket guard.
-- READ-ONLY SELECT ONLY. Policy SQL and pg_node_tree stay INSIDE PostgreSQL.
-- Returns anonymized stable slots, strict structural boolean fields and only
-- aggregate DISTINCT bucket-value count. NO names, bucket values, object paths,
-- user IDs, JWTs, signed URLs or raw policy SQL leave the database.
--
-- Method: pg_policy.polqual root BOOLEXPR AND :args list is scanned for
-- balanced top-level node braces. First child must be a top-level equality
-- OPEXPR containing storage.objects.bucket_id Var and a CONST, without OR.
-- This is an internal pg_node_tree structural marker, not an independently
-- specified parser or functional signed-user authorization proof.
WITH policy AS (
 SELECT p.oid AS policy_id,p.polqual::text AS ast,
   COALESCE(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'') AS expr
 FROM pg_catalog.pg_policy p
 JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname='objects'
 AND p.polcmd IN ('r','*')
), slot AS (
 SELECT policy_id,ast,expr,
   row_number() OVER(ORDER BY md5(expr),policy_id)::int AS anonymous_slot,
   strpos(ast,':args (')+7 AS root_args_start,
   (ast ~ '^\{BOOLEXPR :boolop and(\s|$)') AS root_and,
   substring(expr FROM '\mbucket_id\M\s*=\s*''([^'']+)''')
      AS PRIVATE_bucket_value_not_selected
 FROM policy
), char_scan AS (
 SELECT s.policy_id,s.anonymous_slot,s.ast,i,
   substr(s.ast,i,1) AS chr
 FROM slot s CROSS JOIN LATERAL
   generate_series(s.root_args_start,length(s.ast)) i
 WHERE s.root_args_start>7 AND s.root_and
), depths AS (
 SELECT *,
  sum(CASE chr WHEN '{' THEN 1 WHEN '}' THEN -1 ELSE 0 END)
    OVER(PARTITION BY policy_id ORDER BY i
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS brace_depth
 FROM char_scan
), starts AS (
 SELECT policy_id,anonymous_slot,ast,i,
  row_number() OVER(PARTITION BY policy_id ORDER BY i) AS child_number
 FROM depths WHERE chr='{' AND brace_depth=1
), ends AS (
 SELECT policy_id,i,
   row_number() OVER(PARTITION BY policy_id ORDER BY i) AS child_number
 FROM depths WHERE chr='}' AND brace_depth=0
), root_children AS (
 SELECT s.anonymous_slot,s.child_number,
   substring(s.ast FROM s.i FOR e.i-s.i+1) AS child_ast
 FROM starts s JOIN ends e
 ON e.policy_id=s.policy_id AND e.child_number=s.child_number
 WHERE e.i>s.i
), parsed AS (
 SELECT r.anonymous_slot,r.child_number,r.child_ast,
  (r.child_ast ~ '^\{OPEXPR ') AS root_operator,
  substring(r.child_ast FROM '^\{OPEXPR :opno ([0-9]+)')
    AS root_op_oid,
  (r.child_ast ~ (
    '\{VAR :varno 1 :varattno '||
    (SELECT attnum::text FROM pg_catalog.pg_attribute
      WHERE attrelid='storage.objects'::regclass AND attname='bucket_id'
      AND NOT attisdropped)
    ||'(\s|$)')) AS references_bucket_var,
  (r.child_ast ~ '\{CONST ') AS has_const,
  (r.child_ast ~ ':boolop or(\s|$)') AS has_nested_or
 FROM root_children r
), with_operator AS (
 SELECT p.*,
   COALESCE(op.oprname='=',false) AS is_equality
 FROM parsed p
 LEFT JOIN pg_catalog.pg_operator op ON op.oid=
   CASE WHEN p.root_op_oid IS NOT NULL THEN p.root_op_oid::oid END
), per_slot AS (
 SELECT s.anonymous_slot,s.root_and,
  count(w.child_number)::int AS root_and_children,
  bool_or(w.child_number=1 AND w.root_operator AND w.is_equality
   AND w.references_bucket_var AND w.has_const AND NOT w.has_nested_or)
   AS first_child_bucket_equality_constant,
  bool_or(w.child_number>1 AND w.has_nested_or) AS nested_or_only_beyond_first,
  bool_or(w.child_number=1 AND w.has_nested_or) AS first_child_contains_or,
  (s.PRIVATE_bucket_value_not_selected IS NOT NULL) AS has_bucket_literal
 FROM slot s LEFT JOIN with_operator w USING(anonymous_slot)
 GROUP BY s.anonymous_slot,s.root_and,s.PRIVATE_bucket_value_not_selected
), distinct_values AS (
 SELECT count(DISTINCT PRIVATE_bucket_value_not_selected)::int
   AS distinct_private_bucket_values
 FROM slot
)
SELECT p.anonymous_slot,p.root_and,p.root_and_children,
 p.first_child_bucket_equality_constant,p.first_child_contains_or,
 p.nested_or_only_beyond_first,p.has_bucket_literal,
 d.distinct_private_bucket_values
FROM per_slot p CROSS JOIN distinct_values d
ORDER BY anonymous_slot;
