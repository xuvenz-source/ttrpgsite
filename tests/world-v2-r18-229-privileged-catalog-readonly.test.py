"""R229: fail-closed source-only audit test. NEVER contact any database."""
from copy import deepcopy
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
QUERY=ROOT/"scripts/release/r229_CURRENT_privileged_rpc_catalog_only.sql"
MANIFEST=ROOT/"staging/world-v2-b10-r18-229-privileged-rpc-catalog/manifest.json"
EXPECTED_FIELDS={
 "privileged_public_authenticated_functions":67,
 "postgres_owned":67,
 "bypassrls_owned":67,
 "empty_search_path":67,
 "explicit_authenticated_acl":67,
 "anon_execute":0,
 "uid_direct_marker":60,
 "uid_direct_absent":7,
 "uid_direct_or_static_callee":66,
 "uid_static_closure_absent":1,
 "common_member_guard_lex":53,
 "write_word_lex":42,
 "dynamic_sql_word_lex":0,
 "editable_metadata_word_lex":1,
 "exception_word_lex":7
}
MANIFEST_MAP={"privileged_public_authenticated_functions":"original_privileged_public_authenticated_count"}
FORBIDDEN_SCOPE=(
 "public.map_tokens","public.campaigns","public.characters",
 "public.battle_maps","auth.users","storage.objects",
 "pg_catalog.pg_get_functiondef","pg_read_file","pg_ls_dir",
 "lo_import","dblink","postgres_fdw"
)


def verify_manifest(d):
    if set(d["catalog_observations"]) != (set(EXPECTED_FIELDS)-{"privileged_public_authenticated_functions"}):
        raise ValueError("R229_CATALOG_RESULT_FIELDS_DRIFT")
    if d.get("original_privileged_public_authenticated_count") != 67:
        raise ValueError("R229_TARGET_COUNT_DRIFT")
    if d["catalog_observations"] != {k:v for k,v in EXPECTED_FIELDS.items()
                                    if k!="privileged_public_authenticated_functions"}:
        raise ValueError("R229_READONLY_AGGREGATES_DRIFT")
    if d.get("decision")!="NO_GO":
        raise ValueError("R229_FALSE_SECURITY_APPROVAL")
    for key,expected in {
      "source_exported":False,"application_rows_accessed":False,
      "application_functions_executed":False,"original_database_changed":False,
      "qa_database_accessed":False,"qa_database_changed":False,
      "merges_or_deployments":False}.items():
        if d.get(key) is not expected:
            raise ValueError("R229_UNSAFE_SCOPE_"+key)
    if d.get("target_scope") != "original TTRPG Site; pg_catalog-only read-only snapshot":
        raise ValueError("R229_TARGET_DRIFT")
    if d.get("schema")!="r229_current_privileged_catalog_aggregate_v1":
        raise ValueError("R229_SCHEMA_DRIFT")
    if set(d.get("known_open_risk_codes",[]))!={
      "FOG_STATUS_NONMEMBER_ORACLE_R104","REVOKED_SHEET_OWNER_R115",
      "REUSED_INVITE_REJOIN_R119","STALE_MOTION_SESSION_REAUTH_UNVERIFIED_R208",
      "USER_EDITABLE_DISPLAY_METADATA_AUTH_BOUNDARY_R207"}:
        raise ValueError("R229_RISK_SCOPE_DRIFT")
    if not isinstance(d.get("limitations"),list) or len(d["limitations"])!=6:
        raise ValueError("R229_LIMITATIONS_REQUIRED")
    obs=d["catalog_observations"]
    if obs["uid_direct_marker"]+obs["uid_direct_absent"]!=67:
        raise ValueError("R229_UID_COUNT_DRIFT")
    if obs["uid_direct_or_static_callee"]+obs["uid_static_closure_absent"]!=67:
        raise ValueError("R229_CALL_GRAPH_COUNT_DRIFT")
    if obs["uid_direct_marker"]>obs["uid_direct_or_static_callee"]:
        raise ValueError("R229_IMPOSSIBLE_DIRECT_CLOSURE_COUNT")


def verify_query(sql):
    clean="\n".join(line for line in sql.splitlines()
                    if not line.lstrip().startswith("--"))
    if clean.count(";")!=1 or not clean.strip().upper().startswith("WITH RECURSIVE CATALOG_ROUTINES AS"):
        raise ValueError("R229_NOT_ONE_CATALOG_SELECT")
    if re.search(r"(?mi)^\s*(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|CALL|DO|GRANT|REVOKE|COPY|EXECUTE)\b",clean):
        raise ValueError("R229_MUTATING_SQL_FORBIDDEN")
    if any(x in clean.lower() for x in FORBIDDEN_SCOPE):
        raise ValueError("R229_UNAUTHORIZED_RELATION_OR_FILE_ACCESS")
    for requisite in (
      "pg_catalog.pg_proc","pg_catalog.pg_namespace","pg_catalog.pg_roles",
      "has_function_privilege('authenticated'","has_function_privilege('anon'",
      "p.prosecdef","proconfig","proacl","bool_or","NOT e.dest_oid=ANY(w.seen)",
      "w.depth<7"
    ):
        if requisite.lower() not in clean.lower():
            raise ValueError("R229_CATALOG_REVIEW_INCOMPLETE_"+requisite)
    # Final projection must be count(*) aggregates only. There is no output
    # column for p.prosrc, pg_get_functiondef, function signatures or rows.
    final_start=clean.rfind("\nSELECT\n")
    if final_start<0:
        raise ValueError("R229_AGGREGATE_FINAL_SELECT_MISSING")
    final=clean[final_start:]
    if "FROM roots r JOIN closure c ON c.root_oid=r.oid" not in final:
        raise ValueError("R229_UNAUTHORIZED_QUERY_OUTPUT_RELATION")
    expected=set(EXPECTED_FIELDS)
    aliases=set(re.findall(r"\bAS\s+([a-z][a-z0-9_]*)",final,re.I))
    if aliases!=expected:
        raise ValueError("R229_OUTPUT_LEAK_OR_SCHEMA_DRIFT")
    # Every output field must result from COUNT, and no source body can be
    # directly projected as a result column. Regex is a supplemental guard,
    # not a SQL parser or a security proof.
    if final.count("count(*)")!=len(expected):
        raise ValueError("R229_UNEXPECTED_SELECT_PROJECTION")


class PrivilegedCatalogScope(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql=QUERY.read_text()
        cls.manifest=json.loads(MANIFEST.read_text())
    def test_pinned_current_catalog_sanitized_no_go(self):
        verify_manifest(self.manifest)
        verify_query(self.sql)
    def test_false_approval_or_db_access_denied(self):
        for key,value in {
            "decision":"GO",
            "source_exported":True,
            "application_rows_accessed":True,
            "application_functions_executed":True,
            "original_database_changed":True,
            "qa_database_accessed":True,
            "qa_database_changed":True,
            "merges_or_deployments":True
        }.items():
            obj=deepcopy(self.manifest)
            obj[key]=value
            with self.subTest(field=key),self.assertRaises(ValueError):
                verify_manifest(obj)
    def test_counter_drifts_denied(self):
        for key in self.manifest["catalog_observations"]:
            obj=deepcopy(self.manifest)
            obj["catalog_observations"][key]=999
            with self.subTest(field=key),self.assertRaises(ValueError):
                verify_manifest(obj)
    def test_extra_body_or_database_query_denied(self):
        for injection in (
            "\nSELECT pg_catalog.pg_get_functiondef(oid) FROM pg_catalog.pg_proc;",
            "\nSELECT * FROM public.campaigns;",
            "\nTRUNCATE TABLE public.map_tokens;",
            "\nCOPY public.characters TO '/tmp/leak';",
            "\nSELECT r.prosrc FROM roots r;",
        ):
            with self.subTest(injection=injection[:15]),self.assertRaises(ValueError):
                verify_query(self.sql+injection)

if __name__=="__main__":
    unittest.main()
