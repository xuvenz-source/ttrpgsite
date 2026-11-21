"""R199 sanitized R198 receipt, Storage aggregate, Git source and NO_GO tests."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(".").resolve()
spec=importlib.util.spec_from_file_location(
 "r199",ROOT/"scripts/release/r199_validate_signed_url_release_gates.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
MANIFEST=ROOT/gate.MANIFEST

class StorageReleaseGate(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.data=json.loads(MANIFEST.read_text())

 def test_exact_bounded_original_storage_context_still_no_go(self):
  result=gate.validate(deepcopy(self.data),ROOT)
  self.assertEqual(result["decision"],"NO_GO")
  self.assertTrue(result["r198_private_original_to_live_helper_parity_reconciled"])
  self.assertTrue(result["read_only_storage_bucket_and_rls_counts_verified"])
  self.assertTrue(result["current_signed_asset_source_bytes_verified"])
  self.assertFalse(result["signed_url_issuance_rejected_for_revoked_hosted_user_proven"])
  self.assertFalse(result["existing_3600s_bearer_urls_remotely_revoked"])
  self.assertFalse(result["hosted_sql_or_production_release_authorized"])
  for forbidden in ("r106-original","raw_user_meta_data","CREATE FUNCTION",
                    "signedUrl=","eyJ"):
   self.assertNotIn(forbidden,json.dumps(result))

 def test_private_sheet_evidence_and_latest_location_cannot_be_upgraded(self):
  for name,value in (
   ("sizeBytes",1700),("sha256","0"*64),("historySha256Verified",82),
   ("chronologyUnique",False),
   ("prioritySortedR111DocketIndexNotChronology",28),
   ("executableSqlStatementOrdinal",8),
   ("latestCurrentBodySha256AndByteSizeMatch",False),
   ("latestDirectMembershipMarker",True),
   ("sqlOrSecretsExported",True)
  ):
   item=deepcopy(self.data)
   item["ownerPrivateR198Receipt"][name]=value
   with self.subTest(name=name),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)

 def test_storage_rls_and_permissive_or_counts_cannot_be_forged(self):
  for key,val in (
   ("storage_buckets_private",2),("storage_buckets_public",1),
   ("objects_rls_enabled",False),("select_applicable_policies",2),
   ("permissive_select_applicable",0),("restrictive_select_applicable",1),
   ("direct_membership_marker_select_policies",1),
   ("map_view_helper_marker_select_policies",0),
   ("authenticated_or_public_select_policies",2),
   ("total_policies",9)
  ):
   item=deepcopy(self.data)
   item["originalReadOnlyStorageSnapshot"][key]=val
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)

 def test_revocation_lifetime_claims_and_hosted_go_denied(self):
  for key,value in (
   ("signedUrlSeconds",60),("localCacheTtlMs",60_000),
   ("clearResignsActiveSubscribers",False),
   ("alreadyIssuedBearerRevokedByClientCacheClear",True),
   ("alreadyIssuedBearerRevokedByAuthJwtKeyRotation",True),
   ("supabaseSignedUrlRevocationRequiresSupport",False),
   ("unmountedR123Sentinel",False)
  ):
   item=deepcopy(self.data)
   item["existingClientSource"][key]=value
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  for key in gate.BLOCKED:
   item=deepcopy(self.data)
   item["releaseApprovals"][key]=True
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)
  for key in gate.LIMITS:
   item=deepcopy(self.data)
   item["restrictions"][key]=False
   with self.subTest(key=key),self.assertRaises(gate.AuditBlocked):
    gate.validate(item,ROOT)

 def test_code_and_catalog_immutable_sha_pin(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for rel in gate.BLOBS:
    target=root/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/rel,target)
    self.assertEqual(gate.git_blob(target.read_bytes()),gate.BLOBS[rel])
   target=root/"src/SignedAssetUrls.js"
   target.write_bytes(target.read_bytes()+b"\n// synthetic accidental edit")
   with self.assertRaises(gate.AuditBlocked):
    gate.validate(deepcopy(self.data),root)

 def test_read_only_original_catalog_query_never_returns_raw_policy_expressions(self):
  sql=(ROOT/"scripts/release/r199_readonly_storage_policy_aggregates.sql").read_text()
  self.assertIn("pg_catalog.pg_policy",sql)
  self.assertIn("pg_catalog.pg_get_expr",sql)
  self.assertIn("COUNT",sql.upper())
  self.assertNotIn("SELECT polqual",sql)
  self.assertNotIn("signed_url",sql.lower())
  for unsafe in ("UPDATE storage.","DELETE FROM storage.","INSERT INTO storage.",
                  "ALTER TABLE storage.","TRUNCATE storage.","DROP TABLE storage."):
   self.assertNotIn(unsafe,sql)

 def test_duplicate_json_and_type_coercion_rejected(self):
  with self.assertRaises(gate.AuditBlocked):
   json.loads('{"decision":"NO_GO","decision":"GO"}',
    object_pairs_hook=gate.no_duplicate_json)
  item=deepcopy(self.data)
  item["schema"]=True
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)
  item=deepcopy(self.data)
  item["originalReadOnlyStorageSnapshot"]["total_policies"]=8.0
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)
  item=deepcopy(self.data)
  item["extra"]="GO"
  with self.assertRaises(gate.AuditBlocked):
   gate.validate(item,ROOT)

if __name__=="__main__":
 unittest.main()
