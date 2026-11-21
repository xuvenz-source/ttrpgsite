#!/usr/bin/env python3
"""R18-202 fail-closed anonymized original Storage AST and synthetic source gate."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

WORK="B10-R18-202"
MANIFEST=Path("staging/world-v2-b10-r18-202-storage-nested-or-ast/manifest.json")
PARENT={"pr":311,"head":"8aa37b14b99734073113137c2336149ef375d530",
        "focusedCiSuccess":44906600134,"generalCiSuccess":44906600199}
BLOBS={
 "scripts/release/r202_readonly_storage_policy_ast_root.sql":"3770db1ef838b55252ddf0e828a01d6184c739fa",
 "tests/world-v2-r18-202-postgres/run.sh":"f06ecd6a728ea645bc46cfc0fe5306229a890fe3",
 "tests/world-v2-r18-201-postgres/run.sh":"2fa7c3be2e52f409f6229523c6021af9f0e31b1d",
}
FIELD_ORDER=("anonymous_slot","root_boolean_expression","root_and","root_or",
             "any_or_node","any_and_node","ast_serialized_characters")
ROWS=[
 (1,True,True,False,False,True,3463),
 (2,True,True,False,True,True,10360),
 (3,True,True,False,False,True,2423),
]
TRUE_CLAIMS=("allThreeLiveSelectPolicyAstRootsAreAnd",
             "secondLiveSelectPolicyContainsNestedOrNode")
FALSE_CLAIMS=(
 "bucketScopeProvenForAllOrArms",
 "currentOriginalPermissivePolicyBooleanSemanticsApproved",
 "syntheticCrossBucketCounterexampleIsProofOfHostExploit",
 "userSignedRevokedActorCanMintNewUrlProven",
 "alreadyIssuedStorageSignedBearerRevoked",
 "all83HistoricalSemanticsApproved","all67PrivilegedFunctionChainsApproved",
 "realSignedMultiuserQaApproved","qaSqlInstallApproved",
 "productionDeployApproved",
)
RESTRICTIONS=(
 "readOnlyOriginalPgCatalogOnly","onlySyntheticPg17RlsPolicies",
 "noOriginalPoliciesNamesSqlBucketPathsObjectDataOrTokensExported",
 "noOriginalOrQaSqlWrites","noLiveAppEdgeOrVersionedMigrationEdits",
 "noMerge","noDeploy","noPaidResources",
)
NEXT=("Semantically inspect each current Storage SELECT policy's bucket-scoped "
 "AND/OR branches via private owner-only methodology or explicitly authorized signed QA, "
 "without disclosing original policy SQL or changing original/QA.")
RECEIPT="4d9f09d70ff13208700e4428b33910039029a4ac2d823c429bcce0ff500c2b53"

class AuditBlocked(Exception):pass

def unique(pairs):
 obj={}
 for k,v in pairs:
  if k in obj:raise AuditBlocked("DUPLICATE_KEY")
  obj[k]=v
 return obj

def strict(actual,expected,code):
 if not isinstance(actual,dict) or set(actual)!=set(expected):
  raise AuditBlocked(code)
 for key,value in expected.items():
  if actual[key]!=value or type(actual[key]) is not type(value):
   raise AuditBlocked(code)

def git_blob(raw):
 return hashlib.sha1(("blob "+str(len(raw))+"\0").encode()+raw).hexdigest()

def validate(data,root):
 if not isinstance(data,dict) or set(data)!={
    "schema","workPackage","date","decision","parent","ownerR200ReceiptSha256",
    "originalReadOnlyStorageAstAnonymousSlots","frozenGitBlobs",
    "technicalInterpretation","restrictions","nextGate"
 }:
  raise AuditBlocked("MANIFEST_SCHEMA")
 if type(data["schema"]) is not int or data["schema"]!=1 or data["workPackage"]!=WORK or data["date"]!="2026-11-21" or data["decision"]!="NO_GO":
  raise AuditBlocked("PROVENANCE")
 strict(data["parent"],PARENT,"PARENT")
 if data["ownerR200ReceiptSha256"]!=RECEIPT:raise AuditBlocked("PRIVATE_R200_RECEIPT")
 strict(data["frozenGitBlobs"],BLOBS,"SOURCE_INDEX")
 strict(data["technicalInterpretation"],
        {**{k:True for k in TRUE_CLAIMS},**{k:False for k in FALSE_CLAIMS}},
        "PREMATURE_APPROVAL")
 strict(data["restrictions"],{k:True for k in RESTRICTIONS},"HOSTED_SCOPE")
 if data["nextGate"]!=NEXT:raise AuditBlocked("NEXT_GATE")
 rows=data["originalReadOnlyStorageAstAnonymousSlots"]
 if not isinstance(rows,list) or len(rows)!=3:raise AuditBlocked("AST_ROWS")
 for row,values in zip(rows,ROWS):
  strict(row,dict(zip(FIELD_ORDER,values)),"AST_ROOT_DRIFT")
 for rel,sha in BLOBS.items():
  f=root/rel
  if not f.is_file() or f.is_symlink() or f.stat().st_size>128*1024:
   raise AuditBlocked("SOURCE_MISSING")
  if git_blob(f.read_bytes())!=sha:raise AuditBlocked("SOURCE_BYTES_CHANGED")
 return {
  "work_package":WORK,"decision":"NO_GO",
  "live_three_storage_policy_ast_roots_and":True,
  "one_live_policy_nested_or_ast_marker":True,
  "r201_and_r202_synthetic_test_sources_immutable":True,
  "current_policy_bucket_scope_safely_authorized":False,
  "hosted_revoked_actor_signed_qa_passed":False,
  "all_83_historical_semantics_approved":False,
  "all_67_privileged_call_graphs_approved":False,
  "production_or_qa_install_authorized":False,
  "no_original_policy_sql_or_user_data_exported":True,
 }

def main():
 ap=argparse.ArgumentParser(description="R202 source-only Storage AST NO_GO")
 ap.add_argument("--root",type=Path,default=Path.cwd())
 args=ap.parse_args()
 try:
  f=args.root/MANIFEST
  if not f.is_file() or f.is_symlink() or f.stat().st_size>8192:
   raise AuditBlocked("MANIFEST_MISSING")
  obj=json.loads(f.read_text(),object_pairs_hook=unique,
    parse_constant=lambda _:(_ for _ in ()).throw(AuditBlocked("NONFINITE")))
  print(json.dumps(validate(obj,args.root),sort_keys=True,indent=2))
  return 0
 except (AuditBlocked,OSError,TypeError,ValueError,KeyError,IndexError):
  print("R18-202 STORAGE_NESTED_OR_NO_GO: source/AST evidence drift.",file=sys.stderr)
  return 2

if __name__=="__main__":
 raise SystemExit(main())
